import { inflateRawSync, inflateSync } from "node:zlib";
import { decodeWinAnsi } from "../pdf";

/**
 * Sortir le texte d'un fichier que l'agence a déjà.
 *
 * Un conseiller dépose ce qu'il a sous la main : le PDF envoyé par son
 * réceptif, le Word qu'il a mis en forme, ou simplement le corps d'un e-mail
 * collé. Ce module ne comprend rien au voyage — il rend des lignes, que
 * `parse.ts` lit ensuite.
 *
 * **Aucune dépendance, aucun réseau.** Un PDF est une suite d'objets dont les
 * flux sont compressés avec zlib, et un .docx est une archive zip contenant du
 * XML : Node sait déjà tout faire. Le prix à payer est une couverture
 * imparfaite, et il vaut mieux le dire que le masquer :
 *
 * - **un PDF scanné ne rend rien.** Il n'y a pas de texte dedans, seulement une
 *   image. Il faudrait de la reconnaissance de caractères, qui est un autre
 *   métier ;
 * - **un PDF aux polices incorporées en Identity-H** rend des caractères faux :
 *   le fichier remplace alors les lettres par des numéros de glyphes, qu'on ne
 *   peut relire qu'avec la table du document. C'est courant dans les PDF
 *   produits par des outils de mise en page, rare dans ceux qui sortent de
 *   Word ;
 * - **les objets compressés (ObjStm)** des PDF récents ne sont pas parcourus.
 *
 * Dans ces trois cas, la fonction rend peu ou pas de texte plutôt que du bruit,
 * et `looksEmpty` permet à l'écran de proposer le collage manuel — qui marche
 * toujours.
 */

export type SourceKind = "pdf" | "docx" | "text";

export function kindOf(fileName: string, contentType: string): SourceKind {
  const name = fileName.toLowerCase();
  if (contentType === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (
    contentType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.endsWith(".docx")
  ) {
    return "docx";
  }
  return "text";
}

/* ------------------------------------------------------------------- pdf */

/**
 * Le texte d'un PDF.
 *
 * On lit les flux de contenu — décompressés quand ils le sont — et on y
 * cherche les opérateurs qui dessinent du texte : `Tj` pour une chaîne, `TJ`
 * pour une suite de chaînes et d'espacements, `'` et `"` pour une chaîne
 * précédée d'un retour à la ligne.
 */
export function textFromPdf(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes).toString("latin1");
  const pieces: string[] = [];

  for (const match of raw.matchAll(/<<([\s\S]*?)>>\s*stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    const [, dictionary, body] = match;
    // Une image ou une police ne porte pas de programme : on ne les ouvre pas.
    if (/\/Subtype\s*\/(Image|Type1C|TrueType|CIDFontType\d|FontFile)/.test(dictionary)) continue;

    let content = body;
    if (/\/FlateDecode/.test(dictionary)) {
      const compressed = Buffer.from(body, "latin1");
      try {
        content = inflateSync(compressed).toString("latin1");
      } catch {
        try {
          content = inflateRawSync(compressed).toString("latin1");
        } catch {
          // Flux illisible : on le passe plutôt que de rendre du bruit.
          continue;
        }
      }
    }

    const text = textFromContentStream(content);
    if (text.trim()) pieces.push(text);
  }

  return pieces.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Les chaînes dessinées par un flux de contenu, dans l'ordre. */
export function textFromContentStream(content: string): string {
  let out = "";

  for (const match of content.matchAll(
    /(\[[\s\S]*?\]\s*TJ)|(\((?:\\.|[^\\()])*\)\s*(Tj|'|"))|(\bET\b|\bTd\b|\bTD\b|\bT\*\b)/g,
  )) {
    const [chunk] = match;

    if (chunk.endsWith("TJ")) {
      // Un tableau alterne chaînes et espacements ; un espacement très négatif
      // sépare deux mots, ce que le PDF n'écrit pas comme une espace.
      for (const part of chunk.matchAll(/\((?:\\.|[^\\()])*\)|-?\d+(?:\.\d+)?/g)) {
        const value = part[0];
        if (value.startsWith("(")) out += decodePdfString(value.slice(1, -1));
        else if (Number(value) < -120) out += " ";
      }
      continue;
    }

    if (chunk.endsWith("Tj") || chunk.endsWith("'") || chunk.endsWith('"')) {
      const string = /\(((?:\\.|[^\\()])*)\)/.exec(chunk);
      if (chunk.endsWith("'") || chunk.endsWith('"')) out += "\n";
      if (string) out += decodePdfString(string[1]);
      continue;
    }

    // `ET` ferme un objet texte : dans un PDF où chaque ligne est positionnée
    // par un `Tm`, c'est le seul repère de fin de ligne.
    if (chunk === "ET" || chunk === "T*" || chunk === "Td" || chunk === "TD") out += "\n";
  }

  return out;
}

/** Une chaîne PDF : échappements désamorcés, puis WinAnsi vers Unicode. */
export function decodePdfString(raw: string): string {
  const bytes: number[] = [];

  for (let index = 0; index < raw.length; index += 1) {
    if (raw[index] !== "\\") {
      bytes.push(raw.charCodeAt(index));
      continue;
    }

    const next = raw[index + 1];
    const octal = /^[0-7]{1,3}/.exec(raw.slice(index + 1));
    if (octal) {
      bytes.push(parseInt(octal[0], 8) & 0xff);
      index += octal[0].length;
    } else if (next === "n") {
      bytes.push(10);
      index += 1;
    } else if (next === "r" || next === "t") {
      bytes.push(32);
      index += 1;
    } else if (next !== undefined) {
      bytes.push(raw.charCodeAt(index + 1));
      index += 1;
    }
  }

  return decodeWinAnsi(bytes);
}

/* ------------------------------------------------------------------ docx */

/**
 * Le texte d'un .docx.
 *
 * Un .docx est une archive zip ; tout le texte vit dans `word/document.xml`.
 * On y lit les paragraphes (`w:p`), les sauts de ligne (`w:br`) et les cellules
 * de tableau, parce qu'une agence sur deux met son programme en tableau.
 */
export function textFromDocx(bytes: Uint8Array): string {
  const xml = readZipEntry(Buffer.from(bytes), "word/document.xml");
  if (!xml) return "";
  return textFromWordXml(xml.toString("utf8"));
}

export function textFromWordXml(xml: string): string {
  return (
    xml
      // Certains outils indentent le XML. Ces retours à la ligne-là sont de la
      // mise en forme de fichier, pas du texte : les garder couperait une
      // ligne de tableau en deux.
      .replace(/>\s*\n\s*</g, "><")
      // Les cellules d'abord : un paragraphe à l'intérieur d'une cellule ne
      // casse pas la ligne, sinon « Jour 1 | Arrivée » se lirait sur deux
      // lignes et le marqueur de journée perdrait son titre.
      .replace(/<w:tc\b[\s\S]*?<\/w:tc>/g, (cell) =>
        `${cell.replace(/<\/w:p>/g, " ").replace(/<w:br\b[^>]*\/?>/g, " ")} `,
      )
      .replace(/<\/w:tr>/g, "\n")
      .replace(/<w:br\b[^>]*\/?>/g, "\n")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/**
 * Une entrée d'archive zip, décompressée.
 *
 * On passe par le répertoire central, en fin de fichier : c'est lui qui fait
 * foi, et c'est la seule façon fiable de trouver une entrée sans parcourir
 * toute l'archive.
 */
export function readZipEntry(archive: Buffer, wanted: string): Buffer | null {
  const end = archive.lastIndexOf("PK\x05\x06", archive.length, "latin1");
  if (end < 0) return null;

  const entries = archive.readUInt16LE(end + 10);
  let cursor = archive.readUInt32LE(end + 16);

  for (let index = 0; index < entries; index += 1) {
    if (archive.readUInt32LE(cursor) !== 0x02014b50) return null;

    const nameLength = archive.readUInt16LE(cursor + 28);
    const extraLength = archive.readUInt16LE(cursor + 30);
    const commentLength = archive.readUInt16LE(cursor + 32);
    const name = archive.toString("utf8", cursor + 46, cursor + 46 + nameLength);
    const localOffset = archive.readUInt32LE(cursor + 42);

    if (name === wanted) {
      const method = archive.readUInt16LE(localOffset + 8);
      const localName = archive.readUInt16LE(localOffset + 26);
      const localExtra = archive.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + localName + localExtra;
      const compressedSize = archive.readUInt32LE(cursor + 20);
      const body = archive.subarray(start, start + compressedSize);

      try {
        return method === 0 ? Buffer.from(body) : inflateRawSync(body);
      } catch {
        return null;
      }
    }

    cursor += 46 + nameLength + extraLength + commentLength;
  }

  return null;
}

/* ----------------------------------------------------------------- texte */

/**
 * Du texte brut, ou le corps d'un e-mail.
 *
 * Un `.eml` commence par ses en-têtes, séparés du corps par une ligne vide :
 * les garder noierait le programme sous des `Received:`.
 */
export function textFromPlain(bytes: Uint8Array): string {
  const text = Buffer.from(bytes).toString("utf8").replace(/^﻿/, "");
  if (/^(?:From|To|Subject|Date|Received|Message-ID):/im.test(text.slice(0, 500))) {
    const blank = text.indexOf("\n\n");
    if (blank > 0) return text.slice(blank + 2).trim();
  }
  return text.trim();
}

/** Le texte d'un fichier, quel qu'il soit. Ne jette jamais. */
export function extractText(input: {
  fileName: string;
  contentType: string;
  bytes: Uint8Array;
}): { kind: SourceKind; text: string } {
  const kind = kindOf(input.fileName, input.contentType);
  try {
    if (kind === "pdf") return { kind, text: textFromPdf(input.bytes) };
    if (kind === "docx") return { kind, text: textFromDocx(input.bytes) };
    return { kind, text: textFromPlain(input.bytes) };
  } catch {
    // Un fichier illisible n'est pas une panne : l'écran proposera le collage.
    return { kind, text: "" };
  }
}

/**
 * Vrai quand il n'y a pas assez de texte pour espérer en tirer un programme.
 * C'est ce qui déclenche « collez plutôt votre texte » plutôt qu'un écran vide.
 */
export function looksEmpty(text: string): boolean {
  return text.replace(/\s+/g, "").length < 40;
}
