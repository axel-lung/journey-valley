---
name: demo
description: Boot Journey Valley on a throwaway database and drive it in a real browser to see a change working, or to capture screenshots of the advisor view, the traveller view, a public quote or the mobile app. Use when asked to "montre", "fais tourner", "capture d'écran", "screenshot", or to confirm something works in the real app rather than in tests.
---

# Faire tourner la démonstration

## Le site

```bash
npm run build
DATABASE_PATH=/tmp/jv-demo/demo.db JV_DISABLE_LIVE_APIS=1 WATCH_CRON_SECRET=demo \
  node_modules/.bin/next start -p 3120
```

La base se crée, se migre et se remplit au premier accès. Comptes :
`camille@journeyvalley.app` (conseillère) et `sam@journeyvalley.app` (client),
mot de passe `journey2026`.

## L'application mobile

```bash
JV_SERVER_URL=http://127.0.0.1:3120 npm run apk:web
# puis servir mobile/dist/www en statique et ouvrir en 390×844
```

Le bundle parle au serveur ci-dessus. Dans un navigateur, il utilise `fetch` ;
l'API répond à toutes les origines parce que le jeton est en en-tête et jamais
en cookie.

## Captures d'écran

Playwright est là mais **ne télécharge aucun navigateur** : utiliser
`playwright-core` et le Chromium du système.

```js
import { chromium } from "playwright-core";
import { existsSync, globSync } from "node:fs";

const chrome = [
  ...globSync("/opt/pw-browsers/chromium-*/chrome-linux/chrome"),
  "/usr/bin/chromium",
].filter(existsSync);
const browser = await chromium.launch({ executablePath: chrome[0] });
```

Écrire le script dans un fichier temporaire **à la racine du projet** (les
imports depuis `node_modules` ne résolvent pas depuis `/tmp`), le supprimer
ensuite, et déposer les images dans le répertoire brouillon de la session.

Ce qui vaut une capture : le tableau de bord conseiller, l'onglet Prix & marge
d'un dossier (la TVA sur marge s'y lit), un devis public, et l'app mobile dans
ses deux modes. Toujours regarder l'image avant de la livrer : c'est là qu'on
voit les chiffres absurdes.
