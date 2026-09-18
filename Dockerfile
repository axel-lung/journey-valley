# Journey Valley — image de production.
#
# Deux étapes : on compile avec les outils de construction, on n'expédie que le
# nécessaire. better-sqlite3 est un module natif, donc il est recompilé dans la
# même base que l'image finale — pas de binaire venu d'ailleurs.

FROM node:22-bookworm-slim AS build
WORKDIR /app

# python3, make et g++ servent à better-sqlite3 ; ils ne suivent pas en prod.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# Le dépôt n'a pas de `public/` — rien à servir en statique aujourd'hui. On le
# crée quand même : la copie vers l'image finale reste valable, et un fichier
# déposé là plus tard suivra sans toucher au Dockerfile.
RUN mkdir -p public && npm run build

# ---------------------------------------------------------------------------

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json

# La base vit sur un volume : l'image est jetable, les données non.
ENV DATABASE_PATH=/data/journey-valley.db
VOLUME /data

# L'utilisateur `node` existe déjà dans l'image ; il doit pouvoir écrire /data.
RUN mkdir -p /data && chown -R node:node /data
USER node

EXPOSE 3000
CMD ["node_modules/.bin/next", "start", "-p", "3000", "-H", "0.0.0.0"]
