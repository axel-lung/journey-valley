# Ce dont les agences ont besoin, et comment entrer chez celles qui sont déjà équipées

Suite de `analyse-produit.md`. Celui-ci ne parle pas de fonctionnalités mais de
la seule question qui décide du reste : **pourquoi une agence déjà outillée
signerait chez nous.**

## 1. Le marché n'est pas homogène — et ça change tout

| Segment | Ce qu'ils ont déjà | Peut-on remplacer ? |
| --- | --- | --- |
| Point de vente en réseau (Selectour, Havas, Tourcom…) | back-office imposé par le réseau | **Jamais.** Complément uniquement. |
| Agence sur-mesure / DMC / réceptif | Ezus, Toogo, Caladeo (600–1 800 €/mois) | Très difficile. Complément d'abord. |
| Agence événementielle / MICE | Ezus + un tableur + un outil de compta | Complément, puis socle. |
| Indépendante 1–3 personnes, immatriculée | Excel + Word + un compte Gmail + l'expert-comptable | **Remplacement direct.** |
| Tour-opérateur | Atis, Cintoo, développements maison | Non. |

La cible du remplacement direct, c'est le dernier segment : les agences
immatriculées qui n'ont **pas** de back-office parce que 600 €/mois est hors de
proportion avec leur volume. C'est là qu'on vend un produit entier.

Partout ailleurs, la vente est un **complément**. Et un complément ne se vend
pas sur une liste de fonctionnalités — il se vend sur **un risque qu'on
supprime**.

## 2. Leurs vrais besoins, dans l'ordre où ils les vivent

Ce qui remonte réellement du métier, pas ce que les éditeurs mettent en avant :

**a. Ne pas se faire redresser sur la TVA sur marge.**
Le régime impose un suivi dossier par dossier, une ventilation géographique des
prestations et la tenue d'un **registre des marges** — pièce justificative n°1
en contrôle fiscal. Son absence ou son incomplétude entraîne le rejet du
régime : la TVA est alors recalculée **sur le prix de vente total**, pas sur la
marge. Un cas documenté : une agence appliquant une marge forfaitaire de 10 %
pour simplifier sa compta s'est vu réclamer 450 000 €. La mention « Régime
particulier – agences de voyages » manquante sur une facture est en outre
sanctionnée par une amende.

C'est le besoin le plus aigu, le moins bien servi, et celui sur lequel nous
sommes déjà les meilleurs.

**b. Savoir dossier par dossier si on a gagné de l'argent.**
Pas la marge théorique du devis : la marge réelle après les frais oubliés, le
surclassement offert, le taux de change qui a bougé. Beaucoup d'agences ne le
savent qu'au bilan.

**c. Tenir la trésorerie.**
Le CA ne se reconnaît qu'à la date du départ ; les acomptes encaissés avant
sont des produits constatés d'avance (compte 487). Entre les acomptes clients
encaissés et les acomptes fournisseurs à verser, une agence peut être riche en
banque et en perte. Aucun outil ne le leur dit clairement.

**d. Être prêt pour la facturation électronique.**
Réception obligatoire via PDP au **1er septembre 2026** pour toutes les
entreprises assujetties, émission au format structuré pour les PME au
**1er septembre 2027**. Avec une difficulté propre au métier : sous le régime
de la marge, le XML ne doit pas porter de TVA déductible pour le client. Les
éditeurs généralistes vont se tromper là-dessus.

**e. Passer moins d'heures à produire un devis.**
Le sur-mesure se vend à la marge ; chaque heure de ressaisie la mange.

**f. Ne pas perdre le client entre le devis et le départ.**
Savoir si le devis a été ouvert, relancer au bon moment, et donner au voyageur
quelque chose que l'OTA ne donne pas — c'est là que l'app voyageur devient un
argument commercial, pas un gadget.

**g. Arrêter la double saisie.**
L'opérateur moyen fait tourner son activité sur **cinq systèmes** (moteur de
réservation, e-mail, tableur, messagerie, compta). La douleur n'est pas
l'absence d'outil, c'est le recopiage entre outils.

Nos forces actuelles couvrent **a**, **b** et **d**. C'est là qu'est la porte
d'entrée.

## 3. Pourquoi ils ne changeront pas (et pourquoi c'est une bonne nouvelle)

Les coûts de bascule sont connus et dissuasifs : une migration de back-office
prend **4 à 12 semaines** (reprise de données, réintégration des fournisseurs,
formation), le vrai risque porte sur l'**historique** — dossiers passés,
contrats fournisseurs, historique de commissions — que l'équipe continue de
consulter après la bascule, et les contrats en cours comportent des périodes
d'engagement.

Conclusion : **toute stratégie qui commence par « remplacez Ezus » est morte.**
La bonne nouvelle, c'est que la même friction nous protégera une fois installés.

Donc : entrer par un **coin** — un périmètre étroit, sans migration, à un prix
qui ne demande pas d'arbitrage — puis élargir.

## 4. Le coin : le registre des marges

Le produit d'appel n'est pas « un logiciel d'agence ». C'est :

> **Le registre des marges conforme, tenu tout seul, et la facture qui passera
> 2026-2027.**

Pourquoi celui-là et pas un autre :

- **C'est un risque chiffrable, pas un confort.** On ne vend pas du temps gagné
  (invérifiable), on vend l'évitement d'un redressement (un chiffre que le
  dirigeant a en tête).
- **Personne ne l'occupe.** Les back-offices calculent des marges ; ils ne
  produisent pas la pièce opposable. Les outils de compta ne connaissent pas le
  régime de la marge. Les suites étrangères l'ignorent totalement.
- **Ça ne remplace rien.** Aucun conflit avec l'outil en place, donc aucune
  décision politique à prendre, donc un cycle de vente court.
- **L'expert-comptable devient prescripteur.** C'est lui qui souffre
  aujourd'hui, et les cabinets spécialisés tourisme sont peu nombreux et
  identifiables : un canal de distribution à faible coût.
- **Nous en sommes à quelques semaines.** `vat.ts` et `vat-return.ts` font déjà
  le calcul, la ventilation par zone et le rattachement aux encaissements. Il
  manque la forme opposable : figé, horodaté, dossier par dossier, exportable,
  avec les hypothèses écrites.

### Ce que le coin impose au produit

Un complément se juge sur l'entrée des données, pas sur les écrans. Priorités,
dans cet ordre :

1. **Import sans migration** — CSV, Excel, et un import des factures et achats
   depuis l'outil en place. Objectif affiché : **utilisable en une demi-journée,
   sans reprise d'historique.** Reprendre l'historique doit rester optionnel.
2. **Registre des marges figé** — une écriture par dossier, horodatée, non
   recalculée, avec la ventilation UE / hors UE et la mention réglementaire.
   Export PDF + CSV + FEC.
3. **Rapprochement de la TVA déductible** — non déductible sur les achats du
   forfait, déductible sur les frais généraux : le distinguer évite l'erreur la
   plus fréquente.
4. **Produits constatés d'avance** — rattacher le CA à la date de départ et
   sortir l'état des acomptes encaissés non encore acquis.
5. **Factur-X + PDP**, en traitant correctement le régime de la marge.
6. **Connecteur Pennylane / export FEC**, pour que le comptable reçoive et non
   ressaisisse.

Note : tout cela réutilise le domaine déjà écrit. C'est le chemin le moins cher
vers un produit vendable.

### Le prix du coin

Il doit tenir **sous la barre de l'arbitrage** — l'ordre de grandeur d'une
ligne de frais généraux, pas d'un choix budgétaire. Face à un back-office à
600–1 800 €/mois, un complément à quelques dizaines d'euros par mois et par
agence se signe sans comité. L'offre agence reste à écrire : `plans.ts` décrit
encore le tarif grand public d'avant le pivot.

## 5. Le discours

Trois phrases, dans cet ordre, pour ouvrir une porte chez une agence équipée :

1. « Votre registre des marges, aujourd'hui, il est où ? »
2. « En septembre 2027 vos factures devront être structurées — et sous le régime
   de la marge, la TVA ne doit pas y apparaître côté client. Votre éditeur vous
   a dit comment il gère ça ? »
3. « On ne remplace rien. On se branche à côté, et en une demi-journée vous avez
   la pièce que vous sortirez en contrôle. »

Ce qu'il ne faut **pas** dire : « logiciel tout-en-un », « remplacez votre
outil », « gagnez du temps ». Les trois font perdre la vente : le premier crée
un concurrent frontal, le deuxième déclenche le calcul du coût de bascule, le
troisième n'est pas mesurable.

## 6. Du complément au socle

Une fois le registre installé, l'élargissement se fait sans nouvelle décision
d'achat, parce que les données sont déjà là :

1. **Registre + TVA + facture conforme** → le coin. L'agence nous confie ses
   chiffres.
2. **Facturation complète et encaissement** → on tient déjà les montants ;
   émettre et encaisser est l'extension naturelle. On devient l'outil
   financier.
3. **Devis conforme et signature** → l'agence découvre qu'il est plus simple de
   produire le devis chez nous que de le recopier. Le back-office historique
   recule.
4. **App voyageur à la marque** → vendue en supplément, elle justifie une
   montée de prix sans toucher au back-office concurrent.
5. **Production complète** → seulement à ce stade, et pour les agences qui le
   demandent.

Le pari : on ne gagne pas en étant meilleur qu'Ezus sur la production de
voyage. On gagne en étant **le seul endroit où les chiffres de l'agence sont
justes et opposables** — puis en remontant le dossier depuis l'aval.

## Sources

- [BOFiP — TVA, régime des agences de voyages](https://bofip.impots.gouv.fr/bofip/1277-PGP.html/identifiant=BOI-TVA-SECT-60-20220511)
- [KPMG Academy — le régime de la TVA sur marge des agences](https://formation.kpmg.fr/pages/agences-de-voyages-comprendre-le-regime-de-la-tva-sur-marge)
- [Calculer-TVA — TVA agences de voyage 2026, régime de la marge](https://www.calculer-tva.com/guides/tva-agences-voyage/)
- [Compta-Online — comptabiliser les opérations d'une agence de voyage](https://www.compta-online.com/la-comptabilite-une-agence-de-voyages-ao2840)
- [economie.gouv.fr — facturation électronique](https://www.economie.gouv.fr/tout-savoir-sur-la-facturation-electronique-pour-les-entreprises)
- [Cegid — calendrier facture électronique 2026-2027](https://www.cegid.com/fr/facture-electronique-obligatoire/calendrier-facture-electronique/)
- [Travicy — comparatif logiciel agence de voyage 2026](https://travicy.com/comparatif-logiciel-agence-voyage)
- [Ezus — meilleurs back-offices agences de voyages 2026](https://ezus.io/fr/article/meilleurs-logiciels-back-office-agence-voyages-2026)
- [Sriggle — cloud-based travel agency software, buyer's guide 2026](https://www.sriggle.com/blogs/cloud-based-travel-agency-software/)
