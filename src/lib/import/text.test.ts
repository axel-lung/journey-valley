import { describe, expect, it } from "vitest";
import { deflateRawSync } from "node:zlib";
import { PdfDocument } from "../pdf";
import {
  decodePdfString,
  extractText,
  kindOf,
  looksEmpty,
  readZipEntry,
  textFromDocx,
  textFromPdf,
  textFromPlain,
  textFromWordXml,
} from "./text";

/** Une archive zip d'une seule entrée, comme un .docx en miniature. */
function zipWith(name: string, contents: string, compress = true): Buffer {
  const nameBytes = Buffer.from(name, "utf8");
  const raw = Buffer.from(contents, "utf8");
  const body = compress ? deflateRawSync(raw) : raw;
  const method = compress ? 8 : 0;

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(method, 8);
  local.writeUInt32LE(body.length, 18);
  local.writeUInt32LE(raw.length, 22);
  local.writeUInt16LE(nameBytes.length, 26);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(method, 10);
  central.writeUInt32LE(body.length, 20);
  central.writeUInt32LE(raw.length, 24);
  central.writeUInt16LE(nameBytes.length, 28);
  central.writeUInt32LE(0, 42);

  const centralStart = local.length + nameBytes.length + body.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + nameBytes.length, 12);
  end.writeUInt32LE(centralStart, 16);

  return Buffer.concat([local, nameBytes, body, central, nameBytes, end]);
}

describe("kindOf", () => {
  it("reconnaît un fichier à son type comme à son nom", () => {
    expect(kindOf("programme.pdf", "application/pdf")).toBe("pdf");
    expect(kindOf("programme.pdf", "application/octet-stream")).toBe("pdf");
    expect(kindOf("programme.docx", "")).toBe("docx");
    expect(kindOf("collé.txt", "text/plain")).toBe("text");
  });

  it("traite comme du texte ce qu'il ne reconnaît pas", () => {
    // Plutôt que de refuser : du texte mal lu se corrige à l'écran, un refus
    // renvoie le conseiller à son traitement de texte.
    expect(kindOf("programme", "")).toBe("text");
  });
});

describe("textFromPdf", () => {
  it("relit le texte d'un PDF que le produit a lui-même écrit", () => {
    // Le meilleur test disponible sans réseau : on écrit, on relit.
    const doc = new PdfDocument();
    doc.text("Jour 1 - 12 octobre 2026 : Paris vers Marrakech");
    doc.text("Vol AF 1796, depart 10h25");
    doc.text("Nuit au Riad Kniza");

    const text = textFromPdf(doc.build());
    expect(text).toContain("Jour 1");
    expect(text).toContain("Vol AF 1796");
    expect(text).toContain("Riad Kniza");
  });

  it("rend les accents que le format encode autrement", () => {
    const doc = new PdfDocument();
    doc.text("Déjeuner à la médina — 1 890 €");
    const text = textFromPdf(doc.build());

    expect(text).toContain("Déjeuner");
    expect(text).toContain("médina");
    expect(text).toContain("€");
  });

  it("garde chaque ligne sur sa ligne", () => {
    const doc = new PdfDocument();
    doc.text("Jour 1");
    doc.text("Jour 2");
    const lines = textFromPdf(doc.build()).split("\n").filter(Boolean);

    expect(lines.length).toBeGreaterThanOrEqual(2);
  });

  it("ne rend rien plutôt que du bruit sur un fichier qui n'en est pas un", () => {
    expect(textFromPdf(new Uint8Array([1, 2, 3, 4]))).toBe("");
  });
});

describe("decodePdfString", () => {
  it("désamorce les échappements du format", () => {
    expect(decodePdfString("Forfait \\(tout compris\\)")).toBe("Forfait (tout compris)");
    expect(decodePdfString("a\\\\b")).toBe("a\\b");
  });

  it("relit un caractère écrit en octal", () => {
    // 351 en octal, c'est é en WinAnsi.
    expect(decodePdfString("d\\351jeuner")).toBe("déjeuner");
    // 200, c'est le signe euro, que CP1252 a déplacé.
    expect(decodePdfString("1890 \\200")).toBe("1890 €");
  });
});

describe("textFromDocx", () => {
  const xml = `<?xml version="1.0"?><w:document><w:body>
    <w:p><w:r><w:t>Jour 1 : Paris &amp; Marrakech</w:t></w:r></w:p>
    <w:p><w:r><w:t>Vol AF 1796</w:t><w:br/><w:t>Transfert au riad</w:t></w:r></w:p>
  </w:body></w:document>`;

  it("lit les paragraphes d'un document Word", () => {
    const text = textFromDocx(zipWith("word/document.xml", xml));
    expect(text).toContain("Jour 1 : Paris & Marrakech");
    expect(text).toContain("Vol AF 1796");
    expect(text).toContain("Transfert au riad");
  });

  it("met chaque paragraphe et chaque saut sur sa ligne", () => {
    expect(textFromWordXml(xml).split("\n").filter(Boolean)).toHaveLength(3);
  });

  it("garde les lignes d'un tableau, où beaucoup d'agences écrivent", () => {
    const table = `<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Jour 1</w:t></w:r></w:p></w:tc>
      <w:tc><w:p><w:r><w:t>Arrivée</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:r><w:t>Jour 2</w:t></w:r></w:p></w:tc>
      <w:tc><w:p><w:r><w:t>Médina</w:t></w:r></w:p></w:tc></w:tr></w:tbl>`;
    const lines = textFromWordXml(table).split("\n").filter((line) => line.trim());

    expect(lines[0]).toContain("Jour 1");
    expect(lines[0]).toContain("Arrivée");
    expect(lines[1]).toContain("Jour 2");
  });

  it("ne rend rien plutôt que du bruit sur une archive sans document", () => {
    expect(textFromDocx(zipWith("autre.xml", "<x/>"))).toBe("");
    expect(textFromDocx(new Uint8Array([0, 1, 2]))).toBe("");
  });
});

describe("readZipEntry", () => {
  it("lit une entrée compressée comme une entrée stockée", () => {
    expect(readZipEntry(zipWith("a.txt", "bonjour", true), "a.txt")?.toString()).toBe("bonjour");
    expect(readZipEntry(zipWith("a.txt", "bonjour", false), "a.txt")?.toString()).toBe("bonjour");
  });

  it("rend null sur une entrée absente", () => {
    expect(readZipEntry(zipWith("a.txt", "bonjour"), "b.txt")).toBeNull();
  });
});

describe("textFromPlain", () => {
  it("rend le texte tel quel", () => {
    expect(textFromPlain(Buffer.from("Jour 1 : Arrivée"))).toBe("Jour 1 : Arrivée");
  });

  it("retire les en-têtes d'un e-mail pour ne garder que le corps", () => {
    const mail = [
      "From: reception@partenaire.ma",
      "To: camille@escale.fr",
      "Subject: Programme Marrakech",
      "",
      "Jour 1 : Arrivée",
      "Vol AF 1796",
    ].join("\n");

    const body = textFromPlain(Buffer.from(mail));
    expect(body.startsWith("Jour 1")).toBe(true);
    expect(body).not.toContain("Subject:");
  });

  it("ne confond pas un programme avec un e-mail", () => {
    const text = textFromPlain(Buffer.from("Jour 1 : Arrivée\n\nJour 2 : Médina"));
    expect(text).toContain("Jour 1");
    expect(text).toContain("Jour 2");
  });
});

describe("extractText", () => {
  it("ne jette jamais, quel que soit le fichier", () => {
    const broken = extractText({
      fileName: "programme.docx",
      contentType: "",
      bytes: new Uint8Array([9, 9, 9]),
    });
    expect(broken).toEqual({ kind: "docx", text: "" });
  });

  it("aiguille sur le bon lecteur", () => {
    const doc = new PdfDocument();
    doc.text("Jour 1");
    const read = extractText({
      fileName: "p.pdf",
      contentType: "application/pdf",
      bytes: doc.build(),
    });
    expect(read.kind).toBe("pdf");
    expect(read.text).toContain("Jour 1");
  });
});

describe("looksEmpty", () => {
  it("reconnaît un fichier dont on ne tirera rien", () => {
    // Un PDF scanné : aucune lettre à lire. L'écran doit alors proposer le
    // collage manuel plutôt qu'un formulaire vide.
    expect(looksEmpty("")).toBe(true);
    expect(looksEmpty("  \n \n ")).toBe(true);
    expect(looksEmpty("Jour 1")).toBe(true);
  });

  it("laisse passer un vrai programme", () => {
    expect(looksEmpty("Jour 1 : Paris → Marrakech\nVol AF 1796\nNuit au Riad Kniza")).toBe(false);
  });
});
