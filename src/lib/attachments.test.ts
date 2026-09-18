import { describe, expect, it } from "vitest";
import {
  canSee,
  checkUpload,
  DEFAULT_VISIBILITY,
  extensionOf,
  formatBytes,
  isVisibility,
  MAX_BYTES,
  safeName,
} from "./attachments";

const file = (overrides: Partial<{ name: string; type: string; size: number }> = {}) => ({
  name: "voucher.pdf",
  type: "application/pdf",
  size: 120_000,
  ...overrides,
});

describe("checkUpload", () => {
  it("accepte ce qu'une agence dépose vraiment", () => {
    expect(checkUpload(file())).toEqual({ ok: true });
    expect(checkUpload(file({ name: "passeport.JPG", type: "image/jpeg" }))).toEqual({ ok: true });
  });

  it("refuse ce qui pourrait s'exécuter", () => {
    const refused = checkUpload(file({ name: "agent.exe", type: "application/x-msdownload" }));
    expect(refused.ok).toBe(false);
    expect(refused.error).toContain("Formats acceptés");
  });

  it("refuse un type déclaré qui ne colle pas à l'extension", () => {
    // Le type vient du navigateur : il se falsifie d'un clic. Les deux doivent
    // s'accorder pour qu'on écrive quoi que ce soit sur le disque.
    const refused = checkUpload(file({ name: "billet.html", type: "application/pdf" }));
    expect(refused.ok).toBe(false);
    expect(refused.error).toContain("ne correspond pas");
  });

  it("refuse un fichier vide et un fichier trop gros", () => {
    expect(checkUpload(file({ size: 0 })).error).toContain("vide");
    const big = checkUpload(file({ size: MAX_BYTES + 1 }));
    expect(big.ok).toBe(false);
    expect(big.error).toContain("limite");
  });
});

describe("safeName", () => {
  it("garde un nom lisible", () => {
    expect(safeName("Voucher hôtel — Oslo.pdf")).toBe("Voucher hôtel — Oslo.pdf");
  });

  it("coupe ce qui ressemble à un chemin", () => {
    // Le nom ne sert jamais de chemin — le fichier est écrit sous un
    // identifiant choisi par le produit — mais on ne laisse pas passer ça.
    expect(safeName("../../etc/passwd")).not.toContain("/");
    expect(safeName("..\\..\\windows")).not.toContain("\\");
    expect(safeName("../../etc/passwd")).not.toContain("..");
  });

  it("ne rend jamais une chaîne vide", () => {
    expect(safeName("   ")).toBe("document");
    expect(safeName("///")).toBe("document");
  });
});

describe("extensionOf", () => {
  it("lit l'extension en minuscules", () => {
    expect(extensionOf("Billet.PDF")).toBe("pdf");
    expect(extensionOf("photo.jpeg")).toBe("jpeg");
  });

  it("rend une chaîne vide quand il n'y en a pas", () => {
    expect(extensionOf("sans-extension")).toBe("");
  });
});

describe("canSee", () => {
  it("ne remet au voyageur que ce qui lui est destiné", () => {
    expect(canSee("traveller", false)).toBe(true);
    expect(canSee("agency", false)).toBe(false);
  });

  it("montre tout au conseiller, qui tient le dossier", () => {
    expect(canSee("agency", true)).toBe(true);
    expect(canSee("traveller", true)).toBe(true);
  });

  it("garde le défaut du côté prudent", () => {
    // Une pièce déposée sans choix explicite ne sort pas de l'agence : une
    // facture fournisseur porte un prix d'achat.
    expect(canSee(DEFAULT_VISIBILITY, false)).toBe(false);
  });
});

describe("isVisibility", () => {
  it("refuse une valeur venue d'un formulaire qu'elle ne connaît pas", () => {
    expect(isVisibility("traveller")).toBe(true);
    expect(isVisibility("agency")).toBe(true);
    expect(isVisibility("public")).toBe(false);
    expect(isVisibility("")).toBe(false);
  });
});

describe("formatBytes", () => {
  it("écrit une taille comme on la lit", () => {
    expect(formatBytes(512)).toBe("512 o");
    expect(formatBytes(2048)).toBe("2 Ko");
    expect(formatBytes(2_516_582)).toBe("2,4 Mo");
  });
});
