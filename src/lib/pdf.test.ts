import { describe, expect, it } from "vitest";
import { BLACK, encodeWinAnsi, parseColour, PdfDocument, widthOf, wrapText } from "./pdf";

describe("encodeWinAnsi", () => {
  it("keeps French accents as single bytes", () => {
    // Latin-1 and WinAnsi agree below 256, so é is one byte, not two.
    expect(encodeWinAnsi("été")).toEqual([0xe9, 0x74, 0xe9]);
  });

  it("maps the typography CP1252 moved into the control range", () => {
    expect(encodeWinAnsi("€")).toEqual([0x80]);
    expect(encodeWinAnsi("œ")).toEqual([0x9c]);
    expect(encodeWinAnsi("–")).toEqual([0x96]);
    expect(encodeWinAnsi("’")).toEqual([0x92]);
  });

  it("flattens the narrow no-break space formatMoney inserts", () => {
    // "1 500 €" comes out of Intl with U+202F before the sign; a PDF viewer
    // would draw a box for it.
    expect(encodeWinAnsi("1 500 €")).toEqual([0x31, 0x20, 0x35, 0x30, 0x30, 0x20, 0x80]);
  });

  it("substitutes rather than corrupts what it cannot represent", () => {
    expect(encodeWinAnsi("東京")).toEqual([63, 63]);
  });
});

describe("widthOf", () => {
  it("measures bold text wider than regular", () => {
    expect(widthOf("Total", "bold", 10)).toBeGreaterThan(widthOf("Total", "regular", 10));
  });

  it("scales with the point size", () => {
    expect(widthOf("Devis", "regular", 20)).toBeCloseTo(widthOf("Devis", "regular", 10) * 2, 5);
  });

  it("gives an accented letter the width of its base", () => {
    // True of the standard fonts, and the reason no 256-entry table is carried.
    expect(widthOf("é", "regular", 10)).toBe(widthOf("e", "regular", 10));
    expect(widthOf("ç", "regular", 10)).toBe(widthOf("c", "regular", 10));
  });
});

describe("wrapText", () => {
  it("breaks a paragraph to the column width", () => {
    const lines = wrapText(
      "Le prix du forfait ne peut être augmenté que si des coûts spécifiques augmentent.",
      "regular",
      10,
      120,
    );
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(widthOf(line, "regular", 10)).toBeLessThanOrEqual(120);
  });

  it("honours the newlines the author typed", () => {
    expect(wrapText("Acompte de 30 %.\nSolde à 30 jours.", "regular", 10, 400)).toEqual([
      "Acompte de 30 %.",
      "Solde à 30 jours.",
    ]);
  });

  it("cuts a word that cannot fit rather than letting it run off the page", () => {
    const lines = wrapText("https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000036677144", "regular", 10, 80);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(widthOf(line, "regular", 10)).toBeLessThanOrEqual(80);
    expect(lines.join("")).toBe("https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000036677144");
  });
});

describe("parseColour", () => {
  it("reads the brand colour an agency stores", () => {
    expect(parseColour("#1d4ed8")).toEqual({ r: 29 / 255, g: 78 / 255, b: 216 / 255 });
  });

  it("falls back to ink on anything it cannot read", () => {
    expect(parseColour("bleu")).toEqual(BLACK);
  });
});

describe("PdfDocument", () => {
  const read = (bytes: Uint8Array) => Buffer.from(bytes).toString("latin1");

  it("produces a file a reader will open", () => {
    const doc = new PdfDocument();
    doc.text("Devis DEV-2026-0001");
    const file = read(doc.build());

    expect(file.startsWith("%PDF-1.4")).toBe(true);
    expect(file.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(file).toContain("/Type /Catalog");
    expect(file).toContain("(Devis DEV-2026-0001) Tj");
  });

  it("records an offset for every object it wrote", () => {
    const doc = new PdfDocument();
    doc.text("Une ligne");
    const file = read(doc.build());

    const declared = Number(/\/Size (\d+)/.exec(file)![1]);
    const entries = file.match(/^\d{10} \d{5} [nf] $/gm) ?? [];
    expect(entries).toHaveLength(declared);

    // The offsets must actually land on their object headers, or the file is
    // silently broken for anything but the most forgiving viewer.
    const start = file.indexOf("xref\n");
    entries.slice(1).forEach((entry, index) => {
      const offset = Number(entry.slice(0, 10));
      expect(file.slice(offset)).toMatch(new RegExp(`^${index + 1} 0 obj`));
    });
    expect(Number(/startxref\n(\d+)/.exec(file)![1])).toBe(start);
  });

  it("declares a stream length that matches its bytes", () => {
    const doc = new PdfDocument();
    doc.paragraph("Un paragraphe avec des accents : été, forêt, où, çà.");
    const file = read(doc.build());

    const match = /<< \/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/.exec(file)!;
    expect(Buffer.byteLength(match[2], "latin1")).toBe(Number(match[1]));
  });

  it("opens a new page when the cursor runs past the bottom", () => {
    const doc = new PdfDocument();
    for (let index = 0; index < 90; index += 1) doc.text(`Ligne ${index}`);
    const file = read(doc.build());

    expect(/\/Type \/Pages \/Count (\d+)/.exec(file)![1]).not.toBe("1");
  });

  it("numbers the pages once there is more than one", () => {
    const doc = new PdfDocument({ footer: "Devis DEV-2026-0001" });
    for (let index = 0; index < 90; index += 1) doc.text(`Ligne ${index}`);
    expect(read(doc.build())).toContain("(Devis DEV-2026-0001 \\267 1 / 2) Tj");
  });

  it("escapes the characters that would end a string early", () => {
    const doc = new PdfDocument();
    doc.text("Forfait (tout compris) \\ garanti");
    expect(read(doc.build())).toContain("(Forfait \\(tout compris\\) \\\\ garanti) Tj");
  });

  it("carries an attached file, and points the catalogue at it", () => {
    const doc = new PdfDocument({ title: "Acompte FAC-2026-0001" });
    doc.text("Acompte FAC-2026-0001");
    doc.attach(
      {
        name: "factur-x.xml",
        contentType: "text/xml",
        description: "Facture électronique",
        relationship: "Alternative",
        text: "<invoice>été</invoice>",
      },
      {
        documentType: "INVOICE",
        fileName: "factur-x.xml",
        version: "1.0",
        conformanceLevel: "BASIC",
      },
    );
    const file = read(doc.build());

    // The three places a reader looks: the name tree, the associated-files
    // array, and the file specification itself.
    expect(file).toContain("/EmbeddedFiles << /Names [(factur-x.xml)");
    expect(file).toMatch(/\/AF \[\d+ 0 R\]/);
    expect(file).toContain("/AFRelationship /Alternative");
    expect(file).toContain("/Type /EmbeddedFile /Subtype /text#2Fxml");
  });

  it("stores the payload's own bytes, not a re-encoding of them", () => {
    const doc = new PdfDocument();
    doc.text("x");
    const payload = "<invoice>été</invoice>";
    doc.attach({
      name: "factur-x.xml",
      contentType: "text/xml",
      description: "d",
      relationship: "Alternative",
      text: payload,
    });
    const file = read(doc.build());

    const stream = /\/Type \/EmbeddedFile[\s\S]*?stream\n([\s\S]*?)\nendstream/.exec(file)![1];
    expect(Buffer.from(stream, "latin1").toString("utf8")).toBe(payload);

    const declared = Number(/\/Params << \/Size (\d+) >>/.exec(file)![1]);
    expect(declared).toBe(Buffer.byteLength(payload, "utf8"));
  });

  it("announces the attachment in its metadata without claiming PDF/A", () => {
    const doc = new PdfDocument({ title: "Acompte" });
    doc.text("x");
    doc.attach(
      {
        name: "factur-x.xml",
        contentType: "text/xml",
        description: "d",
        relationship: "Alternative",
        text: "<x/>",
      },
      {
        documentType: "INVOICE",
        fileName: "factur-x.xml",
        version: "1.0",
        conformanceLevel: "BASIC",
      },
    );
    const file = read(doc.build());

    expect(file).toContain("/Type /Metadata /Subtype /XML");
    expect(file).toContain("<fx:ConformanceLevel>BASIC</fx:ConformanceLevel>");
    expect(file).toContain("urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#");

    // Claiming conformance we do not meet would be a false statement inside a
    // document meant to be relied upon.
    expect(file).not.toContain("pdfaid:part");
  });

  it("stays a plain document when nothing is attached", () => {
    const doc = new PdfDocument();
    doc.text("x");
    const file = read(doc.build());
    expect(file).not.toContain("/EmbeddedFiles");
    expect(file).not.toContain("/AF [");
  });

  it("puts an amount at the right margin, level with the label's first line", () => {
    const doc = new PdfDocument();
    const before = doc.y;
    doc.row(
      "Un libellé délibérément très long, qui décrit la prestation en toutes lettres et " +
        "occupera donc plusieurs lignes dans sa colonne avant de laisser la place au montant",
      "1 500 €",
    );

    // The label has to have wrapped, or the test proves nothing.
    expect(doc.y).toBeGreaterThan(before + 20);

    const drawn = [...read(doc.build()).matchAll(/1 0 0 1 ([\d.]+) ([\d.]+) Tm \((.*?)\) Tj/g)].map(
      (match) => ({ x: Number(match[1]), y: Number(match[2]), text: match[3] }),
    );
    const amount = drawn.find((entry) => entry.text.startsWith("1 500"))!;
    expect(amount.y).toBe(drawn[0].y);
    expect(amount.x).toBeGreaterThan(drawn[0].x);
  });
});
