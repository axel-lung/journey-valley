# Journey Valley — contexte du projet

SaaS français pour **agences de voyages immatriculées** (pas les mandataires à la
commission). Deux vues du même dossier : le conseiller voit les coûts et la
marge, le voyageur voit son voyage et son prix.

Interface en français. Code, commentaires et tests en anglais — sauf les
modules écrits après le pivot B2B (`margin.ts`, `vat.ts`, `legal.ts`,
`quotes.ts`, `agency.ts`, `mobile-api.ts`, `mobile/web/*`), commentés en
français comme le métier qu'ils décrivent. Suivre la langue du fichier qu'on
modifie.

## Les règles qui ne se négocient pas

1. **Un client ne voit jamais un coût d'achat ni une marge.** Ce n'est pas du
   CSS : les vues sont des routes séparées (`/trips/*` conseiller,
   `/mon-voyage/*` voyageur) et l'API mobile construit une charge utile
   différente par rôle. Un `if` oublié ne peut pas fuiter. Les tests
   bout-en-bout le vérifient sur le texte rendu — ne jamais affaiblir ces
   vérifications.
2. **L'argent est en centimes entiers.** `src/lib/money.ts` analyse ce que les
   gens tapent (`1 234,56`, `€1,500`) et le remet en forme. Rien ne multiplie
   un flottant par 100.
3. **La TVA s'extrait de la marge, elle ne s'y ajoute pas** : marge × 20/120.
   La part hors UE est exonérée, un forfait mixte se ventile au prorata des
   coûts d'achat. Tout est dans `src/lib/vat.ts`, avec ses tests.
4. **Le taux de marque (marge/vente) et le taux de marge (marge/achat) sont
   deux choses.** On affiche les deux. L'assistant de prix divise par (1 −
   taux), il ne multiplie jamais par (1 + taux).
5. **Un chiffre pas ferme se dit.** Une ligne sans prix de vente fait un
   plancher, un forfait pas encore acheté fait un plafond. `partial_reason`
   porte le sens, l'écran l'écrit.
6. **Un devis envoyé est figé.** Ses lignes sont recopiées dans `quote_lines`,
   jamais relues depuis le dossier.
7. **La TVA ne figure jamais sur une facture client.** Sous le régime de la
   marge, ne pas la mentionner est une condition d'application du régime, et la
   mention « Régime particulier – agences de voyages » est obligatoire. La TVA
   se calcule pour le conseiller (`vat.ts`) et s'exporte pour le comptable
   (`vat-return.ts`) — jamais sur le document remis au client.
8. **On ne facture pas plus que ce qui est vendu.** `billingFor` est la seule
   source de « ce qui reste à facturer » ; une facture émise se gèle, une
   facture annulée garde son numéro.
9. **Les estimations ne sont pas des offres.** Le fournisseur hors ligne produit
   des ordres de grandeur ; chaque écran qui les montre le dit, et elles
   n'entrent jamais dans un prix de vente ni dans une alerte.

## Où vivent les choses

```
src/lib/          domaine pur et testé : money, margin, vat, legal, quotes,
                  invoices, vat-return, budget, stages, itinerary, format,
                  practical, agency
                  (les modules *-store.ts portent les écritures ; le module pur
                  reste importable par un composant client)
src/lib/api/      services libres : URLs + parseurs (purs, partagés avec le
                  téléphone) ; live.ts porte le fetch côté serveur
src/lib/db.ts     schéma, migrations additives via addColumn(), seed au premier
                  démarrage
src/app/(app)/    tout ce qui est derrière une session
src/app/devis/    le devis public : pas de compte, le jeton autorise
src/app/api/mobile/  ce que lit l'application Android, rôle par rôle
mobile/web/       l'app : client.ts (API + cache), net.ts (pont), api.ts
                  (services libres), store.ts (session), app.tsx (écrans)
mobile/android/   coque WebView, cinq classes Java, modèles Config/manifeste
```

Migrations : **toujours additives** (`addColumn`), jamais de renommage de
colonne. `bookings.agency_quote_cents` est le prix de vente — nom hérité de la
version grand public, sens inversé par le pivot, documenté dans `types.ts`.

## Vérifier

```bash
npm run typecheck && npm test        # 162 tests unitaires
npm run build && npm run smoke       # 57 vérifications web bout-en-bout
JV_SERVER_URL=http://127.0.0.1:3114 npm run apk:web && npm run apk:test
                                     # 19 vérifications sur le bundle Android
```

`npm run smoke` et `npm run apk:test` démarrent un vrai serveur sur une base
jetable, avec `JV_DISABLE_LIVE_APIS=1`. Ils doivent rester verts : ce sont eux
qui gardent les règles ci-dessus.

## Comptes de démonstration

Mot de passe commun : `journey2026`.

| Compte | Rôle |
| --- | --- |
| `camille@journeyvalley.app` | conseillère, Escale Voyages |
| `sam@journeyvalley.app` | client |
| `noor@journeyvalley.app` | client |

## Contraintes de l'environnement de développement

- **Pas de réseau sortant** vers les services tiers (Nominatim, Open-Meteo,
  Amadeus, Légifrance…). Les parseurs sont testés sur des réponses enregistrées.
  Ne jamais écrire un test qui suppose un appel réel.
- **Pas de SDK Android Google.** L'APK se construit avec `aapt`,
  `dalvik-exchange`, `zipalign`, `apksigner` et `android-sdk-platform-23`.
- `JV_SERVER_URL` fixe l'adresse du serveur dans l'APK, côté bundle *et* côté
  Java. En `http://`, le manifeste engendré autorise le clair — uniquement pour
  essayer sur un réseau privé.

Déploiement : `docker-compose.yml` derrière un Traefik existant (réseau externe
`traefik`, resolver `myresolver`, rien de publié sur l'hôte), détaillé dans
`DEPLOY.md`. Le `Dockerfile` recompile better-sqlite3 dans la base de l'image
finale ; la base vit dans `./volumes/data`, qui doit appartenir à l'uid 1000.

## Ce qui reste ouvert

- Le texte des droits essentiels du formulaire standardisé a été rédigé d'après
  la directive (UE) 2015/2302, **pas recopié depuis l'arrêté du 1er mars 2018** :
  Légifrance est bloqué depuis cette machine. À confronter mot à mot avant toute
  vente réelle.
- Pas d'encaissement : la facture suit l'acompte et le solde, l'agence encaisse
  par ses propres moyens.
- Pas d'invitation client en un clic : il s'inscrit, le conseiller l'ajoute.
- Une seule agence par conseiller, pas de collègue à inviter.
- Rien ne facture l'abonnement de l'agence.
- Le téléphone lit, il n'écrit pas.
