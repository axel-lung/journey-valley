import { describe, expect, it } from "vitest";
import {
  amount,
  ATTACHMENT_NAME,
  dateCode,
  escapeXml,
  exemptionCodeFor,
  facturXml,
  missingForFacturX,
  PROFILE,
} from "./facturx";
import { MARGIN_SCHEME_MENTION, type Invoice } from "./invoices";
import type { Agency, Trip, VatZone } from "./types";

const agency: Agency = {
  id: 1,
  name: "Escale Voyages",
  legal_name: "Escale Voyages SARL",
  registration: "IM069250014",
  vat_number: "FR69880123456",
  siret: "88012345600017",
  email: "bonjour@escale.fr",
  phone: "04 72 00 00 00",
  website: "escale.fr",
  brand_colour: "#1d4ed8",
  target_margin_percent: 15,
  vat_rate: 20,
  vat_on_margin: 1,
  financial_guarantee: "APST",
  liability_insurance: "MMA",
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
  summary: "",
  destination_city: "Kyoto",
  destination_country: "Japon",
  start_date: "2026-10-12",
  end_date: "2026-10-26",
  stage: "booked",
  currency: "EUR",
  budget_cents: 0,
  // Vendu 3 980 €, acheté 2 500 € : 1 480 € de marge, dont 246,67 € de TVA.
  // Aucun de ces trois chiffres n'a le droit d'apparaître dans le XML.
  agency_quote_cents: 398_000,
  travellers: 2,
  created_at: "2026-01-01",
};

const invoice: Invoice = {
  id: 21,
  trip_id: 7,
  agency_id: 1,
  quote_id: 11,
  reference: "FAC-2026-0001",
  token: "jeton",
  kind: "deposit",
  status: "issued",
  label: "Acompte sur Kyoto en automne",
  total_cents: 119_400,
  due_date: "2026-06-15",
  issued_at: "2026-05-20",
  opened_at: null,
  paid_at: null,
  payment_note: "",
  created_at: "2026-05-20",
};

const mixedZones: Record<VatZone, number> = { eu: 80_000, non_eu: 170_000 };
const outsideZones: Record<VatZone, number> = { eu: 0, non_eu: 250_000 };

const buyer = { name: "Sam Ortega", email: "sam@exemple.fr" };
const xml = facturXml({ invoice, trip, agency, buyer, zones: mixedZones });

describe("escapeXml", () => {
  it("neutralise ce qui casserait le document", () => {
    // Un nom de dossier finit dans le XML : « Séjour "Rois & Reines" » ne doit
    // pas fermer un nœud.
    expect(escapeXml('Rois & Reines <"test">')).toBe(
      "Rois &amp; Reines &lt;&quot;test&quot;&gt;",
    );
  });
});

describe("amount", () => {
  it("écrit les centimes comme la norme les attend", () => {
    expect(amount(119_400)).toBe("1194.00");
    expect(amount(5)).toBe("0.05");
    expect(amount(0)).toBe("0.00");
  });
});

describe("dateCode", () => {
  it("rend le format 102", () => {
    expect(dateCode("2026-05-20")).toBe("20260520");
    expect(dateCode("2026-05-20T09:00:00")).toBe("20260520");
  });

  it("rend null sur une date absente plutôt qu'une chaîne fausse", () => {
    expect(dateCode(null)).toBeNull();
    expect(dateCode("")).toBeNull();
  });
});

describe("exemptionCodeFor", () => {
  it("code le régime de la marge dès qu'une prestation est exécutée dans l'Union", () => {
    expect(exemptionCodeFor(mixedZones)).toBe("VATEX-EU-306");
    expect(exemptionCodeFor({ eu: 250_000, non_eu: 0 })).toBe("VATEX-EU-306");
  });

  it("code l'exonération quand tout est exécuté hors de l'Union", () => {
    expect(exemptionCodeFor(outsideZones)).toBe("VATEX-EU-309");
  });
});

describe("facturXml", () => {
  it("annonce le profil et le type de document", () => {
    expect(xml).toContain(PROFILE);
    expect(xml).toContain("<ram:TypeCode>380</ram:TypeCode>");
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  });

  it("porte la référence, le montant et l'échéance", () => {
    expect(xml).toContain("<ram:ID>FAC-2026-0001</ram:ID>");
    expect(xml).toContain("<ram:GrandTotalAmount>1194.00</ram:GrandTotalAmount>");
    expect(xml).toContain("<ram:DuePayableAmount>1194.00</ram:DuePayableAmount>");
    expect(xml).toContain('<udt:DateTimeString format="102">20260615</udt:DateTimeString>');
  });

  it("identifie le vendeur comme la plateforme l'exige", () => {
    expect(xml).toContain("Escale Voyages SARL");
    expect(xml).toContain("<ram:ID>88012345600017</ram:ID>");
    expect(xml).toContain('<ram:ID schemeID="VA">FR69880123456</ram:ID>');
  });

  it("déclare une taxe nulle sur la base du prix total", () => {
    // La condition d'application du régime : la taxe n'est pas chiffrée, et la
    // base déclarée au client est le prix, pas la marge.
    expect(xml).toContain("<ram:CalculatedAmount>0.00</ram:CalculatedAmount>");
    expect(xml).toContain("<ram:BasisAmount>1194.00</ram:BasisAmount>");
    expect(xml).toContain("<ram:CategoryCode>E</ram:CategoryCode>");
    expect(xml).toContain("<ram:RateApplicablePercent>0.00</ram:RateApplicablePercent>");
    expect(xml).toContain('<ram:TaxTotalAmount currencyID="EUR">0.00</ram:TaxTotalAmount>');
  });

  it("code et nomme le motif du régime de la marge", () => {
    expect(xml).toContain("<ram:ExemptionReasonCode>VATEX-EU-306</ram:ExemptionReasonCode>");
    expect(xml).toContain(`<ram:ExemptionReason>${MARGIN_SCHEME_MENTION}</ram:ExemptionReason>`);
    // La mention obligatoire figure aussi en note, là où un lecteur la cherche.
    expect(xml).toContain(`<ram:Content>${MARGIN_SCHEME_MENTION}</ram:Content>`);
  });

  it("bascule sur l'exonération quand le forfait est exécuté hors de l'Union", () => {
    const outside = facturXml({ invoice, trip, agency, buyer, zones: outsideZones });
    expect(outside).toContain("<ram:ExemptionReasonCode>VATEX-EU-309</ram:ExemptionReasonCode>");
  });

  it("ne laisse sortir ni la marge, ni son montant de taxe, ni le prix d'achat", () => {
    // 1 480,00 de marge, 246,67 de TVA, 2 500,00 d'achats : le fichier part
    // chez le client, donc la règle du PDF vaut ici mot pour mot.
    expect(xml).not.toContain("1480.00");
    expect(xml).not.toContain("246.67");
    expect(xml).not.toContain("2500.00");
    expect(xml).not.toContain("3980.00");
    expect(xml.toLowerCase()).not.toContain("margin");
  });

  it("n'écrit jamais un taux de TVA, même celui de l'agence", () => {
    // `vat_rate` vaut 20 : il sert à calculer ce que l'agence doit, jamais à
    // remplir ce document.
    expect(xml).not.toMatch(/RateApplicablePercent>20/);
  });

  it("se passe d'une échéance sans écrire un nœud vide", () => {
    const noDue = facturXml({
      invoice: { ...invoice, due_date: null },
      trip,
      agency,
      buyer,
      zones: mixedZones,
    });
    expect(noDue).not.toContain("SpecifiedTradePaymentTerms");
  });

  it("se passe d'un numéro de TVA en franchise en base", () => {
    const exempt = facturXml({
      invoice,
      trip,
      agency: { ...agency, vat_number: "", vat_on_margin: 0 },
      buyer,
      zones: mixedZones,
    });
    expect(exempt).not.toContain("SpecifiedTaxRegistration");
    expect(exempt).toContain("<ram:GrandTotalAmount>1194.00</ram:GrandTotalAmount>");
  });

  it("nomme un acheteur même quand le dossier n'a personne", () => {
    const anonymous = facturXml({ invoice, trip, agency, buyer: null, zones: mixedZones });
    expect(anonymous).toContain("<ram:Name>Client</ram:Name>");
  });

  it("équilibre ses totaux", () => {
    const read = (name: string) =>
      Number(new RegExp(`<ram:${name}[^>]*>([\\d.]+)<`).exec(xml)![1]);
    expect(read("LineTotalAmount")).toBe(read("TaxBasisTotalAmount"));
    expect(read("TaxBasisTotalAmount") + read("TaxTotalAmount")).toBe(read("GrandTotalAmount"));
    expect(read("GrandTotalAmount")).toBe(read("DuePayableAmount"));
  });

  it("referme tout ce qu'il ouvre, dans l'ordre", () => {
    // Pas de schéma sous la main : on vérifie au moins que l'arbre est clos et
    // bien imbriqué, ce qui attrape une balise oubliée dans un ajout futur.
    const stack: string[] = [];
    for (const match of xml.matchAll(/<(\/?)([a-z]+:[A-Za-z]+)([^>]*?)(\/?)>/g)) {
      const [, closing, name, , selfClosing] = match;
      if (selfClosing) continue;
      if (closing) expect(stack.pop()).toBe(name);
      else stack.push(name);
    }
    expect(stack).toEqual([]);
  });
});

describe("missingForFacturX", () => {
  it("ne réclame rien à une agence complète", () => {
    expect(missingForFacturX(agency)).toEqual([]);
  });

  it("nomme ce qui ferait rejeter le fichier", () => {
    expect(missingForFacturX({ ...agency, siret: "" })).toContain("le SIRET de l'établissement");
    expect(missingForFacturX({ ...agency, vat_number: "" })).toContain(
      "le numéro de TVA intracommunautaire",
    );
  });

  it("ne réclame pas de numéro de TVA à qui n'est pas assujetti", () => {
    expect(missingForFacturX({ ...agency, vat_number: "", vat_on_margin: 0 })).toEqual([]);
  });
});

describe("ATTACHMENT_NAME", () => {
  it("est le nom que la spécification impose", () => {
    expect(ATTACHMENT_NAME).toBe("factur-x.xml");
  });
});
