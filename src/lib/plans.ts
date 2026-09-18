import type { Plan } from "./types";

/**
 * L'offre.
 *
 * Elle décrivait encore le produit grand public d'avant le pivot — « Plus » à
 * 5 € pour un voyageur qui part deux fois par an — ce qui n'avait plus rien à
 * voir avec ce qui est vendu. Elle s'adresse maintenant à l'agence.
 *
 * Deux principes de tarification, hérités de ce que le marché impose :
 *
 * 1. **Le prix reste sous la barre de l'arbitrage.** En face, les back-offices
 *    français se négocient entre 600 et 1 800 € par mois ; la cible ici est
 *    l'agence immatriculée de une à trois personnes, qui n'a aujourd'hui aucune
 *    ligne de budget logiciel. Ça se signe sans comité.
 * 2. **On essaie avant de payer, sur de vrais dossiers.** L'essai n'est pas une
 *    démonstration bridée dans le temps : deux dossiers complets, devis
 *    conforme et facture compris. Une agence qui a vendu un voyage avec l'outil
 *    sait ce qu'elle achète.
 *
 * Les identifiants `free` et `plus` sont conservés : la colonne `users.plan`
 * les contraint, et les migrations sont additives. Ce sont les libellés et les
 * limites qui portent le sens.
 */

export interface PlanDefinition {
  id: Plan;
  name: string;
  /** Prix mensuel en centimes, hors taxes ; 0 pour l'essai. */
  price_cents: number;
  tagline: string;
  /** `null` : sans limite. */
  max_active_trips: number | null;
  max_companions_per_trip: number | null;
  features: string[];
}

export const PLANS: Record<Plan, PlanDefinition> = {
  free: {
    id: "free",
    name: "Essai",
    price_cents: 0,
    tagline: "Montez deux dossiers en entier, devis conforme et facture compris.",
    max_active_trips: 2,
    max_companions_per_trip: 1,
    features: [
      "2 dossiers en cours",
      "Devis conforme au code du tourisme, en PDF",
      "Marge et TVA sur marge, dossier par dossier",
      "Facture d'acompte et de solde",
    ],
  },
  plus: {
    id: "plus",
    name: "Agence",
    price_cents: 3_900,
    tagline: "Pour une agence immatriculée qui vend toute l'année.",
    max_active_trips: null,
    max_companions_per_trip: null,
    features: [
      "Dossiers et voyageurs sans limite",
      "Tout ce que contient l'essai",
      "Registre des marges et aide à la déclaration de TVA",
      "Carnet de voyage et espace voyageur à vos couleurs",
      "Application mobile pour vous et vos clients",
    ],
  },
};

/** Les étapes qui consomment le quota : un dossier clos ne compte plus. */
export const ACTIVE_STAGES = ["idea", "planning", "booked", "travelling"] as const;

export interface LimitCheck {
  allowed: boolean;
  reason?: string;
}

export function canCreateTrip(plan: Plan, activeTrips: number): LimitCheck {
  const limit = PLANS[plan].max_active_trips;
  if (limit === null || activeTrips < limit) return { allowed: true };
  return {
    allowed: false,
    reason: `L'${PLANS[plan].name.toLowerCase()} permet ${limit} dossiers en cours à la fois. Clôturez-en un, ou passez au forfait ${PLANS.plus.name}.`,
  };
}

export function canAddCompanion(plan: Plan, currentCompanions: number): LimitCheck {
  const limit = PLANS[plan].max_companions_per_trip;
  if (limit === null || currentCompanions < limit) return { allowed: true };
  return {
    allowed: false,
    reason: `L'${PLANS[plan].name.toLowerCase()} autorise ${limit} voyageur${limit === 1 ? "" : "s"} accompagnant par dossier. Passez au forfait ${PLANS.plus.name} pour les familles et les groupes.`,
  };
}
