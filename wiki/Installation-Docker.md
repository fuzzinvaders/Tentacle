# Installation via Docker

Tentacle tourne comme un **serveur Node** léger (SvelteKit `adapter-node`). Le serveur ne sert que deux choses côté back : l'**authentification** (comptes utilisateurs) et la distribution des fichiers de l'app. Toute la configuration des sources (connexions Jellyfin/PinePods/ListenBrainz, préférences) reste dans le navigateur. Les comptes utilisateurs sont stockés dans un **volume de données** persistant.

## Prérequis

- [Docker](https://docs.docker.com/get-docker/) (Engine 20.10+)
- [Docker Compose](https://docs.docker.com/compose/) (v2, intégré à Docker récent)

## Fichiers fournis dans le dépôt

| Fichier | Rôle |
| --- | --- |
| `Dockerfile` | Build multi-stage : build SvelteKit → runtime Node (`node build`) |
| `docker-compose.yml` | Build local depuis les sources + volume de données + mapping de port |
| `docker-compose.deploy.yml` | Déploiement à partir de l'image publiée sur le registre Gitea |
| `.dockerignore` | Exclut `node_modules`, `build`, `.git`, etc. du contexte de build |
| `.gitea/workflows/docker-publish.yml` | CI : build + push de l'image vers le registre Gitea |

Trois façons de faire : builder localement ([Méthode 1](#méthode-1--docker-compose-recommandé) / [2](#méthode-2--docker--à-la-main)), ou **déployer l'image pré-construite** publiée par la CI ([Méthode 3](#méthode-3--déployer-depuis-le-registre-gitea)).

## Méthode 1 — Docker Compose (recommandé)

Depuis la racine du dépôt cloné :

```sh
# Builder l'image et démarrer le conteneur en arrière-plan
docker compose up -d --build
```

L'application est alors disponible sur **http://localhost:8080**.

Au **tout premier lancement**, l'app t'emmène sur `/setup` pour créer le compte administrateur (voir [Authentification](#authentification-comptes-utilisateurs)).

Le port hôte est défini dans `docker-compose.yml` (`8080:3000` — l'app écoute sur 3000 dans le conteneur). Pour un autre port hôte, modifie la partie gauche, par exemple `9000:3000`, puis relance `docker compose up -d`.

Commandes utiles :

```sh
docker compose logs -f      # suivre les logs
docker compose ps           # état du conteneur
docker compose restart      # redémarrer
docker compose down         # arrêter et supprimer le conteneur
docker compose up -d --build   # rebuild après un git pull
```

## Méthode 2 — Docker « à la main »

```sh
# 1. Builder l'image
docker build -t tentacle:latest .

# 2. Lancer le conteneur (port hôte 8080 -> 3000 ; volume pour les comptes)
docker run -d --name tentacle -p 8080:3000 --restart unless-stopped \
  -v tentacle-data:/data -e ORIGIN=http://localhost:8080 \
  tentacle:latest
```

Mise à jour après un `git pull` :

```sh
docker stop tentacle && docker rm tentacle
docker build -t tentacle:latest .
docker run -d --name tentacle -p 8080:3000 --restart unless-stopped \
  -v tentacle-data:/data -e ORIGIN=http://localhost:8080 \
  tentacle:latest
```

## Méthode 3 — Déployer l'image publique *(la plus simple)*

Une image publique est publiée à chaque commit sur `main`. Sur ton serveur, **rien à builder,
aucun login, et pas besoin des sources** — juste le fichier `docker-compose.deploy.yml` :

```sh
# Démarrer
docker compose -f docker-compose.deploy.yml up -d

# Mettre à jour, plus tard
docker compose -f docker-compose.deploy.yml pull
docker compose -f docker-compose.deploy.yml up -d
```

C'est tout : `docker-compose.deploy.yml` pointe par défaut sur
**`ghcr.io/fuzzinvaders/tentacle:latest`**.

Un `.env` posé à côté sert à régler le reste (`ORIGIN`, `AUTH_SECRET`, `SETUP_TOKEN`…) :

```sh
cp .env.example .env
```

Pour t'écarter de l'image publique — registre privé, image construite localement, ou tag figé
au lieu de `latest` — renseigne `TENTACLE_IMAGE` dans ce `.env` :

```sh
TENTACLE_IMAGE=ghcr.io/fuzzinvaders/tentacle:1.0.0
TENTACLE_IMAGE=<ton-registre>/<utilisateur>/tentacle:latest   # registre privé → docker login
```

L'image est disponible sur **`ghcr.io/fuzzinvaders/tentacle`** avec les tags :

| Tag | Correspond à |
| --- | --- |
| `latest` | dernier commit sur `main` |
| `sha-xxxxxxx` | un commit précis de `main` |
| `X.Y.Z` / `X.Y` | un tag git de version `vX.Y.Z` |

## Publication automatique de l'image

Deux workflows coexistent, indépendants — chaque plateforme n'exécute que le sien :

| Workflow | Plateforme | Publie vers |
| --- | --- | --- |
| [`.github/workflows/docker-publish.yml`](https://github.com/fuzzinvaders/Tentacle/blob/main/.github/workflows/docker-publish.yml) | GitHub Actions | **GHCR, image publique** — c'est celle que tire `docker-compose.deploy.yml` |
| [`.gitea/workflows/docker-publish.yml`](https://github.com/fuzzinvaders/Tentacle/blob/main/.gitea/workflows/docker-publish.yml) | Gitea Actions | le registre de l'instance qui exécute le job (utile pour un miroir privé) |

Les deux produisent les mêmes tags, à partir du même `Dockerfile`.

### Visibilité du paquet GHCR, à vérifier une fois

Sur ce dépôt, le paquet est sorti **public directement** : il hérite de la visibilité du dépôt, et
un `docker pull` sans aucune authentification fonctionne — vérifié par un tirage anonyme de
`ghcr.io/fuzzinvaders/tentacle:latest`. Aucune action n'a été nécessaire.

Selon le compte et son historique, GHCR peut au contraire créer le paquet **privé**. Le test tient
en une commande, depuis n'importe quelle machine non authentifiée :

```sh
docker logout ghcr.io && docker pull ghcr.io/fuzzinvaders/tentacle:latest
```

S'il réclame un login, rends-le public une seule fois :

**Page du dépôt → Packages → `tentacle` → Package settings → Change visibility → Public.**

### CI Gitea (miroir privé, optionnel)

Le workflow Gitea build et pousse l'image à chaque :

- **push sur `main`** → tags `latest` + `sha-<court>`
- **push d'un tag `vX.Y.Z`** → tags `X.Y.Z` et `X.Y`

Publier une version taguée :

```sh
git tag v0.1.0
git push origin v0.1.0
```

### Prérequis côté Gitea

1. Un **runner Gitea Actions** actif et enregistré sur l'instance (les Actions doivent être activées pour le dépôt : *Settings → Actions*).
2. Le **registre de conteneurs** activé sur `<ton-instance-gitea>`.

### Authentification du push

Le workflow se connecte au registre avec le token automatique du job (`${{ github.actor }}` / `secrets.GITHUB_TOKEN`) et déclare la permission `packages: write`.

> Si le push échoue avec une erreur d'authentification/permission, le token automatique n'a pas le droit d'écrire sur les paquets sur cette instance. Dans ce cas :
> 1. Crée un **jeton d'accès personnel** (Gitea → *Settings → Applications*) avec le scope **`write:package`**.
> 2. Ajoute-le en secret du dépôt (*Settings → Actions → Secrets*), p. ex. `REGISTRY_TOKEN`, et un secret `REGISTRY_USER` avec ton identifiant.
> 3. Remplace dans le workflow `username`/`password` par `${{ secrets.REGISTRY_USER }}` / `${{ secrets.REGISTRY_TOKEN }}`.

## Mettre à jour l'application

**Depuis les sources** (Méthodes 1 & 2) :

```sh
git pull
docker compose up -d --build   # reconstruit l'image avec le nouveau code
```

**Depuis le registre** (Méthode 3) : voir l'étape 3 ci-dessus (`pull` puis `up -d`).

## Authentification (comptes utilisateurs)

L'authentification est intégrée à l'app (serveur Node) : mots de passe hachés (scrypt), sessions par cookie signé `HttpOnly`. Elle est **toujours active** dès qu'un compte existe.

- **Premier lancement** : aucune page n'est accessible tant que l'admin n'est pas créé. L'app redirige vers **`/setup`** pour créer le **compte administrateur**.
- Ensuite : page de **connexion** `/login`. L'admin peut **ajouter/supprimer des utilisateurs** depuis **Configuration → Utilisateurs** (les non-admins n'y ont pas accès).

> ⚠️ **Course au premier `/setup`** — si l'app est exposée publiquement *avant* que tu aies créé l'admin, le premier visiteur pourrait le créer à ta place. Deux parades : compléter `/setup` immédiatement après le déploiement, **ou** définir la variable `SETUP_TOKEN` (voir ci-dessous) qui exige un jeton pour créer l'admin.

### Variables d'environnement

| Variable | Rôle |
| --- | --- |
| `ORIGIN` | **Obligatoire derrière un reverse proxy** : l'URL publique exacte (ex. `https://tentacle.exemple.fr`). Sans elle, la connexion (POST) est rejetée pour raison de sécurité (CSRF). En local : `http://localhost:8080`. |
| `AUTH_SECRET` | Secret de signature des sessions (`openssl rand -hex 32`). **Recommandé** : sinon un secret aléatoire est généré et persisté dans le volume — les sessions restent valides tant que le volume existe. |
| `DATA_DIR` | Dossier des données (défaut `/data` dans l'image). |
| `PORT` | Port d'écoute interne (défaut `3000`). |
| `SETUP_TOKEN` | *(optionnel)* Si défini, la création de l'admin sur `/setup` exige ce jeton — ferme la « course au premier `/setup` » sur une instance exposée. Non défini = premier lancement ouvert. |

### Persistance

Les comptes vivent dans `DATA_DIR/users.json`, monté sur le **volume** `tentacle-data`. Ne le supprime pas, sinon tu repasses par la création d'admin.

```sh
# Réinitialiser complètement l'authentification (efface tous les comptes) :
docker compose down
docker volume rm tentacle_tentacle-data   # adapte le préfixe du projet
docker compose up -d
```

### Notes

- La sonde `/healthz` n'est **jamais** protégée (nécessaire au healthcheck du conteneur).
- Sers l'app en **HTTPS** (voir ci-dessous) : en HTTP, identifiants et cookie de session circulent en clair.

## Reverse proxy & HTTPS

Le conteneur écoute en **HTTP sur le port 3000** (interne). En production, place-le derrière un reverse proxy (Traefik, Caddy, nginx, ou le reverse proxy de ton infra) qui gère le TLS. **Pense à définir `ORIGIN`** sur l'URL publique, sinon la connexion échouera.

Exemple minimal de bloc nginx en frontal :

```nginx
server {
    listen 443 ssl;
    server_name tentacle.exemple.fr;

    # ... certificats TLS ...

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

> 💡 Servir Tentacle en **HTTPS** est recommandé : la plupart des navigateurs bloquent les requêtes vers un serveur Jellyfin/PinePods en HTTP depuis une page HTTPS (*mixed content*). Idéalement, sers Tentacle **et** tes sources en HTTPS.

### Avec Traefik

Si ton infra utilise déjà [Traefik](https://traefik.io/) (découverte automatique par labels), utilise **[`docker-compose.traefik.yml`](https://github.com/fuzzinvaders/Tentacle/blob/main/docker-compose.traefik.yml)** au lieu de `docker-compose.deploy.yml` : le conteneur rejoint un réseau Docker externe partagé avec Traefik, sans exposer de port sur l'hôte.

```sh
# 1. Si le réseau partagé avec Traefik n'existe pas encore
docker network create proxy

# 2. Démarrer (DOMAIN = ton nom de domaine, sans schéma)
DOMAIN=tentacle.exemple.fr docker compose -f docker-compose.traefik.yml up -d
```

À adapter selon ton installation Traefik :
- **`proxy`** — nom du réseau Docker externe sur lequel Traefik écoute (change-le dans le fichier si le tien s'appelle autrement).
- **`entrypoints=websecure`** — adapte au nom de ton entrypoint HTTPS.
- **`certresolver`** — décommente et adapte la ligne si tu utilises la résolution ACME automatique de Traefik.

`ORIGIN` est dérivé automatiquement de `DOMAIN` (`https://$DOMAIN`) — pas besoin de le redéfinir séparément.

#### Si ce domaine n'est pas chez le même fournisseur DNS que tes autres domaines

Un resolver ACME en DNS-01 est lié à **un seul fournisseur DNS** (celui du jeton API configuré
dessus). Si ton resolver `letsencrypt` gère déjà un domaine chez Infomaniak par exemple, et que
celui de Tentacle est chez OVH, Cloudflare ou un autre registrar, ce même resolver **ne pourra
jamais** émettre de certificat pour ce domaine : impossible de poser le `TXT _acme-challenge` sur
une zone qu'il ne gère pas.

Symptôme : le navigateur affiche un certificat auto-signé Traefik (`TRAEFIK DEFAULT CERT`) au lieu
d'un certificat Let's Encrypt, et les logs Traefik montrent une erreur du type `unknown zone for
'_acme-challenge.<domaine>'` ou `dns01: error presenting token`.

La solution est un **second resolver** dans la config statique Traefik (hors de ce dépôt),
utilisant le provider `lego` du fournisseur qui gère réellement ce domaine — par exemple pour OVH :

```yaml
certificatesResolvers:
  ovh:
    acme:
      email: ton-email@exemple.fr
      storage: /letsencrypt/acme-ovh.json   # fichier séparé de celui des autres domaines
      dnsChallenge:
        provider: ovh
```

avec les identifiants API OVH ([créés ici](https://eu.api.ovh.com/createToken/)) passés en
variables d'environnement au conteneur Traefik : `OVH_ENDPOINT`, `OVH_APPLICATION_KEY`,
`OVH_APPLICATION_SECRET`, `OVH_CONSUMER_KEY`. Le label `certresolver` de Tentacle référence
ensuite le nom de ce resolver (`ovh`, pas `letsencrypt`).

## Instance de démonstration

Une instance **vitrine**, publique, où les visiteurs n'ont aucun serveur Jellyfin à connecter —
c'est ce qui tourne sur <https://tentacle.fuzzonaut.space>.

Ajoute simplement à ton `.env` :

```sh
DEMO_MODE=1
```

L'application affiche alors un bandeau proposant de **charger un petit catalogue d'exemple**
(3 albums, pochettes générées, audio de synthèse) : tout le lecteur, la file d'attente et les écrans
deviennent explorables sans rien installer. Le mode démonstration n'est jamais imposé — une
connexion Jellyfin existante n'est pas touchée, et le visiteur peut refuser.

⚠️ Deux précautions pour une instance exposée à Internet :

- **Renseigne `SETUP_TOKEN`.** Sans lui, le premier visiteur qui trouve `/setup` crée le compte
  administrateur.
- **Crée le compte de démonstration toi-même**, puis communique ses identifiants (par exemple dans
  la description de ton dépôt). Les visiteurs se connectent avec ce compte plutôt que d'en créer un.

Le catalogue de démonstration est purement local au navigateur : aucune donnée n'est écrite côté
serveur, et l'audio est synthétisé à la volée (une note par titre — les enchaînements et les fondus
s'entendent donc réellement).

## CORS — point d'attention

Comme les requêtes vers Jellyfin et PinePods partent **du navigateur**, ces serveurs doivent autoriser l'origine de Tentacle via les en-têtes `Access-Control-Allow-Origin`. Si les connexions échouent alors que les identifiants sont bons, vérifie la console du navigateur : une erreur CORS y apparaîtra. Voir [Configuration](Configuration) pour les détails.

## Dépannage

| Symptôme | Piste |
| --- | --- |
| `docker compose` inconnu | Utilise `docker-compose` (v1) ou installe Docker Compose v2 |
| Port déjà utilisé | Change le port hôte dans `docker-compose.yml` |
| Page blanche | Vérifie `docker compose logs -f` et la console du navigateur |
| Connexion source impossible | Erreur CORS ou *mixed content* — voir sections ci-dessus |
| Build échoue sur `npm ci` | Vérifie que `package-lock.json` est bien présent et à jour |

## Détail du `Dockerfile`

```dockerfile
# Stage 1 — build SvelteKit (adapter-node)
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build          # -> /app/build

# Stage 2 — runtime Node (dépendances de prod uniquement)
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/build ./build
VOLUME /data
EXPOSE 3000
CMD ["node", "build"]
```
