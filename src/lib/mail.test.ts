import { describe, expect, it } from "vitest";
import {
  buildMessage,
  composeInvite,
  composeInvoice,
  composeQuote,
  composeReset,
  encodeHeader,
  formatAddress,
} from "./mail";
import { defaultSender, parseSmtpUrl, SmtpError } from "./smtp";

const client = { name: "Sam Ortega", email: "sam@exemple.fr" };
const advisor = { name: "Camille Roy", email: "camille@escale.fr" };

describe("encodeHeader", () => {
  it("laisse l'ASCII tranquille", () => {
    expect(encodeHeader("Votre devis DEV-2026-0001")).toBe("Votre devis DEV-2026-0001");
  });

  it("encode ce qu'un relais abîmerait", () => {
    // Un objet accentué doit survivre au trajet, quel que soit le serveur.
    const encoded = encodeHeader("Votre séjour à Oslo");
    expect(encoded).toMatch(/^=\?UTF-8\?B\?.+\?=$/);
    expect(Buffer.from(encoded.slice(10, -2), "base64").toString("utf8")).toBe(
      "Votre séjour à Oslo",
    );
  });
});

describe("formatAddress", () => {
  it("compose nom et adresse", () => {
    expect(formatAddress(client)).toBe("Sam Ortega <sam@exemple.fr>");
  });

  it("se contente de l'adresse quand il n'y a pas de nom", () => {
    expect(formatAddress({ name: "", email: "sam@exemple.fr" })).toBe("sam@exemple.fr");
  });
});

describe("buildMessage", () => {
  const message = buildMessage({
    from: advisor,
    to: client,
    subject: "Votre séjour à Oslo",
    body: "Bonjour Sam,\n\nVoici votre devis — à très vite.",
    date: new Date("2026-05-01T09:00:00Z"),
  });

  it("sépare les en-têtes du corps par une ligne vide, en CRLF", () => {
    expect(message).toContain("\r\n\r\n");
    expect(message.split("\r\n\r\n")[0]).not.toContain("\n\n");
  });

  it("annonce et applique l'encodage du corps", () => {
    expect(message).toContain("Content-Transfer-Encoding: base64");
    const body = message.split("\r\n\r\n")[1].replace(/\r\n/g, "");
    expect(Buffer.from(body, "base64").toString("utf8")).toContain("Voici votre devis — à très vite.");
  });

  it("refuse qu'on injecte un en-tête depuis un objet", () => {
    // Un nom de dossier finit dans l'objet : un retour à la ligne y ajouterait
    // un destinataire caché.
    const injected = buildMessage({
      from: advisor,
      to: client,
      subject: "Devis\r\nBcc: ailleurs@exemple.fr",
      body: "corps",
    });
    expect(injected).not.toContain("Bcc:");
    expect(injected.split("\r\n\r\n")[0].split("\r\n")).toHaveLength(7);
  });

  it("ajoute un Reply-To quand l'expéditeur technique n'est pas le conseiller", () => {
    expect(
      buildMessage({ from: { name: "", email: "no-reply@jv.app" }, to: client, replyTo: advisor, subject: "x", body: "y" }),
    ).toContain("Reply-To: Camille Roy <camille@escale.fr>");
  });
});

describe("composeQuote", () => {
  const composed = composeQuote({
    client,
    agencyName: "Escale Voyages",
    advisor,
    reference: "DEV-2026-0001",
    title: "Oslo en hiver",
    url: "https://agence.fr/devis/jeton",
    validUntil: "30 juin 2026",
    intro: "Comme convenu, voici votre séjour.",
  });

  it("met la référence dans l'objet et le lien dans le corps", () => {
    expect(composed.subject).toBe("Votre devis DEV-2026-0001 — Oslo en hiver");
    expect(composed.body).toContain("https://agence.fr/devis/jeton");
    expect(composed.body).toContain("Comme convenu, voici votre séjour.");
    expect(composed.body).toContain("30 juin 2026");
  });

  it("signe du conseiller et de son agence", () => {
    expect(composed.body).toContain("Camille Roy\nEscale Voyages");
  });

  it("dit quelque chose même sans mot d'introduction", () => {
    const bare = composeQuote({
      client,
      agencyName: "Escale Voyages",
      advisor: null,
      reference: "DEV-2026-0002",
      title: "Oslo en hiver",
      url: "https://agence.fr/devis/jeton",
      validUntil: null,
      intro: "   ",
    });
    expect(bare.body).toContain("Voici votre devis pour Oslo en hiver");
  });
});

describe("composeInvoice", () => {
  const composed = composeInvoice({
    client,
    agencyName: "Escale Voyages",
    advisor,
    reference: "FAC-2026-0001",
    kindLabel: "Acompte",
    amount: "450 €",
    dueDate: "15 juin 2026",
    url: "https://agence.fr/facture/jeton",
  });

  it("annonce le montant et l'échéance", () => {
    expect(composed.subject).toBe("Acompte FAC-2026-0001");
    expect(composed.body).toContain("450 €");
    expect(composed.body).toContain("15 juin 2026");
  });

  it("ne chiffre pas la TVA, que la facture elle-même ne porte pas", () => {
    expect(composed.body).not.toMatch(/TVA/);
  });
});

describe("composeReset", () => {
  const composed = composeReset({ user: advisor, url: "https://agence.fr/reset/jeton", hours: 1 });

  it("porte le lien et sa durée", () => {
    expect(composed.body).toContain("https://agence.fr/reset/jeton");
    expect(composed.body).toContain("valable 1 heure");
  });

  it("dit quoi faire quand on n'a rien demandé", () => {
    expect(composed.body).toContain("Si vous n'avez rien demandé");
  });
});

describe("composeInvite", () => {
  it("explique ce que le client va trouver", () => {
    const composed = composeInvite({
      client,
      agencyName: "Escale Voyages",
      advisor,
      url: "https://agence.fr/invitation/jeton",
      days: 14,
    });
    expect(composed.subject).toBe("Votre espace voyageur chez Escale Voyages");
    expect(composed.body).toContain("https://agence.fr/invitation/jeton");
    expect(composed.body).toContain("14 jours");
  });
});

describe("parseSmtpUrl", () => {
  it("ne pas être configuré n'est pas une panne", () => {
    expect(parseSmtpUrl(undefined)).toBeNull();
    expect(parseSmtpUrl("  ")).toBeNull();
  });

  it("lit le port implicite de chaque protocole", () => {
    expect(parseSmtpUrl("smtps://u:p@smtp.exemple.fr")).toMatchObject({
      host: "smtp.exemple.fr",
      port: 465,
      implicitTls: true,
    });
    expect(parseSmtpUrl("smtp://u:p@smtp.exemple.fr")).toMatchObject({
      port: 587,
      implicitTls: false,
    });
  });

  it("décode un mot de passe qui contient des caractères réservés", () => {
    expect(parseSmtpUrl("smtps://user%40agence.fr:mot%3Ade%2Fpasse@smtp.exemple.fr")).toMatchObject({
      user: "user@agence.fr",
      password: "mot:de/passe",
    });
  });

  it("refuse ce qu'elle ne sait pas parler", () => {
    expect(() => parseSmtpUrl("https://smtp.exemple.fr")).toThrow(SmtpError);
    expect(() => parseSmtpUrl("pas une url")).toThrow(SmtpError);
  });
});

describe("defaultSender", () => {
  it("retombe sur l'adresse du conseiller quand rien n'est imposé", () => {
    delete process.env.JV_MAIL_FROM;
    expect(defaultSender("camille@escale.fr")).toEqual({ name: "", email: "camille@escale.fr" });
  });

  it("lit la forme « Nom <adresse> »", () => {
    process.env.JV_MAIL_FROM = "Escale Voyages <contact@escale.fr>";
    expect(defaultSender("camille@escale.fr")).toEqual({
      name: "Escale Voyages",
      email: "contact@escale.fr",
    });
    delete process.env.JV_MAIL_FROM;
  });
});
