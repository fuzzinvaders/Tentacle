# Développement local

## Prérequis

- [Node.js](https://nodejs.org/) 20 ou plus (Vite 8 requiert Node ≥ 20)
- npm (fourni avec Node)

## Installation

```sh
git clone https://github.com/fuzzinvaders/Tentacle.git
cd Tentacle
npm install
```

## Lancer en mode développement

```sh
npm run dev
# ou en ouvrant directement le navigateur :
npm run dev -- --open
```

Le serveur de dev (Vite) démarre avec rechargement à chaud (HMR).

## Scripts disponibles

| Script | Description |
| --- | --- |
| `npm run dev` | Serveur de développement Vite (HMR) |
| `npm run build` | Build de production (serveur Node) → `build/` |
| `npm run preview` | Prévisualise le build de production |
| `npm run check` | Vérification TypeScript / Svelte (`svelte-check`) |
| `npm run check:watch` | `check` en mode surveillance |
| `npm run test` | Tests unitaires (Vitest) des fonctions pures |
| `npm run test:watch` | Tests en mode surveillance |
| `npm run build:mobile` | Build statique SPA (sans auth) → `build-mobile/`, pour l'app mobile — voir [Application mobile (APK)](Application-Mobile-APK) |
| `npm run cap:sync` | Recopie `build-mobile/` dans le projet Android (Capacitor) |
| `npm run android:open` | Ouvre le projet Android dans Android Studio |

## Build de production

```sh
npm run build
```

Le résultat dans `build/` est un **serveur Node** : lance-le avec `node build` (il faut les dépendances de production et, en prod, les variables `ORIGIN`/`AUTH_SECRET`/`DATA_DIR`). C'est ce que fait l'image Docker — voir [Installation via Docker](Installation-Docker).

En dev, les comptes de l'authentification sont écrits dans `./.data/users.json` (ignoré par git). Supprime ce dossier pour repartir de la création d'admin. Personnalise l'emplacement avec `DATA_DIR`.

## Stack technique

- **[SvelteKit](https://svelte.dev/docs/kit)** 2 + **[Svelte 5](https://svelte.dev/)** (mode *runes* forcé sur le code du projet)
- **[Vite](https://vite.dev/)** 8 + **TypeScript**
- L'app est rendue **côté client** (`ssr = false`, `prerender = false`) ; le serveur ne fait que l'authentification, quelques relais et le profil utilisateur
- **Authentification** : `src/lib/server/` (store JSON + scrypt + cookie de session signé HMAC), routes `/setup`, `/login`, `/logout`, `/api/users`
- État applicatif via des **stores en runes** (`*.svelte.ts`) : `player`, `ui`, `settings`, `jellyfin`, `pinepods`, `localPodcasts`, `podcastSpeeds`, `podcastSkips`, `listenbrainz`, `lastfm`, `lidarr`, `radios`, `localFiles`, `downloads`, `alarm`, `sleep`, `toasts`, `contextMenu`

> ⚠️ **Il n'y a pas de `svelte.config.js`** : toute la configuration SvelteKit, y compris le choix
> de l'adaptateur (`adapter-node` pour le web, `adapter-static` pour le mobile selon
> `BUILD_TARGET`), vit dans les options du plugin `sveltekit({…})` de `vite.config.ts`.

Pour comprendre **ce qui tourne où** (routes serveur, frontière de synchronisation, différences
web/mobile, variables d'environnement), voir la page **[Architecture](Architecture)**.

## Organisation du code

```
src/
├─ hooks.server.ts         # garde d'authentification (toutes les requêtes) + /healthz
├─ service-worker.ts       # précache minimal de la coquille de l'app
├─ routes/
│  ├─ +layout.svelte       # chrome, LECTEUR (2 éléments <audio>), raccourcis clavier
│  ├─ +page.svelte         # aiguillage des espaces
│  ├─ login/ setup/ logout/
│  └─ api/                 # profile, users, lidarr, podcast-feed, lastfm, artist-top
├─ lib/
│  ├─ server/              # users (JSON), password (scrypt), token (HMAC), rateLimit
│  ├─ api/                 # clients : jellyfin, pinepods, localPodcasts, radioBrowser,
│  │                       #   listenbrainz, lastfm, lidarr, lrclib, musicbrainz, popular
│  ├─ stores/              # état (runes) — voir la liste ci-dessus
│  ├─ components/          # UI par espace : home, library, radios, podcasts, player,
│  │                       #   config, shared
│  ├─ actions/             # actions Svelte (ex. contextTrigger : clic droit / appui long)
│  ├─ *Track.ts            # adaptateurs vers le bus audio commun
│  └─ rss.ts chapters.ts opml.ts jspf.ts lrc.ts alarmSchedule.ts …
│                          # fonctions PURES (c'est ce qui est couvert par les tests)
└─ scripts/                # build-mobile.mjs, sync-wiki.ps1 (à la racine du dépôt)
```

## Tests et vérifications

```sh
npm run check   # svelte-check — doit rester à 0 erreur / 0 avertissement
npm test        # Vitest — 15 fichiers, 80 cas
```

- **`npm run check` est strict** : Svelte 5 traite notamment les **sélecteurs CSS inutilisés comme
  des erreurs**. Un composant dont tu retires un élément mais pas sa règle CSS fera échouer la
  vérification.
- Les tests ne couvrent que des **fonctions pures**, volontairement : `vitest.config.ts` n'inclut
  pas le plugin SvelteKit, donc `$lib`, `$app` et `$env` ne sont pas résolus. Écrire un test signifie
  donc **extraire la logique dans un module pur** (`src/lib/*.ts`) plutôt que la laisser dans un
  composant — c'est le motif suivi par `rss.ts`, `chapters.ts`, `alarmSchedule.ts`, etc.
- Il n'y a **pas de tests bout-en-bout**. La validation de l'interface passe par le
  [Plan de test](Plan-de-test) manuel.

## Documentation (wiki)

Le wiki Gitea est un **dépôt séparé**, mais son contenu est versionné dans ce dépôt sous `wiki/`.
Le flux d'édition est donc :

```sh
# 1. éditer les pages
#    wiki/*.md   (Home.md = page d'accueil, _Sidebar.md = menu latéral)
# 2. committer normalement dans le dépôt principal
git add wiki && git commit -m "Docs : …"
# 3. publier vers le wiki Gitea
.\scripts\sync-wiki.ps1 -Message "Mise a jour de la documentation"
```

Le script clone le dépôt wiki dans un dossier temporaire, y recopie `wiki/*.md`, committe et pousse
(sans rien faire s'il n'y a aucun changement). Conventions de nommage Gitea : un `-` dans un nom de
fichier s'affiche comme une espace dans le titre de la page.

## Workflow git

```sh
git add -A
git commit -m "message"
git push
```

La branche `main` suit déjà `origin/main`, donc un simple `git push` suffit.
