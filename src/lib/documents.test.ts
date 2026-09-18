import { describe, expect, it } from "vitest";
import { fileName, invoicePdf, quotePdf, travelBookPdf } from "./documents";
import { MARGIN_SCHEME_MENTION } from "./invoices";
import type { Invoice } from "./invoices";
import type { Quote, QuoteLine } from "./quotes";
import type { Agency, Booking, ChecklistItem, Trip } from "./types";

/** L'inverse de l'encodage WinAnsi, pour relire ce qui a été écrit. */
const FROM_CP1252: Record<number, string> = {
  0x80: "€", 0x85: "…", 0x91: "\u2018", 0x92: "\u2019", 0x93: "\u201C",
  0x94: "\u201D", 0x95: "•", 0x96: "–", 0x97: "—", 0x8c: "Œ", 0x9c: "œ",
};

/**
 * On relit le PDF comme du texte.
 *
 * Les chaînes du fichier sont désamorcées puis redécodées, si bien qu'un test
 * cherche « 2 500 € » et non une suite d'octets. Chercher un montant d'achat
 * là-dedans est alors une vraie vérification : si un coût fuitait, il serait
 * dans cette chaîne.
 */
function textOf(bytes: Uint8Array): string {
  const file = Buffer.from(bytes).toString("latin1");
  return [...file.matchAll(/\((.*?)\) Tj/g)]
    .map((match) => {
      let out = "";
      const raw = match[1];
      for (let index = 0; index < raw.length; index += 1) {
        if (raw[index] !== "\\") {
          out += raw[index];
          continue;
        }
        const octal = /^[0-7]{3}/.exec(raw.slice(index + 1));
        if (octal) {
          const code = parseInt(octal[0], 8);
          out += FROM_CP1252[code] ?? String.fromCharCode(code);
          index += 3;
        } else {
          out += raw[index + 1];
          index += 1;
        }
      }
      return out;
    })
    .join("\n");
}

const agency: Agency = {
  id: 1,
  name: "Escale Voyages",
  legal_name: "Escale Voyages SARL",
  registration: "IM075260001",
  email: "contact@escale.fr",
  phone: "01 23 45 67 89",
  website: "escale.fr",
  brand_colour: "#1d4ed8",
  target_margin_percent: 18,
  vat_rate: 20,
  vat_on_margin: 1,
  financial_guarantee: "APST, Paris",
  liability_insurance: "MMA, contrat 1234",
  mediator: "",
  terms: "",
  currency: "EUR",
  created_at: "2026-01-01",
};

const trip: Trip = {
  id: 7,
  owner_id: 1,
  client_id: 3,
  title: "Kyoto en automne",
  summary: "Quinze jours entre Kyoto et Kanazawa.",
  destination_city: "Kyoto",
  destination_country: "Japon",
  start_date: "2026-10-12",
  end_date: "2026-10-16",
  stage: "booked",
  currency: "EUR",
  budget_cents: 0,
  agency_quote_cents: 398_000,
  travellers: 2,
  created_at: "2026-01-01",
};

/** Acheté 250 000, vendu 398 000 : 148 000 de marge, qui ne doit sortir nulle part. */
const bookings: Booking[] = [
  {
    id: 1,
    trip_id: 7,
    type: "flight",
    vendor: "ANA",
    reference: "NH7788",
    description: "CDG → KIX",
    start_at: "2026-10-12",
    end_at: "2026-10-16",
    amount_cents: 250_000,
    agency_quote_cents: 398_000,
    zone: "non_eu",
    nights: null,
    booked_by: null,
    created_at: "2026-01-01",
  },
];

const quote: Quote = {
  id: 11,
  trip_id: 7,
  agency_id: 1,
  reference: "DEV-2026-0001",
  token: "jeton",
  status: "sent",
  title: "Kyoto en automne",
  intro: "Voici la proposition dont nous avons parlé.",
  terms: "Acompte de 30 % à la confirmation.\nSolde à 30 jours du départ.",
  total_cents: 398_000,
  deposit_percent: 30,
  valid_until: "2026-06-30",
  sent_at: "2026-05-02",
  opened_at: null,
  decided_at: null,
  decided_by_name: null,
  decided_ip: null,
  decided_note: null,
  created_at: "2026-05-01",
};

const lines: QuoteLine[] = [
  {
    id: 1,
    quote_id: 11,
    label: "Forfait Kyoto & Kanazawa",
    detail: "Vols, transferts, 4 nuits",
    start_at: "2026-10-12",
    end_at: "2026-10-16",
    price_cents: 398_000,
    position: 0,
  },
];

const invoice: Invoice = {
  id: 21,
  trip_id: 7,
  agency_id: 1,
  quote_id: 11,
  reference: "FAC-2026-0001",
  token: "jeton-facture",
  kind: "deposit",
  status: "issued",
  label: "Acompte sur Kyoto en automne",
  total_cents: 119_400,
  due_date: "2026-06-15",
  issued_at: "2026-05-20",
  opened_at: null,
  paid_at: null,
  payment_note: "Virement sur le compte de l'agence.",
  created_at: "2026-05-20",
};

describe("quotePdf", () => {
  const text = textOf(quotePdf({ quote, lines, trip, agency, bookings }));

  it("porte la référence, le total et l'acompte", () => {
    expect(text).toContain("DEV-2026-0001");
    expect(text).toContain("Forfait Kyoto & Kanazawa");
    expect(text).toMatch(/3 ?980/);
    expect(text).toContain("dont acompte");
  });

  it("ne laisse sortir ni prix d'achat ni marge", () => {
    // 250 000 centimes d'achat, 148 000 de marge : ni l'un ni l'autre n'est
    // passé à ce module, et rien ne doit donc pouvoir les reconstituer.
    expect(text).not.toMatch(/2 ?500/);
    expect(text).not.toMatch(/1 ?480/);
    expect(text.toLowerCase()).not.toContain("prix d'achat");

    // « Marge » ne doit apparaître que comme le nom du régime de TVA, jamais
    // comme un chiffre du dossier.
    const mentions = text.toLowerCase().match(/marge/g) ?? [];
    const asRegime = text.toLowerCase().match(/régime de la marge/g) ?? [];
    expect(mentions).toHaveLength(asRegime.length);
  });

  it("remet le formulaire d'information standardisé", () => {
    expect(text).toContain("FORMULAIRE D'INFORMATION STANDARDISÉ");
    expect(text).toContain("2015/2302");
    expect(text).toContain("legifrance.gouv.fr");
  });

  it("nomme l'immatriculation et le garant, que la loi impose", () => {
    expect(text).toContain("IM075260001");
    expect(text).toContain("APST, Paris");
    expect(text).toContain("MMA, contrat 1234");
  });

  it("dit ce que l'agence n'a pas rempli plutôt que de faire semblant", () => {
    const incomplete = textOf(
      quotePdf({ quote, lines, trip, agency: { ...agency, registration: "" }, bookings }),
    );
    expect(incomplete).toContain("à compléter par l'agence");
  });

  it("reprend le programme sans les montants des prestations", () => {
    expect(text).toContain("LE PROGRAMME");
    expect(text).toContain("ANA");
    expect(text).toMatch(/Jour 1/);
  });

  it("tient sur plusieurs pages, numérotées", () => {
    const file = Buffer.from(quotePdf({ quote, lines, trip, agency, bookings })).toString("latin1");
    expect(/\/Type \/Pages \/Count (\d+)/.exec(file)![1]).not.toBe("1");
    expect(file).toContain("Devis DEV-2026-0001 \\267 1 /");
  });
});

describe("invoicePdf", () => {
  const text = textOf(
    invoicePdf({ invoice, trip, agency, billTo: { name: "Sam Ortega", email: "sam@exemple.fr" } }),
  );

  it("ne chiffre jamais la TVA", () => {
    // Condition d'application du régime de la marge : aucun montant ni taux de
    // taxe sur le document remis au client. La phrase qui explique pourquoi la
    // TVA n'y est pas n'en est pas une mention au sens fiscal.
    expect(text).not.toMatch(/TVA\s*:?\s*[\d(]/);
    expect(text).not.toMatch(/\d\s*% *(de )?TVA/);
    expect(text).not.toMatch(/\bHT\b|\bTTC\b/);
    // 148 000 de marge, donc 24 666 de taxe : ni l'un ni l'autre n'est calculé ici.
    expect(text).not.toMatch(/1 ?480/);
    expect(text).not.toMatch(/246[,.]?6/);
  });

  it("porte la mention obligatoire du régime particulier", () => {
    expect(text).toContain(MARGIN_SCHEME_MENTION);
  });

  it("adresse la facture et affiche ce qu'il y a à payer", () => {
    expect(text).toContain("Sam Ortega");
    expect(text).toContain("FAC-2026-0001");
    expect(text).toMatch(/1 ?194/);
  });

  it("dit qu'un brouillon n'est pas émis", () => {
    const draft = textOf(
      invoicePdf({ invoice: { ...invoice, status: "draft", issued_at: null }, trip, agency, billTo: null }),
    );
    expect(draft).toContain("Brouillon, non émise");
  });

  it("garde son numéro quand elle est annulée", () => {
    const cancelled = textOf(
      invoicePdf({ invoice: { ...invoice, status: "cancelled" }, trip, agency, billTo: null }),
    );
    expect(cancelled).toContain("FAC-2026-0001");
    expect(cancelled).toContain("annulée");
  });
});

describe("travelBookPdf", () => {
  const checklist: ChecklistItem[] = [
    { id: 1, trip_id: 7, label: "Passeport valide 6 mois", done: 0, position: 0, created_at: "" },
    { id: 2, trip_id: 7, label: "Assurance voyage", done: 1, position: 1, created_at: "" },
  ];
  const text = textOf(
    travelBookPdf({ trip, agency, bookings, checklist, travellers: ["Sam Ortega"], advisor: false }),
  );

  it("donne le programme, les références et les préparatifs", () => {
    expect(text).toContain("Kyoto en automne");
    expect(text).toContain("NH7788");
    expect(text).toContain("Passeport valide 6 mois");
    expect(text).toContain("Assurance voyage");
  });

  it("donne de quoi joindre le conseiller", () => {
    expect(text).toContain("01 23 45 67 89");
  });

  it("ne porte aucun prix, ni de vente ni d'achat", () => {
    expect(text).not.toMatch(/2 ?500/);
    expect(text).not.toMatch(/3 ?980/);
    expect(text).not.toContain(""); // le signe euro, encodé en WinAnsi
  });
});

describe("fileName", () => {
  it("fait un nom de fichier sûr depuis une référence", () => {
    expect(fileName("devis", "DEV-2026-0001")).toBe("devis-dev-2026-0001.pdf");
    expect(fileName("carnet", "Kyoto en automne")).toBe("carnet-kyoto-en-automne.pdf");
  });

  it("retombe sur un nom générique plutôt que sur rien", () => {
    expect(fileName("devis", "///")).toBe("devis-document.pdf");
  });
});
