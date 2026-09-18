/**
 * A very small PDF writer.
 *
 * The product needs to hand a traveller a file: a quote, an invoice, a travel
 * book. Printing from the browser was never an answer — a client expects an
 * attachment and an accountant expects a document.
 *
 * Rather than pull in a rendering library, this writes the format by hand. It
 * only needs what a business document uses: the two standard Helvetica faces,
 * text that wraps, rules, filled boxes and page numbers. That keeps the
 * dependency list as it was, and keeps the whole thing testable — `build()`
 * returns bytes, and the layout helpers are pure.
 *
 * Two constraints the format imposes, both handled here:
 *
 * 1. **Strings are bytes, not Unicode.** The standard fonts are addressed
 *    through WinAnsiEncoding, so French text has to be mapped down to CP1252
 *    before it is written. `encodeWinAnsi` does that, and turns what cannot be
 *    represented into a question mark rather than corrupting the file.
 * 2. **Offsets are absolute.** The cross-reference table at the end records
 *    where each object starts, counted in bytes, so the document is assembled
 *    as byte chunks and measured as it goes.
 */

export type FontName = "regular" | "bold";

/** A4 in points, the unit PDF counts in. */
export const PAGE_WIDTH = 595.28;
export const PAGE_HEIGHT = 841.89;
export const MARGIN = 56;
export const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

/* ------------------------------------------------------------- encoding */

/**
 * The CP1252 slots that are not plain Latin-1. Everything else below 256 maps
 * to itself, which covers French accents; this table covers its typography —
 * the euro sign, curly quotes, dashes and the œ ligature.
 */
const CP1252_EXTRAS: Record<string, number> = {
  "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85,
  "†": 0x86, "‡": 0x87, "ˆ": 0x88, "‰": 0x89, "Š": 0x8a,
  "‹": 0x8b, "Œ": 0x8c, "Ž": 0x8e, "‘": 0x91, "’": 0x92,
  "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97,
  "˜": 0x98, "™": 0x99, "š": 0x9a, "›": 0x9b, "œ": 0x9c,
  "ž": 0x9e, "Ÿ": 0x9f,
};

/** A narrow no-break space is what `formatMoney` puts before the euro sign. */
const SPACE_LIKE = new Set([" ", " ", " ", " "]);

/** Maps a string onto the bytes WinAnsiEncoding understands. */
export function encodeWinAnsi(text: string): number[] {
  const bytes: number[] = [];
  for (const char of text) {
    if (SPACE_LIKE.has(char)) {
      bytes.push(0x20);
      continue;
    }
    const extra = CP1252_EXTRAS[char];
    if (extra !== undefined) {
      bytes.push(extra);
      continue;
    }
    const code = char.codePointAt(0) ?? 63;
    bytes.push(code < 256 ? code : 63);
  }
  return bytes;
}

/* -------------------------------------------------------------- metrics */

/**
 * Advance widths for the two faces, in thousandths of the point size.
 *
 * Only codes 32–126 are listed: in the standard fonts an accented glyph
 * advances exactly like its base letter, so `widthOf` folds the rest back onto
 * ASCII instead of carrying a table nobody would ever check.
 */
const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

const HELVETICA_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

/**
 * Folds a byte onto the ASCII letter that advances the same width. Accented
 * capitals and lowercase share their base's width; the few symbols CP1252 adds
 * are given the nearest equivalent.
 */
function foldToAscii(byte: number): number {
  if (byte >= 32 && byte <= 126) return byte;
  switch (byte) {
    case 0x80: return 0x45; // € — as wide as a capital E
    case 0x85: return 0x6d; // … — as wide as an m
    case 0x91: case 0x92: return 0x27; // curly single quotes
    case 0x93: case 0x94: return 0x22; // curly double quotes
    case 0x95: return 0x6f; // bullet
    case 0x96: return 0x6e; // en dash
    case 0x97: return 0x6d; // em dash
    case 0x8c: case 0x9c: return 0x57; // Œ œ — as wide as a W
    case 0xa0: return 0x20;
    default: break;
  }
  if (byte >= 0xc0 && byte <= 0xc6) return 0x41; // À–Æ
  if (byte === 0xc7) return 0x43; // Ç
  if (byte >= 0xc8 && byte <= 0xcb) return 0x45; // È–Ë
  if (byte >= 0xcc && byte <= 0xcf) return 0x49; // Ì–Ï
  if (byte >= 0xd2 && byte <= 0xd6) return 0x4f; // Ò–Ö
  if (byte >= 0xd9 && byte <= 0xdc) return 0x55; // Ù–Ü
  if (byte >= 0xe0 && byte <= 0xe6) return 0x61; // à–æ
  if (byte === 0xe7) return 0x63; // ç
  if (byte >= 0xe8 && byte <= 0xeb) return 0x65; // è–ë
  if (byte >= 0xec && byte <= 0xef) return 0x69; // ì–ï
  if (byte >= 0xf2 && byte <= 0xf6) return 0x6f; // ò–ö
  if (byte >= 0xf9 && byte <= 0xfc) return 0x75; // ù–ü
  return 0x6e; // anything else: the width of an n, close enough to not shift a line
}

/** Width of a string at a given size, in points. */
export function widthOf(text: string, font: FontName, size: number): number {
  const table = font === "bold" ? HELVETICA_BOLD : HELVETICA;
  let total = 0;
  for (const byte of encodeWinAnsi(text)) {
    total += table[foldToAscii(byte) - 32] ?? 556;
  }
  return (total * size) / 1000;
}

/**
 * Breaks text to fit a column, honouring the newlines the author wrote.
 *
 * A word longer than the column (a URL, a reference) is cut rather than
 * allowed to run off the page — losing a character is better than losing the
 * margin.
 */
export function wrapText(
  text: string,
  font: FontName,
  size: number,
  maxWidth: number,
): string[] {
  const lines: string[] = [];

  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }

    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (widthOf(candidate, font, size) <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);

      // The word alone still overflows: cut it where it stops fitting.
      let rest = word;
      while (widthOf(rest, font, size) > maxWidth && rest.length > 1) {
        let cut = rest.length;
        while (cut > 1 && widthOf(rest.slice(0, cut), font, size) > maxWidth) cut -= 1;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      current = rest;
    }
    if (current) lines.push(current);
  }

  return lines;
}

/* ---------------------------------------------------------------- colour */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export const BLACK: Rgb = { r: 0.11, g: 0.1, b: 0.09 };
export const GREY: Rgb = { r: 0.45, g: 0.43, b: 0.41 };
export const LIGHT: Rgb = { r: 0.85, g: 0.84, b: 0.83 };
export const PAPER: Rgb = { r: 0.97, g: 0.96, b: 0.96 };

/** `#1d4ed8` → the components PDF wants. Falls back to a neutral ink. */
export function parseColour(hex: string): Rgb {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return BLACK;
  const value = parseInt(match[1], 16);
  return {
    r: ((value >> 16) & 255) / 255,
    g: ((value >> 8) & 255) / 255,
    b: (value & 255) / 255,
  };
}

/* --------------------------------------------------------------- writing */

/** `text/xml` → `/text#2Fxml`: a PDF name escapes what it cannot spell. */
function nameLiteral(value: string): string {
  return `/${value.replace(/[^A-Za-z0-9._-]/g, (char) =>
    `#${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`,
  )}`;
}

function escapeForPdf(bytes: number[]): string {
  let out = "";
  for (const byte of bytes) {
    if (byte === 0x28 || byte === 0x29 || byte === 0x5c) out += `\\${String.fromCharCode(byte)}`;
    else if (byte < 32 || byte > 126) out += `\\${byte.toString(8).padStart(3, "0")}`;
    else out += String.fromCharCode(byte);
  }
  return out;
}

export interface TextOptions {
  font?: FontName;
  size?: number;
  colour?: Rgb;
  /** Where `x` sits relative to the text. Default `left`. */
  align?: "left" | "right" | "centre";
}

/**
 * A document being laid out.
 *
 * The cursor runs down the page; every helper that writes advances it and
 * opens a new page when there is no room left. Coordinates are PDF's own —
 * origin bottom-left — but `y` here counts from the top, because that is how
 * the layout reads.
 */
/**
 * A file carried inside the document.
 *
 * This is how a hybrid invoice works: the PDF a person reads, with the
 * machine-readable version attached to it. `documents.ts` uses it to carry the
 * Factur-X XML; nothing here knows what the payload means.
 */
export interface Attachment {
  /** The name the reader shows, and the one the specification may impose. */
  name: string;
  /** Media type of the payload, e.g. `text/xml`. */
  contentType: string;
  /** What the file is for, shown in a reader's attachment pane. */
  description: string;
  /**
   * How the attachment relates to the page. `Alternative` says the two carry
   * the same content in two forms — what a complete hybrid invoice declares.
   */
  relationship: "Alternative" | "Data" | "Source" | "Supplement";
  text: string;
}

/**
 * Metadata a processor reads without opening the page.
 *
 * Deliberately not claiming PDF/A conformance: see `build()`.
 */
export interface XmpFacturX {
  documentType: string;
  fileName: string;
  version: string;
  conformanceLevel: string;
}

export class PdfDocument {
  private pages: string[] = [];
  private current: string[] = [];
  private cursor = MARGIN;
  private readonly footerText: string;
  private readonly title: string;
  private attachment: Attachment | null = null;
  private facturX: XmpFacturX | null = null;

  constructor(options: { footer?: string; title?: string } = {}) {
    this.footerText = options.footer ?? "";
    this.title = options.title ?? "";
  }

  /** Carries a file inside the document, with the metadata that announces it. */
  attach(attachment: Attachment, facturX: XmpFacturX | null = null): void {
    this.attachment = attachment;
    this.facturX = facturX;
  }

  /** Distance from the top of the page to the writing cursor. */
  get y(): number {
    return this.cursor;
  }

  get remaining(): number {
    return PAGE_HEIGHT - MARGIN - this.cursor;
  }

  /** Starts a new page unless `height` still fits on this one. */
  ensure(height: number): void {
    if (this.remaining < height) this.newPage();
  }

  newPage(): void {
    this.pages.push(this.current.join("\n"));
    this.current = [];
    this.cursor = MARGIN;
  }

  move(delta: number): void {
    this.cursor += delta;
  }

  /** Writes one line and advances past it. */
  text(value: string, options: TextOptions & { x?: number; lineHeight?: number } = {}): void {
    const font = options.font ?? "regular";
    const size = options.size ?? 10;
    const colour = options.colour ?? BLACK;
    const lineHeight = options.lineHeight ?? size * 1.35;

    this.ensure(lineHeight);

    let x = options.x ?? MARGIN;
    if (options.align === "right") x -= widthOf(value, font, size);
    else if (options.align === "centre") x -= widthOf(value, font, size) / 2;

    // The baseline sits a little above the bottom of the line box.
    const baseline = PAGE_HEIGHT - this.cursor - size;
    this.current.push(
      `BT ${colour.r.toFixed(3)} ${colour.g.toFixed(3)} ${colour.b.toFixed(3)} rg ` +
        `/${font === "bold" ? "F2" : "F1"} ${size} Tf ` +
        `1 0 0 1 ${x.toFixed(2)} ${baseline.toFixed(2)} Tm ` +
        `(${escapeForPdf(encodeWinAnsi(value))}) Tj ET`,
    );
    this.cursor += lineHeight;
  }

  /** Writes wrapped text in a column, one line at a time so it can break pages. */
  paragraph(
    value: string,
    options: TextOptions & { x?: number; width?: number; lineHeight?: number } = {},
  ): void {
    const font = options.font ?? "regular";
    const size = options.size ?? 10;
    const width = options.width ?? CONTENT_WIDTH;
    const lineHeight = options.lineHeight ?? size * 1.4;

    for (const line of wrapText(value, font, size, width)) {
      if (line === "") {
        this.ensure(lineHeight);
        this.cursor += lineHeight * 0.6;
        continue;
      }
      this.text(line, { ...options, lineHeight });
    }
  }

  /** A horizontal rule across the content column. */
  rule(options: { colour?: Rgb; width?: number; gap?: number } = {}): void {
    const colour = options.colour ?? LIGHT;
    const thickness = options.width ?? 0.7;
    const gap = options.gap ?? 6;

    this.ensure(gap * 2 + thickness);
    this.cursor += gap;
    const y = PAGE_HEIGHT - this.cursor;
    this.current.push(
      `${colour.r.toFixed(3)} ${colour.g.toFixed(3)} ${colour.b.toFixed(3)} RG ` +
        `${thickness} w ${MARGIN} ${y.toFixed(2)} m ${(PAGE_WIDTH - MARGIN).toFixed(2)} ${y.toFixed(2)} l S`,
    );
    this.cursor += gap + thickness;
  }

  /** A filled band, drawn behind whatever the callback writes into it. */
  box(height: number, draw: () => void, options: { colour?: Rgb; padding?: number } = {}): void {
    const colour = options.colour ?? PAPER;
    const padding = options.padding ?? 10;

    this.ensure(height + padding * 2);
    const top = PAGE_HEIGHT - this.cursor;
    this.current.push(
      `${colour.r.toFixed(3)} ${colour.g.toFixed(3)} ${colour.b.toFixed(3)} rg ` +
        `${MARGIN} ${(top - height - padding * 2).toFixed(2)} ${CONTENT_WIDTH.toFixed(2)} ` +
        `${(height + padding * 2).toFixed(2)} re f`,
    );
    this.cursor += padding;
    draw();
    this.cursor += padding;
  }

  /**
   * A label on the left and an amount on the right, the shape every total in
   * the product takes.
   */
  row(
    label: string,
    amount: string,
    options: { font?: FontName; size?: number; colour?: Rgb; detail?: string } = {},
  ): void {
    const font = options.font ?? "regular";
    const size = options.size ?? 10;
    const colour = options.colour ?? BLACK;
    const amountWidth = widthOf(amount, font, size) + 16;

    const before = this.cursor;
    const startedOn = this.pages.length;
    this.paragraph(label, { font, size, colour, width: CONTENT_WIDTH - amountWidth });
    const after = this.cursor;

    // Put the amount back on the first line of the label, whatever it wrapped
    // to — unless the label broke the page, in which case that line is behind
    // us and the amount belongs where the cursor now stands.
    if (this.pages.length === startedOn) this.cursor = before;
    this.text(amount, { font, size, colour, x: PAGE_WIDTH - MARGIN, align: "right" });
    this.cursor = Math.max(after, this.cursor);

    if (options.detail) {
      this.paragraph(options.detail, { size: size - 1.5, colour: GREY, width: CONTENT_WIDTH - amountWidth });
    }
  }

  /** Assembles the file. Everything before this point only built strings. */
  build(): Uint8Array<ArrayBuffer> {
    const contents = [...this.pages, this.current.join("\n")].filter(
      (page, index, all) => page !== "" || all.length === 1,
    );
    const pageCount = Math.max(1, contents.length);

    const objects: string[] = [];
    const pageIds: number[] = [];
    // 1 catalog, 2 pages, 3 regular font, 4 bold font, then a pair per page.
    for (let index = 0; index < pageCount; index += 1) pageIds.push(5 + index * 2);

    // Anything the attachment needs comes after the pages, so page numbering
    // stays the simple arithmetic above.
    const nextId = 5 + pageCount * 2;
    const embeddedId = this.attachment ? nextId : 0;
    const filespecId = this.attachment ? nextId + 1 : 0;
    const metadataId = this.attachment || this.title ? nextId + (this.attachment ? 2 : 0) : 0;

    const catalogExtras = [
      this.attachment
        ? `/Names << /EmbeddedFiles << /Names [(${escapeForPdf(encodeWinAnsi(this.attachment.name))}) ${filespecId} 0 R] >> >>`
        : "",
      this.attachment ? `/AF [${filespecId} 0 R]` : "",
      metadataId ? `/Metadata ${metadataId} 0 R` : "",
    ]
      .filter(Boolean)
      .join(" ");

    objects[0] = `<< /Type /Catalog /Pages 2 0 R${catalogExtras ? ` ${catalogExtras}` : ""} >>`;
    objects[1] =
      `<< /Type /Pages /Count ${pageCount} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`;
    objects[2] =
      `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`;
    objects[3] =
      `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`;

    contents.forEach((body, index) => {
      const pageId = pageIds[index];
      const streamId = pageId + 1;
      const footer = this.footerLine(index + 1, pageCount);
      const stream = footer ? `${body}\n${footer}` : body;

      objects[pageId - 1] =
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${streamId} 0 R >>`;
      objects[streamId - 1] =
        `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`;
    });

    if (this.attachment) {
      // The payload is UTF-8; the file is assembled as latin1, so its bytes are
      // carried through a latin1 string rather than re-encoded.
      const payload = Buffer.from(this.attachment.text, "utf8").toString("latin1");
      objects[embeddedId - 1] =
        `<< /Type /EmbeddedFile /Subtype ${nameLiteral(this.attachment.contentType)} ` +
        `/Params << /Size ${payload.length} >> /Length ${payload.length} >>\n` +
        `stream\n${payload}\nendstream`;
      objects[filespecId - 1] =
        `<< /Type /Filespec /F (${escapeForPdf(encodeWinAnsi(this.attachment.name))}) ` +
        `/UF (${escapeForPdf(encodeWinAnsi(this.attachment.name))}) ` +
        `/Desc (${escapeForPdf(encodeWinAnsi(this.attachment.description))}) ` +
        `/AFRelationship /${this.attachment.relationship} ` +
        `/EF << /F ${embeddedId} 0 R >> >>`;
    }

    if (metadataId) {
      const xmp = Buffer.from(this.xmpPacket(), "utf8").toString("latin1");
      objects[metadataId - 1] =
        `<< /Type /Metadata /Subtype /XML /Length ${xmp.length} >>\nstream\n${xmp}\nendstream`;
    }

    let file = "%PDF-1.4\n";
    const offsets: number[] = [];
    objects.forEach((body, index) => {
      offsets.push(Buffer.byteLength(file, "latin1"));
      file += `${index + 1} 0 obj\n${body}\nendobj\n`;
    });

    const xrefOffset = Buffer.byteLength(file, "latin1");
    file += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const offset of offsets) file += `${String(offset).padStart(10, "0")} 00000 n \n`;
    file +=
      `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n` +
      `startxref\n${xrefOffset}\n%%EOF\n`;

    // Copied into a plain ArrayBuffer so the result is a body `Response`
    // accepts; Node's Buffer may sit on a shared one.
    const source = Buffer.from(file, "latin1");
    const bytes = new Uint8Array(new ArrayBuffer(source.byteLength));
    bytes.set(source);
    return bytes;
  }

  /**
   * The XMP packet.
   *
   * It announces the attached invoice the way a Factur-X reader expects —
   * document type, file name, version, conformance level — through the
   * extension schema the specification defines.
   *
   * **It deliberately does not claim PDF/A-3 conformance.** Claiming `pdfaid`
   * without meeting the rest (every font embedded, an ICC output intent, a
   * document ID) would be a false statement inside a document that is meant to
   * be relied upon. What is missing is written down in `documents.ts`; until
   * then the file is a hybrid invoice carrying a valid EN 16931 payload, and
   * says no more than that.
   */
  private xmpPacket(): string {
    const escape = (value: string) =>
      value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const factur = this.facturX
      ? `
  <rdf:Description rdf:about="" xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#">
   <fx:DocumentType>${escape(this.facturX.documentType)}</fx:DocumentType>
   <fx:DocumentFileName>${escape(this.facturX.fileName)}</fx:DocumentFileName>
   <fx:Version>${escape(this.facturX.version)}</fx:Version>
   <fx:ConformanceLevel>${escape(this.facturX.conformanceLevel)}</fx:ConformanceLevel>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/" xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#" xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#">
   <pdfaExtension:schemas><rdf:Bag><rdf:li rdf:parseType="Resource">
    <pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema>
    <pdfaSchema:namespaceURI>urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#</pdfaSchema:namespaceURI>
    <pdfaSchema:prefix>fx</pdfaSchema:prefix>
    <pdfaSchema:property><rdf:Seq>${["DocumentType", "DocumentFileName", "Version", "ConformanceLevel"]
      .map(
        (name) =>
          `\n     <rdf:li rdf:parseType="Resource"><pdfaProperty:name>${name}</pdfaProperty:name>` +
          `<pdfaProperty:valueType>Text</pdfaProperty:valueType>` +
          `<pdfaProperty:category>external</pdfaProperty:category>` +
          `<pdfaProperty:description>${name}</pdfaProperty:description></rdf:li>`,
      )
      .join("")}
    </rdf:Seq></pdfaSchema:property>
   </rdf:li></rdf:Bag></pdfaExtension:schemas>
  </rdf:Description>`
      : "";

    const title = this.title
      ? `
  <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
   <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${escape(this.title)}</rdf:li></rdf:Alt></dc:title>
  </rdf:Description>`
      : "";

    return `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">${title}${factur}
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
  }

  /** `Devis DEV-2026-0001 · 2 / 3`, drawn below the bottom margin. */
  private footerLine(page: number, total: number): string {
    if (!this.footerText && total < 2) return "";
    const label = this.footerText
      ? `${this.footerText}${total > 1 ? ` · ${page} / ${total}` : ""}`
      : `${page} / ${total}`;

    const size = 7.5;
    const x = PAGE_WIDTH / 2 - widthOf(label, "regular", size) / 2;
    return (
      `BT ${GREY.r.toFixed(3)} ${GREY.g.toFixed(3)} ${GREY.b.toFixed(3)} rg ` +
      `/F1 ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${(MARGIN - 24).toFixed(2)} Tm ` +
      `(${escapeForPdf(encodeWinAnsi(label))}) Tj ET`
    );
  }
}
