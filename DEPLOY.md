# Mettre Journey Valley en ligne

Un VPS suffit. SQLite tient sans effort la charge d'une cinquantaine d'agences :
les écritures sont courtes, les lectures nombreuses, et tout est sur un disque
local. Le jour où ça ne suffit plus, c'est une bonne nouvelle et un autre
chantier.

## 1. Le serveur

Un VPS à 6–10 €/mois, Debian 12, 2 Go de RAM. Installer Docker :

```bash
curl -fsSL https://get.docker.com | sh
```

## 2. L'application

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

## 3. Le HTTPS

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

## 4. Le balayage des alertes prix

```cron
0 7 * * *  curl -fsS -X POST https://agence.votre-domaine.fr/api/watches/check \
             -H "x-cron-key: $WATCH_CRON_SECRET"
```

## 5. Les sauvegardes

Le fichier SQLite est la totalité des données. Il se copie à chaud avec la
commande dédiée — jamais `cp`, qui attraperait une écriture en cours :

```bash
docker exec jv sh -c 'node -e "
  const db = require(\"better-sqlite3\")(process.env.DATABASE_PATH);
  db.exec(\"VACUUM INTO \\\"/data/backup.db\\\"\");
"'
docker cp jv:/data/backup.db "./sauvegarde-$(date +%F).db"
```

À mettre dans un cron quotidien, avec envoi hors du VPS (un autre serveur, un
espace objet). **Une sauvegarde qu'on n'a jamais restaurée n'est pas une
sauvegarde** : essayez-la une fois, en lançant un conteneur dessus.

## 6. L'application Android

L'APK doit être construit avec l'adresse publique, qui est figée dedans :

```bash
JV_SERVER_URL=https://agence.votre-domaine.fr npm run apk
```

Puis distribué aux conseillers et aux voyageurs — par lien de téléchargement
depuis votre site, ou par le Play Store le jour où vous signez avec une clé de
publication.

## 7. Mettre à jour

```bash
git pull && docker build -t journey-valley . \
  && docker stop jv && docker rm jv && docker run -d ... # la même commande qu'au 2.
```

Les migrations sont additives et s'appliquent au premier démarrage : aucune
étape manuelle, et une ancienne base continue de fonctionner. Sauvegardez quand
même avant, par principe.

## Ce que ce guide ne couvre pas

- Aucune de ces commandes n'a pu être exécutée depuis la machine de
  développement (pas de Docker, pas de réseau sortant). Elles sont écrites
  d'après la documentation des images utilisées ; le premier déploiement mérite
  qu'on le regarde faire.
- Pas de RGPD clé en main : registre des traitements, DPA avec l'hébergeur et
  politique de conservation restent à écrire, et le produit stocke des données
  de voyageurs.
