# Mettre Journey Valley en ligne

Un VPS suffit. SQLite tient sans effort la charge d'une cinquantaine d'agences :
les écritures sont courtes, les lectures nombreuses, et tout est sur un disque
local. Le jour où ça ne suffit plus, c'est une bonne nouvelle et un autre
chantier.

## Avec un Traefik déjà en place

C'est le cas le plus simple : `docker-compose.yml` est écrit pour ça.

```bash
git clone <votre-dépôt> journey-valley && cd journey-valley
cp .env.compose.example .env && $EDITOR .env      # domaine + secret du cron

# Le conteneur tourne en uid 1000 : le répertoire de données doit lui appartenir,
# sinon SQLite ne peut pas écrire.
mkdir -p ./volumes/data && sudo chown -R 1000:1000 ./volumes/data

docker compose up -d --build
```

Le service rejoint le réseau externe `traefik`, expose son port 3000 à Traefik
seul — rien n'est publié sur l'hôte — et le certificat vient du resolver
`myresolver`, comme vos autres services. Pointez l'enregistrement A du domaine
sur le VPS avant de démarrer.

Vérifier :

```bash
docker compose logs -f journey-valley
curl -sSI https://$JV_DOMAIN/login | head -1
```

Mettre à jour :

```bash
git pull && docker compose up -d --build
```

Les migrations sont additives et s'appliquent au premier démarrage : aucune
étape manuelle, et une ancienne base continue de fonctionner. Sauvegardez quand
même avant, par principe.

## Sans Traefik

### Le serveur

Un VPS à 6–10 €/mois, Debian 12, 2 Go de RAM. Installer Docker :

```bash
curl -fsSL https://get.docker.com | sh
```

### L'application

```bash
git clone <votre-dépôt> journey-valley && cd journey-valley
docker build -t journey-valley .

docker run -d --name jv --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  -v jv-data:/data \
  -e WATCH_CRON_SECRET="$(openssl rand -hex 24)" \
  -e JV_USER_AGENT="JourneyValley/1.0 (contact@votre-agence.fr)" \
  journey-valley
```

`-p 127.0.0.1:3000:3000` n'expose rien sur l'internet : c'est le proxy qui
publiera, en HTTPS. La base est dans le volume `jv-data`, pas dans le conteneur.

Variables utiles :

| Variable | Rôle |
| --- | --- |
| `DATABASE_PATH` | déjà réglée sur `/data/journey-valley.db` |
| `WATCH_CRON_SECRET` | secret du balayage des alertes ; sans lui, l'endpoint refuse de tourner |
| `JV_USER_AGENT` | ce que les services libres voient ; mettez une adresse de contact, c'est leur usage |
| `AMADEUS_CLIENT_ID` / `AMADEUS_CLIENT_SECRET` / `AMADEUS_ENV` | recherche de vols réelle (facultatif) |

### Le HTTPS avec Caddy

Caddy obtient et renouvelle le certificat sans configuration :

```bash
docker run -d --name caddy --restart unless-stopped --network host \
  -v caddy-data:/data -v caddy-config:/config \
  -v "$PWD/Caddyfile:/etc/caddy/Caddyfile:ro" \
  caddy:2
```

`Caddyfile` :

```
agence.votre-domaine.fr {
    reverse_proxy 127.0.0.1:3000
}
```

Pointez l'enregistrement A du domaine sur l'IP du VPS avant de lancer Caddy.

## Le balayage des alertes prix

```cron
0 7 * * *  curl -fsS -X POST https://agence.votre-domaine.fr/api/watches/check \
             -H "x-cron-key: $WATCH_CRON_SECRET"
```

## Les sauvegardes

Le fichier SQLite est la totalité des données. Il se copie à chaud avec la
commande dédiée — jamais `cp`, qui attraperait une écriture en cours :

```bash
docker compose exec journey-valley node -e '
  const db = require("better-sqlite3")(process.env.DATABASE_PATH);
  db.exec(`VACUUM INTO "/data/backup-${new Date().toISOString().slice(0,10)}.db"`);
'
```

Le fichier atterrit dans `./volumes/data/`, donc sur l'hôte, prêt à être
envoyé ailleurs. Sans Compose, remplacez par `docker exec jv …` puis
`docker cp jv:/data/backup-*.db .`.

À mettre dans un cron quotidien, avec envoi hors du VPS (un autre serveur, un
espace objet). **Une sauvegarde qu'on n'a jamais restaurée n'est pas une
sauvegarde** : essayez-la une fois, en lançant un conteneur dessus.

## L'application Android

L'APK doit être construit avec l'adresse publique, qui est figée dedans :

```bash
JV_SERVER_URL=https://agence.votre-domaine.fr npm run apk
```

Puis distribué aux conseillers et aux voyageurs — par lien de téléchargement
depuis votre site, ou par le Play Store le jour où vous signez avec une clé de
publication.

## Mettre à jour (sans Compose)

```bash
git pull && docker build -t journey-valley . \
  && docker stop jv && docker rm jv && docker run -d ... # la même commande qu'au 2.
```

Les migrations sont additives et s'appliquent au premier démarrage : aucune
étape manuelle, et une ancienne base continue de fonctionner. Sauvegardez quand
même avant, par principe.

## Ce que ce guide ne couvre pas

- Aucune de ces commandes n'a pu être exécutée depuis la machine de
  développement (pas de Docker, pas de réseau sortant). Le `docker-compose.yml`
  est valide et calqué sur celui qui fait tourner vos autres services, mais le
  premier `docker compose up` mérite qu'on le regarde faire — en particulier la
  première écriture dans `./volumes/data`, qui est le point où un problème de
  droits se révèle.
- Pas de RGPD clé en main : registre des traitements, DPA avec l'hébergeur et
  politique de conservation restent à écrire, et le produit stocke des données
  de voyageurs.
