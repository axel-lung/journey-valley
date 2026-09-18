import { MARGIN_SCHEME_MENTION, type Invoice } from "./invoices";
import type { Agency, Trip, VatZone } from "./types";

/**
 * La facture au format Factur-X, profil BASIC.
 *
 * Ce qui arrive : à partir du **1er septembre 2026** toute entreprise
 * assujettie doit pouvoir *recevoir* une facture électronique via une
 * plateforme agréée, et les PME devront l'*émettre* au format structuré au
 * **1er septembre 2027**. Une facture en HTML ou en PDF ordinaire ne passera
 * plus.
 *
 * Ce module produit le XML — un CrossIndustryInvoice (CII) conforme à la norme
 * EN 16931 — que `pdf.ts` attache ensuite à la facture. Il est pur : rien
 * n'en sort qu'une chaîne, ce qui le rend testable ligne à ligne, et c'est ce
 * qu'il faut pour un document qui engage.
 *
 * ## Le piège du régime de la marge
 *
 * C'est là que les éditeurs généralistes se trompent, et c'est la raison
 * d'être de ce fichier. Sous le régime particulier des agences de voyages :
 *
 * - **La TVA ne se chiffre pas.** Ni montant, ni taux. La faire apparaître
 *   ouvrirait à tort un droit à déduction au client et ferait tomber le
 *   régime. Dans le XML, cela se dit : catégorie `E`, taux `0`, taxe `0`.
 * - **La base imposable déclarée est le prix total**, pas la marge. Le XML ne
 *   doit contenir aucun moyen de reconstituer la marge — c'est la même règle
 *   que pour le PDF, et elle vaut ici parce que le fichier part chez le
 *   client.
 * - **Le motif se code.** `VATEX-EU-306` pour le régime de la marge des
 *   services de voyage (art. 306 de la directive 2006/112/CE), `VATEX-EU-309`
 *   quand les prestations sont exécutées hors de l'Union et donc exonérées.
 *   Le texte du motif reste la mention française obligatoire.
 *
 * ⚠️ Comme pour le formulaire standardisé de `legal.ts`, les codes ci-dessous
 * ont été établis d'après la documentation publique de la norme, sans accès à
 * la liste officielle VATEX depuis cette machine. À confronter à la liste
 * publiée par la Commission avant la première émission réelle — et à valider
 * contre la plateforme retenue, qui est seule juge.
 */

/** L'identifiant du profil : ce que le lecteur du fichier doit attendre. */
export const PROFILE = "urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:basic";

/** Le nom que la spécification impose à la pièce jointe, tous profils confondus. */
export const ATTACHMENT_NAME = "factur-x.xml";

export const CONFORMANCE_LEVEL = "BASIC";

/** Facture (380) ou avoir (381) — seuls types que le produit émet. */
const INVOICE_TYPE = "380";

/**
 * Le motif d'absence de TVA, selon où les prestations sont exécutées.
 *
 * Un forfait entièrement hors Union est exonéré au titre de l'article 309 ;
 * dès qu'une prestation est exécutée dans l'Union, c'est le régime de la marge
 * de l'article 306 qui s'applique au document.
 */
export function exemptionCodeFor(zones: Record<VatZone, number>): string {
  const inEu = zones.eu ?? 0;
  return inEu > 0 ? "VATEX-EU-306" : "VATEX-EU-309";
}

/* ------------------------------------------------------------- écriture */

/** Le texte d'un nœud XML, échappé. Aucune valeur métier n'y échappe. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Les centimes en décimales, comme la norme les attend : `1194.00`. */
export function amount(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** `2026-05-20` → `20260520`, le format 102 de la norme. */
export function dateCode(iso: string | null): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return match ? `${match[1]}${match[2]}${match[3]}` : null;
}

function tag(name: string, value: string | null, attributes = ""): string {
  if (value === null || value === "") return "";
  return `<${name}${attributes}>${escapeXml(value)}</${name}>`;
}

export interface FacturXInput {
  invoice: Invoice;
  trip: Trip;
  agency: Agency;
  /** À qui la facture est adressée. */
  buyer: { name: string; email: string } | null;
  /** Les coûts par zone d'exécution, qui décident du motif d'exonération. */
  zones: Record<VatZone, number>;
}

/**
 * Le XML de la facture.
 *
 * L'ordre des éléments n'est pas décoratif : le schéma CII impose une
 * séquence, et un lecteur strict rejette un fichier dont les nœuds sont
 * permutés. Il est donc écrit dans l'ordre de la norme, pas dans celui qui
 * serait le plus lisible.
 */
export function facturXml(input: FacturXInput): string {
  const { invoice, trip, agency, buyer } = input;
  const currency = trip.currency;
  const total = amount(invoice.total_cents);
  const issued = dateCode(invoice.issued_at) ?? dateCode(invoice.created_at)!;
  const due = dateCode(invoice.due_date);
  const label = invoice.label || trip.title;
  const exemptionCode = exemptionCodeFor(input.zones);

  const seller = [
    tag("ram:ID", agency.siret || null),
    tag("ram:Name", agency.legal_name || agency.name),
    `<ram:PostalTradeAddress>${tag("ram:CountryID", "FR")}</ram:PostalTradeAddress>`,
    tag("ram:URIUniversalCommunicationID", null),
    agency.vat_number
      ? `<ram:SpecifiedTaxRegistration>${tag("ram:ID", agency.vat_number, ' schemeID="VA"')}</ram:SpecifiedTaxRegistration>`
      : "",
  ].join("");

  const buyerParty = [
    tag("ram:Name", buyer?.name ?? "Client"),
    `<ram:PostalTradeAddress>${tag("ram:CountryID", "FR")}</ram:PostalTradeAddress>`,
  ].join("");

  /*
   * La ventilation de taxe, au niveau du document.
   *
   * `CalculatedAmount` à zéro et `BasisAmount` au prix total : c'est ce que le
   * régime impose de déclarer au client. La marge, elle, n'apparaît ni ici ni
   * ailleurs dans ce fichier.
   */
  const tradeTax =
    `<ram:ApplicableTradeTax>` +
    tag("ram:CalculatedAmount", "0.00") +
    tag("ram:TypeCode", "VAT") +
    tag("ram:ExemptionReason", MARGIN_SCHEME_MENTION) +
    tag("ram:BasisAmount", total) +
    tag("ram:CategoryCode", "E") +
    tag("ram:ExemptionReasonCode", exemptionCode) +
    tag("ram:RateApplicablePercent", "0.00") +
    `</ram:ApplicableTradeTax>`;

  const paymentTerms = due
    ? `<ram:SpecifiedTradePaymentTerms><ram:DueDateDateTime>` +
      `<udt:DateTimeString format="102">${due}</udt:DateTimeString>` +
      `</ram:DueDateDateTime></ram:SpecifiedTradePaymentTerms>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>${tag("ram:ID", PROFILE)}</ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    ${tag("ram:ID", invoice.reference)}
    ${tag("ram:TypeCode", INVOICE_TYPE)}
    <ram:IssueDateTime><udt:DateTimeString format="102">${issued}</udt:DateTimeString></ram:IssueDateTime>
    <ram:IncludedNote><ram:Content>${escapeXml(MARGIN_SCHEME_MENTION)}</ram:Content></ram:IncludedNote>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument>${tag("ram:LineID", "1")}</ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct>${tag("ram:Name", label)}</ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement>
        <ram:NetPriceProductTradePrice>${tag("ram:ChargeAmount", total)}</ram:NetPriceProductTradePrice>
      </ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="C62">1.00</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax>${tag("ram:TypeCode", "VAT")}${tag("ram:CategoryCode", "E")}${tag("ram:RateApplicablePercent", "0.00")}</ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation>${tag("ram:LineTotalAmount", total)}</ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty>${seller}</ram:SellerTradeParty>
      <ram:BuyerTradeParty>${buyerParty}</ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery/>
    <ram:ApplicableHeaderTradeSettlement>
      ${tag("ram:InvoiceCurrencyCode", currency)}
      ${tradeTax}
      ${paymentTerms}
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        ${tag("ram:LineTotalAmount", total)}
        ${tag("ram:TaxBasisTotalAmount", total)}
        ${tag("ram:TaxTotalAmount", "0.00", ` currencyID="${currency}"`)}
        ${tag("ram:GrandTotalAmount", total)}
        ${tag("ram:DuePayableAmount", total)}
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>
`;
}

/**
 * Ce qui manque à l'agence pour qu'une facture soit émettable au format
 * structuré. On ne bloque pas — une agence sait ce qu'elle fait — mais on
 * refuse de faire semblant, comme pour les mentions du devis.
 */
export function missingForFacturX(agency: Agency | null): string[] {
  const missing: string[] = [];
  if (!agency) return ["Aucune agence n'est rattachée à ce compte."];
  if (!agency.siret.trim()) missing.push("le SIRET de l'établissement");
  if (agency.vat_on_margin === 1 && !agency.vat_number.trim()) {
    missing.push("le numéro de TVA intracommunautaire");
  }
  if (!(agency.legal_name.trim() || agency.name.trim())) missing.push("la raison sociale");
  return missing;
}
