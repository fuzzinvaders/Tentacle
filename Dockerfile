# syntax=docker/dockerfile:1

# --- Stage 1: build the SvelteKit (adapter-node) server ---
FROM node:22-alpine AS build
WORKDIR /app
# Métadonnées de version injectées dans l'app (git absent ici, .git étant exclu
# par .dockerignore) : la CI passe --build-arg SOURCE_COMMIT / SOURCE_DATE.
ARG SOURCE_COMMIT
ARG SOURCE_DATE
ENV SOURCE_COMMIT=${SOURCE_COMMIT}
ENV SOURCE_DATE=${SOURCE_DATE}
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- Stage 2: production runtime (Node) ---
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# Emplacement des données persistantes (comptes utilisateurs, secret de session).
ENV DATA_DIR=/data

# Dépendances de production uniquement (adapter-node exécute build/ avec ces deps).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Sortie du build + volume de données
COPY --from=build /app/build ./build
VOLUME /data

EXPOSE 3000

# Endpoint /healthz jamais protégé par l'authentification
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/healthz || exit 1

CMD ["node", "build"]
