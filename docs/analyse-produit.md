# Ce qui manque pour être le meilleur

Analyse de l'existant (web, mobile, domaine) confrontée au marché francophone
des logiciels d'agence. Classée par ce que ça coûte de ne pas l'avoir.

## Ce qui est déjà un avantage

Trois choses qu'aucun concurrent ne fait aussi proprement, et sur lesquelles il
faut appuyer plutôt que de les diluer :

- **La TVA sur marge est un calcul, pas une case.** Extraction 20/120,
  exonération hors UE, ventilation au prorata des coûts, export pour le
  comptable (`vat.ts`, `vat-return.ts`). Les outils étrangers ne savent pas
  faire ; les outils français le font souvent à la main.
- **La conformité est dans le produit** : mentions obligatoires vérifiées
  avant l'envoi, formulaire d'information standardisé, absence de TVA sur la
  facture client (`legal.ts`, `invoices.ts`). C'est le différenciateur
  défendable.
- **La séparation conseiller / voyageur est structurelle**, pas cosmétique :
  routes distinctes, charge utile mobile construite par rôle, vérifiée bout en
  bout. C'est ce qui permet de livrer une app voyageur sans risque de fuite.

Tout le reste ci-dessous est du retard.

---

## Web — les manques, par impact

### 1. Rien ne sort du logiciel (bloquant commercial)

Aucun envoi d'e-mail, aucun PDF. Le devis et la facture existent en HTML, avec
un lien public ; le conseiller doit copier le lien dans son propre client mail.

- **Pas de PDF** — ni devis, ni facture, ni carnet de voyage, ni formulaire
  standardisé. Un client veut une pièce jointe, un comptable exige un
  document. Aujourd'hui : `@media print` et Ctrl+P.
- **Pas d'e-mail transactionnel** — envoi du devis, relance à J-3 de la
  validité, facture émise, rappel d'échéance de solde, lien d'accès voyageur.
  Pas de SMTP dans les dépendances.
- **Pas de journal d'envoi** — on ne sait pas si le devis a été ouvert. Le
  taux d'ouverture d'un devis est la métrique n°1 d'un conseiller.

### 2. Facturation électronique (échéance réglementaire)

Depuis le **1er septembre 2026**, toute entreprise assujettie doit pouvoir
**recevoir** ses factures via une PDP ; les PME devront **émettre** au format
structuré au **1er septembre 2027**. Nos factures sont du HTML.

- Pas de **Factur-X** (PDF/A-3 + XML EN 16931), pas de sortie UBL/CII.
- Pas de raccordement à une **PDP**, pas d'annuaire, pas de cycle de vie de
  facture (statuts normalisés), pas d'e-reporting.
- Subtilité métier à traiter explicitement : sous le régime de la marge, le
  XML ne doit pas porter de TVA déductible pour le client — la règle n°7 vaut
  aussi dans le format structuré.

C'est le seul manque avec une date légale dessus. À traiter en premier après
le PDF.

### 3. Pas d'encaissement

`invoices.ts` suit l'acompte et le solde, mais l'agence encaisse ailleurs.

- Pas de lien de paiement (CB, virement SEPA avec référence, 3-D Secure).
- Pas de rapprochement : « facture payée » est une case cochée à la main.
- Pas d'échéancier automatique (acompte → solde J-30) ni de relance.
- Conséquence directe : aucun chiffre de trésorerie, alors qu'on tient déjà
  le chiffre de marge.

### 4. Le dossier ne se réutilise pas

Chaque dossier se retape de zéro.

- Pas de **catalogue fournisseurs** : `bookings.vendor` est du texte libre.
  Donc pas d'historique par fournisseur, pas de tarif négocié rappelé, pas de
  suivi des acomptes dus *aux* fournisseurs.
- Pas de **bibliothèque de prestations** réutilisables (une nuit à l'hôtel X
  avec son descriptif, ses photos, son prix d'achat connu).
- Pas de **duplication de dossier** ni de modèle de circuit. Un conseiller qui
  vend dix fois le même Portugal le ressaisit dix fois.
- Pas de **versions de devis** (option A / option B, montée en gamme), alors
  que c'est la façon normale de vendre du sur-mesure.

### 5. Trous dans le modèle de prix

- **Pas de devise sur une ligne d'achat.** `bookings.amount_cents` est
  implicitement dans la devise du dossier. Un réceptif payé en USD ou en THB
  ne se saisit pas correctement, et `fx.ts` ne sert qu'à l'affichage. Bloquant
  pour le long-courrier sur-mesure.
- **Pas de prix par personne.** `travellers` est un compteur ; le prix est un
  forfait global. Or un devis sur-mesure s'écrit « 2 480 € par personne, base
  2 participants », avec supplément single et dégressivité.
- **Pas de distinction net / commissionnable.** Une prestation rétrocédée à la
  commission (billetterie sèche, assurance) ne se modélise pas ; elle fausse
  le taux de marque.
- **Pas de taux de TVA multiples** : `agencies.vat_rate` est unique. Pas de
  gestion des DOM, ni d'une prestation hors régime de la marge vendue en
  direct.
- **Pas de frais de dossier ni de remise** comme lignes de premier rang.

### 6. Une agence, ce n'est pas un conseiller

- **Un seul conseiller par agence** : pas de collègues, pas de rôles
  (conseiller / direction / compta), pas de partage de portefeuille, pas de
  reprise de dossier pendant les congés. Rédhibitoire au-delà de l'agence
  unipersonnelle, et ça plafonne le revenu par compte.
- **Pas d'invitation client** : le voyageur s'inscrit, puis le conseiller le
  rattache. Le parcours normal, c'est un lien envoyé par le conseiller.
- **Pas de réinitialisation de mot de passe.** Aucune trace de `reset` dans le
  code : un conseiller qui oublie son mot de passe est enfermé dehors. Le
  correctif le moins cher de toute la liste.
- **Pas de 2FA, pas de journal de connexion**, pour un outil qui détient des
  données de paiement et d'identité.

### 7. Reste à combler

- **Documents** : aucun téléversement. Pas de voucher fournisseur, pas de
  passeport, pas de contrat signé, pas de justificatif de dépense —
  `expenses.receipt_name` stocke un nom de fichier sans fichier.
- **Signature électronique** du contrat de vente : l'acceptation du devis est
  tracée (nom, IP, horodatage), ce qui est bien, mais ce n'est pas une
  signature au sens eIDAS.
- **Comptabilité** : l'export est un CSV de TVA. Les concurrents s'intègrent à
  Pennylane, Sage, Evoliz, Odoo. Un export FEC et un connecteur Pennylane
  couvriraient le marché français.
- **Pilotage** : le tableau de bord donne le portefeuille en cours. Il manque
  la marge par conseiller, par destination, par fournisseur ; le taux de
  transformation des devis ; le comparatif N-1 ; le carnet de commandes par
  mois de départ.
- **Pas de gestion des annulations** : pas de barème de frais, pas d'avoir,
  pas de reventilation de marge sur un dossier annulé.
- **RGPD** : pas d'export ni de suppression des données d'un client, pas de
  durée de conservation. Obligatoire, et demandé en appel d'offres.
- **Rien ne facture l'abonnement** : `plans.ts` décrit encore l'offre grand
  public d'avant le pivot (« Découverte » / « Plus » à 5 € pour un voyageur).
  Incohérent avec le produit actuel, et à réécrire en offre agence
  (par siège, par dossier, ou par volume vendu).
- **Pas d'accessibilité vérifiée** ni d'internationalisation : interface
  française codée en dur. La Belgique, la Suisse et le Canada francophone sont
  atteignables ; le néerlandais et l'anglais ne le sont pas.

---

## Mobile — les manques

L'app est une coque WebView (cinq classes Java) sur un bundle React, avec cache
hors-ligne, mode avion et bascule par rôle. La base est saine mais l'app **lit
seulement**.

### 1. Elle n'écrit pas

C'est la limite structurante. Aujourd'hui l'API mobile expose deux routes en
lecture (`/home`, `/file/[id]`) plus la connexion. Ce qu'un conseiller attend
dans un train :

- cocher une ligne de checklist, ajouter une note au dossier ;
- saisir une dépense ou un achat fournisseur avec la photo du reçu ;
- relancer un devis, marquer une facture payée ;
- changer l'étape d'un dossier.

Et ce qu'un voyageur attend en voyage : cocher sa checklist, envoyer une photo,
signaler un problème au conseiller.

### 2. Pas de notifications

Aucune notification push (ni FCM, ni relève périodique). Or tous les moments
qui comptent sont des notifications :

- conseiller : « devis accepté », « facture réglée », « alerte de prix
  déclenchée », « solde en retard » ;
- voyageur : « vol décalé », « départ dans 3 jours, pensez au passeport »,
  « votre carnet est prêt ».

Sans push, l'app est un site web qu'on a installé.

### 3. Le voyageur en voyage n'a presque rien

Le carnet est joli ; l'usage réel manque.

- Pas de **documents hors-ligne** : billets, vouchers, cartes d'embarquement,
  attestation d'assurance. C'est la raison n°1 d'ouvrir une app d'agence.
- Pas de **contact d'urgence** ni de bouton « joindre mon conseiller » (appel,
  WhatsApp) — les concurrents en font un argument de vente.
- Pas de **carte hors-ligne** ni de localisation des étapes.
- Pas de **fuseau horaire** ni de compte à rebours au prochain segment.
- Pas de **messagerie** conseiller ↔ voyageur. Aujourd'hui tout se passe sur
  WhatsApp, donc hors du dossier, donc hors de la traçabilité.
- Pas d'ajout au **calendrier** (ICS) ni de rappels.

### 4. Distribution et coque

- **Android seulement.** Pas d'iOS, or la clientèle d'agence sur-mesure est
  largement sur iPhone. À défaut, une **PWA installable** couvrirait iOS à
  faible coût — le bundle web existe déjà.
- **Pas de marque blanche** : une seule app, une seule icône. Les concurrents
  vendent l'app aux couleurs de l'agence, sur les stores, et c'est le haut de
  gamme de leur tarif. `brand_colour` existe déjà côté données : la moitié du
  chemin est faite.
- **Pas de liens profonds** (ouvrir un devis, une facture depuis un mail), pas
  de biométrie au déverrouillage, pas de partage de fichier — seulement du
  texte.
- Pas de build signé reproductible ni de canal de mise à jour.

---

## Face aux concurrents

Le marché francophone se segmente en trois : les outils de devis mono-produit
(Galdeo, Hera, Voyages Planner, ~49–200 €/utilisateur/mois), les suites
front-office récentes (Travicy, à partir de ~49 €/mois) et les back-offices
matures (Ezus, Toogo, Caladeo, Atis, Cintoo, ~600–1 800 €/mois). Journey Valley
est aujourd'hui entre le premier et le troisième : le domaine financier a la
profondeur d'un back-office, le reste a la surface d'un outil de devis.

**Ce qu'ils ont et que nous n'avons pas :**

| | Eux | Nous |
| --- | --- | --- |
| Catalogue fournisseurs et bibliothèque de prestations | standard | absent |
| Multi-devise sur les achats, multi-TVA | standard (Ezus) | absent |
| Documents générés (PDF, multilingue, à la marque) | standard | HTML imprimable |
| Connecteurs comptables (Pennylane, Sage, Evoliz, Odoo) | standard (Ezus) | CSV de TVA |
| Multi-utilisateurs, rôles, équipes | standard | un conseiller |
| App voyageur marque blanche, documents hors-ligne | vendue en option (Vamoos, mTrip, Travefy, Axus) | app unique, lecture seule |
| Import automatique de documents fournisseurs / GDS | mTrip, Travefy, Axus (Amadeus, Sabre, Travelport) | recherche Amadeus seule |
| Paiement en ligne, échéancier | standard | absent |

**Ce que nous avons et qu'ils n'ont pas :**

- La TVA sur marge calculée, ventilée et exportable — les suites étrangères
  (Travefy, Axus, Vamoos, mTrip) l'ignorent complètement.
- La conformité française vérifiée dans l'outil (immatriculation, garantie
  financière, RCP, médiateur, formulaire standardisé, interdiction de
  mentionner la TVA au client).
- Les deux vues du même dossier, garanties par l'architecture.
- Le mode hors-ligne réel dès aujourd'hui, avec affichage daté de la donnée
  périmée.

**La position à tenir :** être **l'outil de production de voyage des agences
françaises immatriculées que personne ne sert** — les indépendantes de 1 à 3
personnes encore sous Excel et Word — et le seul dont les chiffres soient
opposables : devis conforme, TVA sur marge juste, facture qui passera la
réforme de 2026-2027, app voyageur en prime. La conformité n'est pas un produit
à part, c'est la preuve de la promesse : les outils étrangers ne peuvent pas la
copier sans refaire leur moteur de prix, et les back-offices français calculent
des marges sans produire la pièce opposable. Le choix de cible et ce qu'il
écarte sont détaillés dans `besoins-et-entree-marche.md`.

---

## Dans quel ordre

**Vague 1 — ce qui empêche de vendre (≈ 1 trimestre)**
1. Génération PDF (devis, formulaire standardisé, facture, carnet).
2. E-mail transactionnel + journal d'envoi et d'ouverture.
3. Réinitialisation de mot de passe, invitation client en un clic.
4. Téléversement de documents, restitués hors-ligne dans l'app.
5. Réécrire `plans.ts` en offre agence et facturer l'abonnement.

**Vague 2 — ce qui tient le marché (≈ 2 trimestres)**
6. Factur-X + raccordement PDP (échéance 2026 réception / 2027 émission).
7. Multi-devise sur les achats, prix par personne, remises et frais de dossier.
8. Catalogue fournisseurs, bibliothèque de prestations, duplication de dossier,
   versions de devis.
9. Multi-utilisateurs et rôles dans l'agence.
10. Paiement en ligne et échéancier.

**Vague 3 — ce qui fait gagner**
11. App mobile en écriture + notifications push.
12. PWA installable (couverture iOS) puis marque blanche.
13. Import automatique des documents fournisseurs (parsing e-mail / PDF).
14. Pilotage : transformation, marge par fournisseur et par destination,
    carnet de commandes.
15. Connecteur Pennylane, export FEC, outillage RGPD.

## Sources

- [Ezus — comparatif des logiciels d'agence 2026](https://ezus.io/fr/article/meilleur-logiciel-agence-voyages-2026)
- [Ezus — meilleurs back-offices agences de voyages 2026](https://ezus.io/fr/article/meilleurs-logiciels-back-office-agence-voyages-2026)
- [Travicy — comparatif logiciel agence de voyage 2026](https://travicy.com/comparatif-logiciel-agence-voyage)
- [mTrip — best travel agency apps 2026](https://www.mtrip.com/best-travel-agency-apps-2026/)
- [Vamoos — travel company apps compared](https://www.vamoos.com/travel-company-apps-compared/)
- [economie.gouv.fr — facturation électronique](https://www.economie.gouv.fr/tout-savoir-sur-la-facturation-electronique-pour-les-entreprises)
- [Cegid — calendrier facture électronique 2026-2027](https://www.cegid.com/fr/facture-electronique-obligatoire/calendrier-facture-electronique/)
