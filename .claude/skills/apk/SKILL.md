---
name: apk
description: Build and deliver the Journey Valley Android APK for a given server address, and explain how to install and test it. Use when asked for "l'apk", "une nouvelle version mobile", "je veux tester sur mon téléphone", or after changing anything under mobile/.
---

# Construire et livrer l'APK

```bash
JV_SERVER_URL=https://votre-serveur.example npm run apk
# → mobile/dist/journey-valley.apk
```

`JV_SERVER_URL` est **l'adresse du serveur de l'agence**, figée dans l'APK à
deux endroits : le bundle (qui appelle) et `Config.java` (dont la liste blanche
n'autorise que cet hôte). Un APK ne sait donc joindre qu'un seul serveur, plus
les six services libres.

## Essayer depuis un vrai téléphone

Le téléphone doit joindre la machine ; `localhost` ne veut rien dire pour lui.

```bash
hostname -I                       # relever l'adresse du réseau local
npm run build
DATABASE_PATH=/tmp/jv/demo.db JV_DISABLE_LIVE_APIS=1 WATCH_CRON_SECRET=x \
  node_modules/.bin/next start -p 3000        # écoute sur 0.0.0.0
JV_SERVER_URL=http://192.168.x.y:3000 npm run apk
```

En `http://`, le manifeste engendré porte `usesCleartextTraffic` et la liste
blanche Java tolère les adresses privées (127.0.0.1, 10.x, 172.16–31.x,
192.168.x, 10.0.2.2 pour l'émulateur). En `https://`, rien de tout cela : un
APK de production n'a aucune tolérance au clair.

## Vérifier avant de livrer

```bash
JV_SERVER_URL=http://127.0.0.1:3114 npm run apk:web && npm run apk:test  # 19/19
aapt dump badging mobile/dist/journey-valley.apk | grep -E "package:|permission"
```

Attendu : `INTERNET`, `ACCESS_NETWORK_STATE`, et rien d'autre. Signature
v1+v2+v3 avec `mobile/debug.keystore` — clé de développement, git-ignorée ;
une vraie publication se signe avec une clé conservée ailleurs, et toute mise à
jour doit garder la même.

## Livrer

Envoyer le fichier avec `SendUserFile`, en disant sur quel serveur il est
construit — un APK qui pointe vers un serveur inexistant ne peut pas se
connecter, et c'est la première chose qui déroute.
