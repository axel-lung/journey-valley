import { describe, expect, it } from "vitest";
import {
  classify,
  coverage,
  destinationIn,
  nightsIn,
  parseFrenchDate,
  parseProgramme,
  priceIn,
  referenceIn,
  travellersIn,
} from "./parse";

/**
 * Un programme d'agence, écrit comme les agences les écrivent : des marqueurs
 * de journée, des puces, une date par jour, et un pied de page qui n'appartient
 * à aucune journée.
 */
const PROGRAMME = `Marrakech et le désert d'Agafay — 6 jours
Base 2 participants

Jour 1 – 12 octobre 2026 : Paris → Marrakech
• Vol AF 1796 Paris CDG → Marrakech RAK, départ 10h25
• Transfert privé de l'aéroport au riad
• Nuit au Riad Kniza, chambre deluxe

Jour 2 – 13 octobre 2026 : Médina
• Petit-déjeuner sur la terrasse
• Visite guidée de la médina et des souks avec Youssef
• Déjeuner au Nomad
• 1 nuit au Riad Kniza

Jour 3 – 14 octobre 2026 : Agafay
• Transfert en 4x4 vers le désert d'Agafay
• Dîner sous tente et nuit au campement Scarabeo
• Référence : SCB2026

Jour 4 – 15 octobre 2026 : Retour
• Vol AF 1797 Marrakech RAK → Paris CDG

Prix par personne : 1 890 €
Supplément chambre individuelle : 240 €
Ce prix ne comprend pas les boissons ni les pourboires.`;

describe("parseFrenchDate", () => {
  it("lit une date écrite en toutes lettres", () => {
    expect(parseFrenchDate("12 octobre 2026", 2026)).toBe("2026-10-12");
    expect(parseFrenchDate("1er août 2026", 2026)).toBe("2026-08-01");
    expect(parseFrenchDate("3 fév. 2027", 2026)).toBe("2027-02-03");
  });

  it("lit une date en chiffres", () => {
    expect(parseFrenchDate("12/10/2026", 2026)).toBe("2026-10-12");
    expect(parseFrenchDate("12-10-26", 2026)).toBe("2026-10-12");
  });

  it("retombe sur l'année du dossier quand elle n'est pas écrite", () => {
    expect(parseFrenchDate("lundi 12 octobre", 2027)).toBe("2027-10-12");
  });

  it("refuse une date qui n'existe pas plutôt que de la corriger", () => {
    // Le 31 février n'est pas le 2 mars : mieux vaut ne rien rendre.
    expect(parseFrenchDate("31 février 2026", 2026)).toBeNull();
    expect(parseFrenchDate("aucune date ici", 2026)).toBeNull();
  });
});

describe("classify", () => {
  it("reconnaît un vol à son numéro comme à son mot", () => {
    expect(classify("Vol AF 1796 Paris CDG → Marrakech RAK")).toBe("flight");
    expect(classify("AF 1796 départ 10h25")).toBe("flight");
    expect(classify("Envol pour Marrakech")).toBe("flight");
  });

  it("distingue un transfert vers l'hôtel d'un hébergement", () => {
    // L'ordre des familles est ce qui rend ce cas juste : « transfert » gagne
    // sur « riad » parce que la ligne décrit le trajet, pas la nuit.
    expect(classify("Transfert privé de l'aéroport au riad")).toBe("transport");
    expect(classify("Nuit au Riad Kniza, chambre deluxe")).toBe("stay");
  });

  it("reconnaît une activité", () => {
    expect(classify("Visite guidée de la médina")).toBe("activity");
    expect(classify("Dégustation dans la palmeraie")).toBe("activity");
  });

  it("ne force pas une famille sur ce qu'elle ne reconnaît pas", () => {
    expect(classify("Remise des documents de voyage")).toBe("other");
  });
});

describe("referenceIn", () => {
  it("isole un numéro de vol", () => {
    expect(referenceIn("Vol AF 1796 Paris → Marrakech")).toBe("AF 1796");
    expect(referenceIn("Vol TG931 de nuit")).toBe("TG931");
  });

  it("isole une référence de réservation", () => {
    expect(referenceIn("Référence : SCB2026")).toBe("SCB2026");
    expect(referenceIn("confirmation ABC12345")).toBe("ABC12345");
  });

  it("ne rend rien plutôt qu'un fragment au hasard", () => {
    expect(referenceIn("Petit-déjeuner sur la terrasse")).toBeNull();
  });
});

describe("nightsIn / travellersIn / priceIn", () => {
  it("compte les nuits", () => {
    expect(nightsIn("3 nuits au Riad Kniza")).toBe(3);
    expect(nightsIn("1 nuit au campement")).toBe(1);
    expect(nightsIn("Visite de la médina")).toBeNull();
  });

  it("compte les voyageurs comme une agence les écrit", () => {
    expect(travellersIn("Base 2 participants")).toBe(2);
    expect(travellersIn("pour 4 voyageurs")).toBe(4);
    expect(travellersIn("un programme sur mesure")).toBeNull();
  });

  it("retient le plus grand montant, pas le premier venu", () => {
    // 1 890 € est le prix ; 240 € est un supplément. Prendre le premier
    // donnerait le prix du voyage à 240 €.
    expect(priceIn(PROGRAMME)).toBe(189_000);
  });
});

describe("parseProgramme", () => {
  const programme = parseProgramme(PROGRAMME, { fallbackYear: 2026 });

  it("découpe les journées et les date", () => {
    expect(programme.days).toHaveLength(4);
    expect(programme.days[0]).toMatchObject({ day_number: 1, date: "2026-10-12" });
    expect(programme.days[3]).toMatchObject({ day_number: 4, date: "2026-10-15" });
  });

  it("retire la date du titre de la journée", () => {
    expect(programme.days[0].title).toBe("Paris → Marrakech");
    expect(programme.days[1].title).toBe("Médina");
  });

  it("borne le voyage sur la première et la dernière date", () => {
    expect(programme.start_date).toBe("2026-10-12");
    expect(programme.end_date).toBe("2026-10-15");
  });

  it("classe les prestations de chaque journée", () => {
    const first = programme.days[0].entries;
    expect(first.map((entry) => entry.kind)).toEqual(["flight", "transport", "stay"]);
    expect(first[0].reference).toBe("AF 1796");
  });

  it("lit les voyageurs et propose un prix", () => {
    expect(programme.travellers).toBe(2);
    expect(programme.price_cents).toBe(189_000);
  });

  it("prend le titre du document", () => {
    expect(programme.title).toBe("Marrakech et le désert d'Agafay — 6 jours");
  });

  it("ne jette jamais une ligne qu'il n'a pas su rattacher", () => {
    // Le pied de page n'appartient à aucune journée : il doit rester visible,
    // parce que « ce prix ne comprend pas » est ce que le client lira.
    expect(programme.unmatched.join(" ")).toContain("ne comprend pas");
    expect(programme.unmatched.join(" ")).toContain("Base 2 participants");
  });

  it("dit ce qu'il a lu et ce qu'il a supposé", () => {
    expect(programme.confidence.start_date).toBe("sure");
    expect(programme.confidence.travellers).toBe("sure");
    // Un prix trouvé dans un document reste une supposition : rien ne le
    // distingue sûrement d'un supplément.
    expect(programme.confidence.price_cents).toBe("guess");
    expect(programme.confidence.destination_city).toBe("guess");
  });

  it("rattache l'essentiel du document", () => {
    const rate = coverage(programme);
    expect(rate.matched).toBe(11);
    expect(rate.percent).toBeGreaterThanOrEqual(70);
  });
});

describe("parseProgramme, les cas qui font mal", () => {
  it("ne rend jamais null sur un texte illisible", () => {
    const noise = parseProgramme("...\n???\n", { fallbackYear: 2026 });
    expect(noise.days).toEqual([]);
    expect(noise.start_date).toBeNull();
    expect(coverage(noise).percent).toBe(0);
  });

  it("garde tout quand aucune journée n'est marquée", () => {
    // Un programme en prose : on ne sait rien découper, donc on ne prétend
    // rien avoir découpé, et le conseiller voit son texte entier.
    const prose = parseProgramme(
      "Séjour à Lisbonne\nArrivée le matin, transfert, puis quartier libre.\nDîner au Time Out Market.",
      { fallbackYear: 2026 },
    );
    expect(prose.days).toEqual([]);
    expect(prose.unmatched).toHaveLength(2);
    expect(coverage(prose)).toMatchObject({ matched: 0, percent: 0 });
  });

  it("accepte les marqueurs abrégés et sans ponctuation", () => {
    const short = parseProgramme("J1 Arrivée\nVol AF 264\nJ2 Visite\nBalade en ville", {
      fallbackYear: 2026,
    });
    expect(short.days.map((day) => day.day_number)).toEqual([1, 2]);
    expect(short.days[0].entries[0].kind).toBe("flight");
  });

  it("n'invente pas de titre à partir d'une ligne trop longue", () => {
    const long = "x".repeat(200);
    expect(parseProgramme(`${long}\nJour 1 : Arrivée`, {}).title).toBe("");
  });

  it("supporte les journées non datées", () => {
    const undated = parseProgramme("Jour 1 : Arrivée\nVol AF 264\nJour 2 : Départ", {});
    expect(undated.days).toHaveLength(2);
    expect(undated.start_date).toBeNull();
    expect(undated.confidence.start_date).toBeUndefined();
  });
});

describe("destinationIn", () => {
  it("lit une destination annoncée", () => {
    expect(destinationIn("Destination : Marrakech, Maroc", [])).toEqual({
      city: "Marrakech",
      country: "Maroc",
    });
  });

  it("prend l'arrivée du premier jour quand elle est écrite", () => {
    expect(
      destinationIn("Un voyage", [
        { day_number: 1, date: null, title: "Paris → Marrakech", entries: [] },
      ]),
    ).toMatchObject({ city: "Marrakech" });
  });

  it("ne rend rien plutôt qu'un mot au hasard sur un titre sans lieu", () => {
    expect(destinationIn("", [])).toEqual({ city: "", country: "" });
  });
});
