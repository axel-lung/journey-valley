import type { Agency } from "./types";

/**
 * Ce qu'un devis de forfait touristique doit porter en France.
 *
 * Vendre un forfait, c'est vendre un contrat encadré : information
 * précontractuelle (art. R211-4 du code du tourisme), remise du **formulaire
 * d'information standardisé** avant la conclusion (arrêté du 1er mars 2018,
 * pris pour la transposition de la directive (UE) 2015/2302), contrat écrit
 * (R211-6), immatriculation Atout France, garantie financière et RCP.
 *
 * Les outils étrangers ignorent tout cela et les outils de devis français s'en
 * tiennent souvent à la mise en page. C'est pourtant ce qui distingue un devis
 * opposable d'un joli PDF.
 *
 * ⚠️ Le texte des droits essentiels ci-dessous reprend la substance de l'annexe
 * de la directive, que l'arrêté transpose. Il n'a pas pu être recopié depuis
 * Légifrance (accès réseau bloqué depuis la machine de développement) : avant
 * une mise en production, il faut le confronter mot à mot au modèle officiel,
 * dont le lien accompagne chaque devis.
 */

export const STANDARD_FORM_SOURCE =
  "https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000036677144";

export const MEDIATOR = {
  name: "Médiation Tourisme et Voyage (MTV)",
  url: "https://www.mtv.travel",
};

/**
 * Les droits essentiels du voyageur, tels que le formulaire standardisé doit
 * les rappeler pour un forfait (partie A du modèle).
 */
export const TRAVELLER_RIGHTS: readonly string[] = [
  "Les voyageurs recevront toutes les informations essentielles sur le forfait avant de conclure le contrat.",
  "L'organisateur ainsi que le détaillant sont responsables de la bonne exécution de tous les services de voyage compris dans le contrat.",
  "Les voyageurs reçoivent un numéro de téléphone d'urgence ou les coordonnées d'un point de contact leur permettant de joindre l'organisateur ou le détaillant.",
  "Les voyageurs peuvent céder leur forfait à une autre personne, moyennant un préavis raisonnable et éventuellement sous réserve de payer des frais supplémentaires.",
  "Le prix du forfait ne peut être augmenté que si des coûts spécifiques augmentent, si cette possibilité est explicitement prévue au contrat, et en aucun cas moins de vingt jours avant le début du forfait. Si la majoration dépasse 8 % du prix, le voyageur peut résoudre le contrat. Lorsque l'organisateur se réserve le droit d'augmenter le prix, le voyageur a droit à une réduction en cas de baisse des coûts correspondants.",
  "Les voyageurs peuvent résoudre le contrat sans frais et être intégralement remboursés si l'un des éléments essentiels du forfait, autre que le prix, est modifié de manière importante.",
  "Les voyageurs peuvent résoudre le contrat sans frais avant le début du forfait en cas de circonstances exceptionnelles et inévitables, par exemple s'il existe des problèmes graves pour la sécurité au lieu de destination.",
  "Les voyageurs peuvent en outre résoudre le contrat à tout moment avant le début du forfait, moyennant des frais de résolution appropriés et justifiables.",
  "Si, après le début du forfait, des éléments importants ne peuvent pas être fournis comme prévu, d'autres prestations doivent être proposées sans supplément de prix. Les voyageurs peuvent résoudre le contrat sans frais lorsque les services ne sont pas exécutés conformément au contrat et que cela perturbe considérablement l'exécution du forfait.",
  "Les voyageurs ont droit à une réduction de prix et/ou à un dédommagement en cas d'inexécution ou de mauvaise exécution des services de voyage.",
  "L'organisateur doit apporter une aide si le voyageur est en difficulté.",
  "Si l'organisateur ou le détaillant devient insolvable, les montants versés sont remboursés et, si le transport est compris dans le forfait, le rapatriement des voyageurs est assuré par la garantie financière mentionnée ci-dessus.",
];

/** Ce que le droit impose de rappeler sur le document lui-même. */
export interface LegalMention {
  label: string;
  value: string;
  /** Vrai quand l'agence ne l'a pas renseigné : le devis n'est pas conforme. */
  missing: boolean;
  /** Pourquoi c'est exigé, pour que le conseiller comprenne au lieu de subir. */
  why: string;
}

export function legalMentions(agency: Agency | null): LegalMention[] {
  const value = (input: string | undefined | null) => (input ?? "").trim();

  return [
    {
      label: "Raison sociale",
      value: value(agency?.legal_name) || value(agency?.name),
      missing: !value(agency?.legal_name) && !value(agency?.name),
      why: "Le voyageur doit savoir avec qui il contracte.",
    },
    {
      label: "Immatriculation Atout France",
      value: value(agency?.registration),
      missing: !value(agency?.registration),
      why: "Obligatoire pour vendre des voyages (art. L211-18 du code du tourisme) ; le numéro IM doit figurer sur les documents commerciaux.",
    },
    {
      label: "Garantie financière",
      value: value(agency?.financial_guarantee),
      missing: !value(agency?.financial_guarantee),
      why: "Elle rembourse les fonds versés en cas d'insolvabilité ; le formulaire standardisé doit nommer son garant.",
    },
    {
      label: "Responsabilité civile professionnelle",
      value: value(agency?.liability_insurance),
      missing: !value(agency?.liability_insurance),
      why: "Exigée à l'immatriculation ; l'assureur et le contrat se mentionnent au devis.",
    },
    {
      label: "Médiateur de la consommation",
      value: value(agency?.mediator) || `${MEDIATOR.name} — ${MEDIATOR.url}`,
      missing: false,
      why: "Tout professionnel doit indiquer au consommateur le médiateur dont il relève.",
    },
  ];
}

export interface ComplianceCheck {
  ready: boolean;
  /** Ce qui manque, en clair, pour que ce soit corrigeable en une minute. */
  missing: LegalMention[];
}

/**
 * Le devis est-il présentable ?
 *
 * On ne bloque pas l'envoi — une agence sait ce qu'elle fait, et un brouillon
 * se relit — mais on refuse de faire semblant : ce qui manque est nommé, à
 * l'écran et sur le document.
 */
export function checkCompliance(agency: Agency | null): ComplianceCheck {
  const missing = legalMentions(agency).filter((mention) => mention.missing);
  return { ready: missing.length === 0, missing };
}

/**
 * Les conditions par défaut d'un devis, quand l'agence n'a pas écrit les
 * siennes. Volontairement prudentes et courtes : un texte qu'on lit vaut mieux
 * qu'un texte qu'on saute.
 */
export function defaultTerms(depositPercent: number): string {
  return [
    `Acompte de ${depositPercent} % à la confirmation, solde à 30 jours du départ.`,
    "Prix ferme sous réserve de disponibilité au moment de la réservation ; les prestations non encore réservées peuvent varier.",
    "Conditions d'annulation communiquées avec le contrat, avant tout versement.",
    "Assurance annulation et assistance proposées en option, non incluses sauf mention contraire.",
    "Formalités (passeport, visa, santé) à la charge du voyageur, rappelées dans la fiche destination.",
  ].join("\n");
}
