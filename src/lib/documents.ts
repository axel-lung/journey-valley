import {
  BLACK,
  CONTENT_WIDTH,
  GREY,
  MARGIN,
  PAGE_WIDTH,
  PAPER,
  PdfDocument,
  parseColour,
  type Rgb,
} from "./pdf";
import { formatDate, formatDateRange, formatNights, formatTravellers } from "./format";
import { formatMoney, type Currency } from "./money";
import { INVOICE_KIND_LABEL, MARGIN_SCHEME_MENTION, type Invoice } from "./invoices";
import { legalMentions, STANDARD_FORM_SOURCE, TRAVELLER_RIGHTS } from "./legal";
import { ATTACHMENT_NAME, CONFORMANCE_LEVEL } from "./facturx";
import { depositCents, type Quote, type QuoteLine } from "./quotes";
import { buildItinerary } from "./itinerary";
import { tripNights } from "./budget";
import type { Agency, Booking, ChecklistItem, Trip } from "./types";

/**
 * Les documents que l'agence remet : le devis, la facture, le carnet.
 *
 * Jusqu'ici ces trois pages n'existaient qu'à l'écran, avec une feuille de
 * style d'impression. Ça ne suffit pas pour vendre : un client attend une
 * pièce jointe, un comptable une pièce, et un voyageur un fichier qu'il garde
 * dans son téléphone.
 *
 * **Ce module ne lit jamais un prix d'achat ni une marge.** Il reçoit ce qui
 * est déjà public — les lignes figées du devis, le montant de la facture, le
 * programme — et rien d'autre ne lui est passé. La règle des deux vues ne
 * tient pas à un `if` ici : elle tient à la signature des fonctions.
 *
 * Et la facture ne porte pas de TVA. Sous le régime de la marge, ne pas la
 * mentionner est une condition d'application du régime ; la mention
 * « Régime particulier – agences de voyages » est en revanche obligatoire.
 */

/** Ce qu'il faut de l'agence pour en-têter un document. */
type Letterhead = Agency | null;

function brandOf(agency: Letterhead): Rgb {
  return agency ? parseColour(agency.brand_colour) : BLACK;
}

/**
 * Le bandeau du haut : l'agence à gauche, la référence à droite.
 * Renvoie le bas du bandeau pour que la suite s'y accroche.
 */
function letterhead(
  doc: PdfDocument,
  agency: Letterhead,
  right: { title: string; lines: string[] },
): void {
  const brand = brandOf(agency);
  const top = doc.y;

  doc.text((agency?.name ?? "Votre agence").toUpperCase(), {
    font: "bold",
    size: 9,
    colour: brand,
  });
  if (agency?.legal_name && agency.legal_name !== agency.name) {
    doc.text(agency.legal_name, { size: 9, colour: GREY });
  }
  for (const line of [agency?.email, agency?.phone, agency?.website].filter(Boolean)) {
    doc.text(line as string, { size: 9, colour: GREY });
  }

  // La colonne de droite se dessine à la hauteur du bandeau, pas à la suite.
  const left = doc.y;
  doc.move(top - doc.y);
  doc.text(right.title, {
    font: "bold",
    size: 16,
    colour: BLACK,
    x: PAGE_WIDTH - MARGIN,
    align: "right",
  });
  for (const line of right.lines) {
    doc.text(line, { size: 9, colour: GREY, x: PAGE_WIDTH - MARGIN, align: "right" });
  }

  doc.move(Math.max(left, doc.y) - doc.y);
  doc.rule({ colour: brand, width: 1.2, gap: 10 });
}

/** Les mentions obligatoires, en deux colonnes, en bas du document. */
function legalFooter(doc: PdfDocument, agency: Letterhead): void {
  doc.rule({ gap: 12 });
  const mentions = legalMentions(agency);
  const columnWidth = CONTENT_WIDTH / 2 - 10;

  for (let index = 0; index < mentions.length; index += 2) {
    const pair = mentions.slice(index, index + 2);
    const top = doc.y;
    let bottom = top;

    pair.forEach((mention, column) => {
      doc.move(top - doc.y);
      const x = MARGIN + column * (columnWidth + 20);
      doc.text(mention.label, { font: "bold", size: 7.5, colour: BLACK, x });
      doc.paragraph(mention.missing ? "à compléter par l'agence" : mention.value, {
        size: 7.5,
        colour: GREY,
        x,
        width: columnWidth,
      });
      bottom = Math.max(bottom, doc.y);
    });

    doc.move(bottom - doc.y + 4);
  }
}

/* ------------------------------------------------------------------ devis */

export interface QuoteDocumentInput {
  quote: Quote;
  lines: QuoteLine[];
  trip: Trip;
  agency: Letterhead;
  /** Les prestations, pour le programme. Aucun montant n'en est lu. */
  bookings: Booking[];
}

/**
 * Le devis remis au client.
 *
 * Il porte ce que le code du tourisme exige d'un forfait : mentions de
 * l'agence, formulaire d'information standardisé, conditions. C'est ce qui
 * sépare un devis opposable d'une jolie mise en page — et c'est l'argument de
 * vente du produit, donc il ne se dégrade pas à l'impression.
 */
export function quotePdf(input: QuoteDocumentInput): Uint8Array<ArrayBuffer> {
  const { quote, lines, trip, agency } = input;
  const currency = trip.currency as Currency;
  const doc = new PdfDocument({ footer: `Devis ${quote.reference}` });

  letterhead(doc, agency, {
    title: "Devis",
    lines: [
      quote.reference,
      `Établi le ${formatDate(quote.created_at.slice(0, 10))}`,
      ...(quote.valid_until ? [`Valable jusqu'au ${formatDate(quote.valid_until)}`] : []),
    ],
  });

  doc.move(6);
  doc.paragraph(quote.title, { font: "bold", size: 18 });
  doc.paragraph(
    `${trip.destination_city}, ${trip.destination_country} · ` +
      `${formatDateRange(trip.start_date, trip.end_date)} · ${formatNights(tripNights(trip))} · ` +
      formatTravellers(trip.travellers),
    { size: 10, colour: GREY },
  );

  if (quote.intro) {
    doc.move(8);
    doc.paragraph(quote.intro, { size: 10, lineHeight: 15 });
  }

  /* Le détail : uniquement les lignes figées à l'envoi. */
  doc.move(14);
  doc.text("VOTRE VOYAGE", { font: "bold", size: 9, colour: brandOf(agency) });
  doc.rule({ gap: 4 });

  for (const line of lines) {
    doc.ensure(34);
    doc.row(line.label, formatMoney(line.price_cents, currency), { font: "bold", size: 10.5 });
    if (line.detail) doc.paragraph(line.detail, { size: 9, colour: GREY, width: CONTENT_WIDTH - 90 });
    if (line.start_at) {
      const dates = line.end_at
        ? `${formatDate(line.start_at.slice(0, 10))} → ${formatDate(line.end_at.slice(0, 10))}`
        : formatDate(line.start_at.slice(0, 10));
      doc.text(dates, { size: 8.5, colour: GREY });
    }
    doc.rule({ gap: 5 });
  }

  doc.move(2);
  doc.row("Total", formatMoney(quote.total_cents, currency), { font: "bold", size: 13 });
  if (quote.deposit_percent > 0) {
    doc.row(
      `dont acompte à la confirmation (${quote.deposit_percent} %)`,
      formatMoney(depositCents(quote), currency),
      { size: 9.5, colour: GREY },
    );
  }
  doc.move(4);
  doc.paragraph(
    "Prix nets par dossier, taxes et frais compris sauf mention contraire. La TVA applicable est " +
      "celle du régime de la marge des agences de voyages.",
    { size: 8, colour: GREY },
  );

  /* Le programme, reconstruit depuis les prestations — sans un seul montant. */
  const itinerary = buildItinerary(trip, input.bookings, []);
  const filled = itinerary.days.filter(
    (day) => day.starts.length + day.returns.length + day.ongoing.length > 0,
  );

  if (filled.length > 0) {
    doc.move(18);
    doc.text("LE PROGRAMME", { font: "bold", size: 9, colour: brandOf(agency) });
    doc.rule({ gap: 4 });

    for (const day of itinerary.days) {
      doc.ensure(26);
      doc.text(`Jour ${day.day_number} — ${formatDate(day.date)}`, { font: "bold", size: 9.5 });
      const entries = [
        ...day.starts.map((booking) =>
          booking.description ? `${booking.vendor} — ${booking.description}` : booking.vendor,
        ),
        ...day.returns.map((booking) => `${booking.vendor} — retour`),
        ...(day.ongoing.length > 0
          ? [`En cours : ${day.ongoing.map((booking) => booking.vendor).join(", ")}`]
          : []),
      ];
      if (entries.length === 0) doc.text("Journée libre.", { size: 9.5, colour: GREY });
      for (const entry of entries) doc.paragraph(entry, { size: 9.5, width: CONTENT_WIDTH - 12, x: MARGIN + 12 });
      doc.move(4);
    }
  }

  if (quote.terms) {
    doc.move(14);
    doc.text("CONDITIONS", { font: "bold", size: 9, colour: brandOf(agency) });
    doc.rule({ gap: 4 });
    doc.paragraph(quote.terms, { size: 9, lineHeight: 13.5 });
  }

  /* Le formulaire standardisé : sur sa propre page, parce qu'il se remet. */
  doc.newPage();
  doc.text("FORMULAIRE D'INFORMATION STANDARDISÉ", {
    font: "bold",
    size: 9,
    colour: brandOf(agency),
  });
  doc.rule({ gap: 4 });
  doc.paragraph(
    "La combinaison de services de voyage qui vous est proposée constitue un forfait au sens de " +
      "la directive (UE) 2015/2302, transposée au code du tourisme. Vous bénéficierez donc de tous " +
      "les droits octroyés par l'Union européenne applicables aux forfaits. " +
      `${agency?.name ?? "Votre agence"} sera entièrement responsable de la bonne exécution du ` +
      "forfait dans son ensemble, et dispose de la garantie financière mentionnée ci-dessous pour " +
      "rembourser vos paiements et, si le transport est compris, pour assurer votre rapatriement " +
      "en cas d'insolvabilité.",
    { size: 9, lineHeight: 13.5 },
  );

  doc.move(10);
  doc.text("Droits essentiels au titre de la directive (UE) 2015/2302", {
    font: "bold",
    size: 9.5,
  });
  doc.move(4);
  for (const right of TRAVELLER_RIGHTS) {
    doc.ensure(24);
    const top = doc.y;
    doc.text("—", { size: 9, colour: GREY });
    doc.move(top - doc.y);
    doc.paragraph(right, { size: 9, lineHeight: 13, x: MARGIN + 14, width: CONTENT_WIDTH - 14 });
    doc.move(3);
  }

  doc.move(6);
  doc.paragraph(
    `Modèle officiel et texte de référence : ${STANDARD_FORM_SOURCE}. Les dispositions du code ` +
      "du tourisme relatives aux forfaits (art. L211-1 et suivants, R211-1 et suivants) vous sont " +
      "communiquées avec le contrat.",
    { size: 8, colour: GREY },
  );

  legalFooter(doc, agency);
  doc.move(6);
  doc.paragraph(
    `Devis ${quote.reference} établi le ${formatDate(quote.created_at.slice(0, 10))}. Document ` +
      "sans valeur de contrat : le contrat de voyage vous sera remis par écrit avant tout versement.",
    { size: 7.5, colour: GREY },
  );

  return doc.build();
}

/* ---------------------------------------------------------------- facture */

export interface InvoiceDocumentInput {
  invoice: Invoice;
  trip: Trip;
  agency: Letterhead;
  /** À qui la facture est adressée ; vide quand le dossier n'est rattaché à personne. */
  billTo: { name: string; email: string } | null;
  /**
   * Le XML Factur-X à joindre, quand l'agence a de quoi l'émettre.
   *
   * La facture devient alors **hybride** : la page qu'une personne lit, et la
   * version que la machine lit, dans le même fichier. C'est la forme que la
   * réforme de la facturation électronique attend.
   *
   * ⚠️ Ce que le fichier produit **n'est pas encore un PDF/A-3**, et ne le
   * prétend pas : il y manque l'incorporation des polices, un profil
   * colorimétrique de sortie et l'identification `pdfaid`. Le XML, lui, est
   * complet et se télécharge aussi seul — c'est lui que lit un comptable ou
   * une plateforme. La conformité PDF/A reste à faire avant de déposer sur une
   * plateforme qui la valide.
   */
  facturX?: string | null;
}

/**
 * La facture remise au client.
 *
 * **Aucune TVA n'y figure, et c'est la règle, pas un oubli.** La mention du
 * régime particulier, elle, est obligatoire sous peine d'amende par facture.
 */
export function invoicePdf(input: InvoiceDocumentInput): Uint8Array<ArrayBuffer> {
  const { invoice, trip, agency, billTo } = input;
  const currency = trip.currency as Currency;
  const doc = new PdfDocument({
    footer: `${INVOICE_KIND_LABEL[invoice.kind]} ${invoice.reference}`,
    title: `${INVOICE_KIND_LABEL[invoice.kind]} ${invoice.reference} — ${trip.title}`,
  });

  if (input.facturX) {
    doc.attach(
      {
        name: ATTACHMENT_NAME,
        contentType: "text/xml",
        description: "Facture électronique au format Factur-X (EN 16931)",
        // Les deux formes portent la même facture, ce que la spécification
        // appelle « Alternative ».
        relationship: "Alternative",
        text: input.facturX,
      },
      {
        documentType: "INVOICE",
        fileName: ATTACHMENT_NAME,
        version: "1.0",
        conformanceLevel: CONFORMANCE_LEVEL,
      },
    );
  }

  letterhead(doc, agency, {
    title: INVOICE_KIND_LABEL[invoice.kind],
    lines: [
      invoice.reference,
      invoice.issued_at
        ? `Émise le ${formatDate(invoice.issued_at.slice(0, 10))}`
        : "Brouillon, non émise",
      ...(invoice.due_date ? [`Échéance : ${formatDate(invoice.due_date)}`] : []),
    ],
  });

  if (billTo) {
    doc.move(8);
    doc.text("FACTURÉ À", { font: "bold", size: 8, colour: GREY });
    doc.text(billTo.name, { font: "bold", size: 10.5 });
    if (billTo.email) doc.text(billTo.email, { size: 9, colour: GREY });
  }

  if (invoice.status === "cancelled") {
    doc.move(10);
    doc.paragraph(
      "Facture annulée. Son numéro est conservé pour la continuité de la numérotation.",
      { font: "bold", size: 10 },
    );
  }

  doc.move(16);
  doc.text("OBJET", { font: "bold", size: 9, colour: brandOf(agency) });
  doc.rule({ gap: 4 });

  doc.row(invoice.label || trip.title, formatMoney(invoice.total_cents, currency), {
    font: "bold",
    size: 10.5,
  });
  doc.paragraph(
    `${trip.destination_city}, ${trip.destination_country} · ` +
      formatDateRange(trip.start_date, trip.end_date),
    { size: 9, colour: GREY },
  );
  doc.text(`${INVOICE_KIND_LABEL[invoice.kind]} sur le voyage à forfait`, {
    size: 8.5,
    colour: GREY,
  });

  doc.rule({ gap: 8 });
  doc.row("Total à payer", formatMoney(invoice.total_cents, currency), {
    font: "bold",
    size: 14,
  });

  if (invoice.status === "paid") {
    doc.move(6);
    doc.paragraph(`Réglée le ${formatDate((invoice.paid_at ?? "").slice(0, 10))}. Merci.`, {
      font: "bold",
      size: 10,
    });
  }

  /* La mention du régime : encadrée, parce que c'est elle qu'on vérifie. */
  doc.move(14);
  doc.box(
    34,
    () => {
      doc.text(MARGIN_SCHEME_MENTION, { font: "bold", size: 9.5, x: MARGIN + 12 });
      doc.paragraph(
        "La TVA n'est pas mentionnée sur cette facture et n'est pas récupérable par le client, " +
          "conformément au régime particulier applicable aux agences de voyages " +
          "(art. 266-1-e du code général des impôts).",
        { size: 8.5, colour: GREY, x: MARGIN + 12, width: CONTENT_WIDTH - 24, lineHeight: 12 },
      );
    },
    { colour: PAPER },
  );

  if (invoice.payment_note) {
    doc.move(10);
    doc.text("Règlement", { font: "bold", size: 9 });
    doc.paragraph(invoice.payment_note, { size: 9, colour: GREY });
  }

  if (input.facturX) {
    doc.move(8);
    doc.paragraph(
      `Cette facture porte sa version structurée (${ATTACHMENT_NAME}, Factur-X ` +
        `${CONFORMANCE_LEVEL}) en pièce jointe, pour votre comptabilité.`,
      { size: 8, colour: GREY },
    );
  }

  legalFooter(doc, agency);
  doc.move(6);
  doc.paragraph(
    "Pénalités de retard : taux d'intérêt légal majoré, et indemnité forfaitaire de 40 € pour " +
      "frais de recouvrement entre professionnels. Pas d'escompte pour paiement anticipé.",
    { size: 7.5, colour: GREY },
  );

  return doc.build();
}

/* ----------------------------------------------------------------- carnet */

export interface TravelBookInput {
  trip: Trip;
  agency: Letterhead;
  bookings: Booking[];
  checklist: ChecklistItem[];
  travellers: string[];
  /**
   * Vrai pour le conseiller. Le carnet ne change pas de contenu — il n'y a
   * aucun montant dedans — mais le conseiller voit les références fournisseur
   * dont le voyageur n'a que faire.
   */
  advisor: boolean;
}

/**
 * Le carnet de voyage : le document qu'on remet avant le départ.
 *
 * Il ne porte aucun prix, ni de vente ni d'achat. C'est un programme, des
 * références et une liste de préparatifs — ce qu'on emporte.
 */
export function travelBookPdf(input: TravelBookInput): Uint8Array<ArrayBuffer> {
  const { trip, agency, bookings, checklist, travellers } = input;
  const doc = new PdfDocument({ footer: trip.title });
  const brand = brandOf(agency);

  letterhead(doc, agency, {
    title: "Carnet de voyage",
    lines: [formatDateRange(trip.start_date, trip.end_date), formatNights(tripNights(trip))],
  });

  doc.move(10);
  doc.paragraph(trip.title, { font: "bold", size: 20 });
  doc.paragraph(`${trip.destination_city}, ${trip.destination_country}`, {
    size: 11,
    colour: GREY,
  });
  if (travellers.length > 0) {
    doc.move(4);
    doc.paragraph(travellers.join(" · "), { size: 9.5, colour: GREY });
  }
  if (trip.summary) {
    doc.move(10);
    doc.paragraph(trip.summary, { size: 10, lineHeight: 15 });
  }

  if (agency?.phone || agency?.email) {
    doc.move(14);
    doc.box(
      26,
      () => {
        doc.text("En cas de difficulté, joignez votre conseiller", {
          font: "bold",
          size: 9.5,
          x: MARGIN + 12,
        });
        doc.text([agency?.phone, agency?.email].filter(Boolean).join(" · "), {
          size: 9.5,
          colour: GREY,
          x: MARGIN + 12,
        });
      },
      { colour: PAPER },
    );
  }

  const itinerary = buildItinerary(trip, bookings, []);
  doc.move(18);
  doc.text("JOUR PAR JOUR", { font: "bold", size: 9, colour: brand });
  doc.rule({ gap: 4 });

  for (const day of itinerary.days) {
    doc.ensure(30);
    doc.text(`Jour ${day.day_number} — ${formatDate(day.date)}`, { font: "bold", size: 10 });

    const entries = [
      ...day.starts.map((booking) => ({ booking, suffix: booking.description })),
      ...day.returns.map((booking) => ({ booking, suffix: "retour" })),
    ];
    if (entries.length === 0 && day.ongoing.length === 0) {
      doc.text("Journée libre.", { size: 9.5, colour: GREY, x: MARGIN + 12 });
    }
    for (const { booking, suffix } of entries) {
      doc.paragraph(suffix ? `${booking.vendor} — ${suffix}` : booking.vendor, {
        size: 9.5,
        x: MARGIN + 12,
        width: CONTENT_WIDTH - 12,
      });
      if (booking.reference) {
        doc.text(`Référence ${booking.reference}`, { size: 8.5, colour: brand, x: MARGIN + 12 });
      }
    }
    if (day.ongoing.length > 0) {
      doc.paragraph(`En cours : ${day.ongoing.map((booking) => booking.vendor).join(", ")}`, {
        size: 9,
        colour: GREY,
        x: MARGIN + 12,
        width: CONTENT_WIDTH - 12,
      });
    }
    doc.move(5);
  }

  if (bookings.length > 0) {
    doc.move(14);
    doc.text("VOS RÉSERVATIONS", { font: "bold", size: 9, colour: brand });
    doc.rule({ gap: 4 });
    for (const booking of bookings) {
      doc.ensure(24);
      doc.text(booking.vendor, { font: "bold", size: 9.5 });
      const detail = [
        formatDate(booking.start_at.slice(0, 10)),
        booking.description,
        booking.reference ? `réf. ${booking.reference}` : "",
      ]
        .filter(Boolean)
        .join(" · ");
      doc.paragraph(detail, { size: 9, colour: GREY });
      doc.move(3);
    }
  }

  if (checklist.length > 0) {
    doc.move(14);
    doc.text("AVANT DE PARTIR", { font: "bold", size: 9, colour: brand });
    doc.rule({ gap: 4 });
    for (const item of checklist) {
      doc.ensure(16);
      const top = doc.y;
      doc.text(item.done === 1 ? "[x]" : "[ ]", { size: 9.5, colour: item.done === 1 ? GREY : BLACK });
      doc.move(top - doc.y);
      doc.paragraph(item.label, {
        size: 9.5,
        colour: item.done === 1 ? GREY : BLACK,
        x: MARGIN + 22,
        width: CONTENT_WIDTH - 22,
      });
    }
  }

  legalFooter(doc, agency);
  return doc.build();
}

/** Un nom de fichier propre pour un téléchargement : `devis-DEV-2026-0001.pdf`. */
export function fileName(prefix: string, reference: string): string {
  const slug = reference
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return `${prefix}-${slug || "document"}.pdf`;
}

/** Les en-têtes d'une réponse PDF, au même endroit pour les trois routes. */
export function pdfHeaders(name: string, bytes: Uint8Array): Record<string, string> {
  return {
    "content-type": "application/pdf",
    "content-length": String(bytes.byteLength),
    // `inline` : le navigateur l'ouvre, et le bouton « enregistrer » reste là.
    "content-disposition": `inline; filename="${name}"`,
    "cache-control": "private, no-store",
  };
}
