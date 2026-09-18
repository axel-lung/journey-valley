# Ce dont les agences ont besoin, et à qui on vend

Suite de `analyse-produit.md`. Celui-ci ne parle pas de fonctionnalités mais de
la seule question qui décide du reste : **à qui on vend, et sur quel
argument.**

> Correction par rapport à une première version de ce document : il proposait
> d'entrer chez les agences déjà équipées en vendant le registre des marges
> comme produit d'appel autonome. Cette piste est abandonnée, et la section 4
> explique pourquoi.

## 1. Le marché n'est pas homogène — et ça change tout

| Segment | Ce qu'ils ont déjà | Pour nous |
| --- | --- | --- |
| Point de vente en réseau (Selectour, Havas, Tourcom…) | back-office imposé par le réseau | hors cible |
| Agence sur-mesure / DMC / réceptif | Ezus, Toogo, Caladeo (600–1 800 €/mois) | plus tard, au renouvellement |
| Agence événementielle / MICE | Ezus + un tableur + un outil de compta | plus tard |
| **Indépendante 1–3 personnes, immatriculée** | **Excel + Word + Gmail + l'expert-comptable** | **la cible** |
| Tour-opérateur | Atis, Cintoo, développements maison | hors cible |

**La cible, c'est l'agence immatriculée de 1 à 3 personnes qui n'a pas de
back-office** parce que 600 €/mois est hors de proportion avec son volume. Elle
monte ses voyages dans un tableur, écrit ses devis dans Word, et découvre sa
marge au bilan. Là, on est l'outil entier, et il n'y a personne en face.

Les autres segments ne sont pas perdus — ils sont *plus tard*. Voir la
section 5.

## 2. Leurs vrais besoins, dans l'ordre où ils les vivent

Ce qui remonte réellement du métier, pas ce que les éditeurs mettent en avant :

**a. Monter un voyage sans tout retaper.**
Le sur-mesure se vend à la marge ; chaque heure de ressaisie la mange. Entre le
tableur de coûts, le Word du devis, le mail au client et le carnet de voyage,
la même information est écrite quatre fois.

**b. Savoir dossier par dossier si on a gagné de l'argent.**
Pas la marge théorique du devis : la marge réelle après les frais oubliés, le
surclassement offert, le taux de change qui a bougé. Beaucoup d'agences ne le
savent qu'au bilan.

**c. Ne pas se faire redresser sur la TVA sur marge.**
Le régime impose un suivi dossier par dossier, une ventilation géographique des
prestations et la tenue d'un **registre des marges** — pièce justificative n°1
en contrôle fiscal. Son absence ou son incomplétude entraîne le rejet du
régime : la TVA est alors recalculée **sur le prix de vente total**, pas sur la
marge. Un cas documenté : une agence appliquant une marge forfaitaire de 10 %
pour simplifier sa compta s'est vu réclamer 450 000 €. La mention « Régime
particulier – agences de voyages » manquante sur une facture est en outre
sanctionnée par une amende.

**d. Sortir un devis opposable.**
Information précontractuelle, formulaire standardisé, immatriculation, garantie
financière, RCP, médiateur. Un devis Word n'a rien de tout ça.

**e. Tenir la trésorerie.**
Le CA ne se reconnaît qu'à la date du départ ; les acomptes encaissés avant
sont des produits constatés d'avance (compte 487). Entre les acomptes clients
encaissés et les acomptes fournisseurs à verser, une agence peut être riche en
banque et en perte.

**f. Être prêt pour la facturation électronique.**
Réception obligatoire via PDP au **1er septembre 2026** pour toutes les
entreprises assujetties, émission au format structuré pour les PME au
**1er septembre 2027**. Avec une difficulté propre au métier : sous le régime
de la marge, le XML ne doit pas porter de TVA déductible pour le client. Les
éditeurs généralistes vont se tromper là-dessus.

**g. Ne pas perdre le client entre le devis et le départ.**
Savoir si le devis a été ouvert, relancer au bon moment, et donner au voyageur
quelque chose que l'OTA ne donne pas — c'est là que l'app voyageur devient un
argument commercial, pas un gadget.

## 3. Pourquoi on ne va pas chercher les agences déjà équipées

Les coûts de bascule sont connus et dissuasifs : une migration de back-office
prend **4 à 12 semaines** (reprise de données, réintégration des fournisseurs,
formation), le vrai risque porte sur l'**historique** — dossiers passés,
contrats fournisseurs, historique de commissions — que l'équipe continue de
consulter après la bascule, et les contrats en cours comportent des périodes
d'engagement.

Une agence sous Ezus ne changera pas parce qu'on est meilleur sur la TVA. Elle
changera à son renouvellement, si elle nous connaît déjà. La bonne nouvelle,
c'est que la même friction nous protégera une fois installés chez nos propres
clients.

## 4. Pourquoi on ne peut pas non plus s'y glisser en complément

La tentation est évidente : puisqu'on ne remplace pas, vendons un module étroit
à côté — le registre des marges, par exemple, qui est un risque chiffrable et
que personne n'occupe. C'est séduisant et c'est faux, pour une raison
structurelle.

**Nos chiffres tombent du dossier.** `dossierMargin(trip, bookings)` calcule la
marge à partir des lignes saisies en montant le voyage ; la ventilation UE /
hors UE vient de `bookings.zone` ; le caractère non ferme d'un chiffre vient
des lignes sans prix de vente. Il n'existe pas de registre des marges sans le
dossier qui le produit.

Donc un « complément » ne peut prendre que deux formes, mauvaises toutes les
deux :

- **L'agence ressaisit ses coûts chez nous** en plus de son outil actuel —
  c'est-à-dire précisément la double saisie qui est sa douleur n°1. Personne ne
  signe pour ça.
- **On importe tout depuis son outil** — et on devient un add-on fiscal. La
  moitié du produit (itinéraire, devis, carnet, app mobile, fiche destination,
  recherche) ne sert plus à rien, notre avantage tient à un connecteur que
  n'importe qui peut copier, et c'est une autre entreprise.

**Conclusion : notre valeur exige de tenir le dossier. On ne peut pas être un
second outil.** D'où la cible de la section 1.

### Ce que la recherche a quand même donné : l'angle

La conformité fiscale et juridique n'est pas un produit à part. C'est la
**preuve** de ce qu'on vend :

> L'outil pour monter tes voyages — le seul où l'argent est juste et le devis
> opposable.

Le registre des marges, la TVA sur marge, la facture conforme 2026-2027 sont
les démonstrations de cette promesse. C'est ce qui nous sépare à la fois des
suites étrangères (Travefy, Axus, Vamoos, mTrip ignorent le régime de la marge)
et des back-offices français (qui calculent des marges sans produire la pièce
opposable). Une page de site et trois arguments de vente — pas une ligne de
feuille de route séparée.

### Le discours

1. « Vos devis, aujourd'hui, c'est Word ? Et votre marge, vous la connaissez
   quand ? »
2. « Chez nous, le devis part conforme — immatriculation, garantie financière,
   formulaire standardisé — et la marge s'affiche pendant que vous le montez. »
3. « Et en fin de trimestre, le registre des marges et la TVA sortent tout
   seuls, parce que vous avez saisi le dossier une fois. »

Ce qu'il ne faut **pas** dire : « logiciel de comptabilité », « tout-en-un »,
« gagnez du temps ». Le premier nous met dans une catégorie où on est mauvais,
le deuxième nous compare à Ezus, le troisième n'est pas mesurable.

### Le prix

L'agence cible n'a aujourd'hui aucune ligne de budget logiciel : elle paie
Office et son expert-comptable. Le prix doit être l'ordre de grandeur d'une
ligne de frais généraux, pas d'un investissement. À écrire : `plans.ts` décrit
encore le tarif grand public d'avant le pivot (« Découverte » / « Plus » à 5 €
pour un voyageur).

## 5. L'ordre dans lequel on élargit

1. **Être un outil entier pour l'agence non équipée.** PDF, e-mail,
   réinitialisation de mot de passe, invitation client, téléversement de
   documents. Tant que le devis ne part pas tout seul, rien d'autre ne compte.
   C'est la vague 1 de `analyse-produit.md`.
2. **Tenir la promesse de l'angle.** Registre des marges figé et exportable,
   Factur-X et raccordement PDP, export FEC, produits constatés d'avance. C'est
   ce qui rend le discours démontrable, et ça réutilise le domaine déjà écrit.
3. **Combler ce qui bloque la croissance du dossier.** Multi-devise sur les
   achats, prix par personne, catalogue fournisseurs, duplication de dossier —
   sans quoi l'agence qui grandit nous quitte.
4. **Multi-utilisateurs.** Le moment où on cesse d'être un outil de solo, et où
   les agences de 5–15 conseillers deviennent adressables.
5. **App voyageur en écriture, notifications, marque blanche.** Le supplément
   qui monte le prix moyen et qui se montre en rendez-vous.
6. **Alors seulement, les agences déjà équipées** — au renouvellement de leur
   contrat, avec un produit complet et des références. Pas avant.

Le pari : on ne gagne pas en étant meilleur qu'Ezus sur la production de
voyage, ni en devenant un outil de compta. On gagne en étant **l'outil de
production de voyage des agences que personne ne sert** — et le seul dont les
chiffres sont opposables.

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
