# Architecture

Comment Tentacle est construit, et surtout **ce qui tourne où**. C'est la page à lire avant de
déboguer une connexion qui échoue ou de comprendre pourquoi telle fonction manque dans l'APK.

## Vue d'ensemble

Tentacle est une **application cliente** (SvelteKit 2 / Svelte 5 en mode *runes*, `ssr = false`,
`prerender = false` — voir `src/routes/+layout.ts`) servie par un **serveur Node volontairement
minimal** (`adapter-node`).

Le serveur n'a que **trois rôles** :

1. **Authentification** — comptes, sessions, pages `/setup`, `/login`, `/logout`.
2. **Relais (proxy)** vers les API qui refusent les appels directs du navigateur.
3. **Profil utilisateur** — pour que la configuration suive le compte d'un appareil à l'autre.

Tout le reste part **directement du navigateur** : Jellyfin, PinePods, Radio Browser,
ListenBrainz, LRCLIB (paroles), l'annuaire iTunes (recherche de podcasts). C'est ce qui rend
l'app installable sans serveur du tout (voir [Application mobile](Application-Mobile-APK)) — mais
c'est aussi la cause des problèmes **CORS / mixed content** décrits dans
[Configuration](Configuration).

> `svelte.config.js` **n'existe pas** dans ce projet : toute la configuration SvelteKit, y compris
> le choix de l'adaptateur, vit dans les options du plugin `sveltekit({…})` de `vite.config.ts`.

## Les routes serveur

Toutes les routes `/api/*` sont **fermées par défaut** : `src/hooks.server.ts` répond `401` à un
visiteur anonyme (et `503` tant qu'aucun compte n'existe), et **chaque handler revérifie
`locals.user`** de son côté. `/healthz` est la seule exception : elle répond `ok` avant toute
vérification, pour le `HEALTHCHECK` Docker.

| Route | Rôle | Pourquoi côté serveur |
| --- | --- | --- |
| `/api/profile` | `GET`/`PUT` du profil de l'utilisateur courant (corps limité à 256 Ko) | État persistant, par compte |
| `/api/users`, `/api/users/[id]` | Gestion des comptes | `GET`/`POST`/`DELETE` réservés aux **admins** ; `PATCH` = changer son propre mot de passe (avec l'actuel) ou réinitialiser celui d'un autre (admin). Les hachages ne sortent jamais du serveur |
| `/api/lidarr` | Relais vers **ton** instance Lidarr (en-tête `X-Api-Key`) | **CORS** : Lidarr n'envoie pas d'en-têtes CORS. Bornes : `http(s)` seulement, chemin devant commencer par `/api/v1/`, méthodes `GET/POST/PUT` |
| `/api/podcast-feed` | Relais vers un flux RSS **ou** un document JSON de chapitres | **CORS** : les hébergeurs de podcasts n'envoient presque jamais d'en-têtes CORS. Bornes : `GET` seulement, réponse plafonnée à 15 Mo (lecture en flux) |
| `/api/lastfm` | Relais **signé** vers `ws.audioscrobbler.com` | **Secret partagé** : chaque appel authentifié Last.fm exige `api_sig = md5(paramètres triés + secret)`. Liste blanche de 4 méthodes seulement (`auth.getToken`, `auth.getSession`, `track.updateNowPlaying`, `track.scrobble`) |
| `/api/artist-top` | Titres populaires d'un artiste, via `api.deezer.com` | **CORS** : Deezer n'envoie pas d'en-têtes CORS. Hôte fixe, aucun paramètre d'URL libre |

**Note SSRF** : `/api/lidarr` et `/api/podcast-feed` acceptent une URL fournie par le client. Ils
bloquent les cibles de métadonnées cloud (`169.254.*`, `metadata.google.internal`,
`[fd00:ec2::254]`) mais **autorisent volontairement le réseau local** — beaucoup d'instances
Lidarr et de flux personnels y sont hébergés. C'est un compromis assumé pour une app
auto-hébergée à usage personnel.

## Authentification et sessions

- **Stockage des comptes** : un seul fichier JSON, `DATA_DIR/users.json` (`src/lib/server/users.ts`).
  Écritures **atomiques** (fichier temporaire puis `rename`). Aucun cache en lecture.
- **Mots de passe** : `scrypt` (sel aléatoire de 16 octets, hachage 64 octets), stockés
  `sel:hachage`, comparés en temps constant (`src/lib/server/password.ts`). Minimum 6 caractères,
  identifiant minimum 2 caractères, unicité insensible à la casse.
- **Sessions** : cookie `tentacle_session`, `httpOnly`, `sameSite=lax`, `secure` si HTTPS,
  **30 jours**. Le jeton est **sans état** : `base64url({uid, exp}).hmac_sha256` — il n'y a donc
  **pas de table de sessions et pas de révocation individuelle** ; changer `AUTH_SECRET`
  invalide toutes les sessions d'un coup (`src/lib/server/token.ts`).
- **Limitation de débit** : 5 échecs dans une fenêtre de 10 min → blocage 5 min, par
  couple *(IP, identifiant)*. **En mémoire uniquement** (`src/lib/server/rateLimit.ts`), donc
  valable pour un seul processus. Appliquée à `/login` seulement.
- **Premier démarrage** : tant qu'aucun compte n'existe, tout redirige vers `/setup`, qui crée un
  compte **admin**. Un `SETUP_TOKEN` peut être exigé. Une double vérification du nombre de comptes
  encadre l'écriture pour fermer la fenêtre de course entre deux soumissions concurrentes.
- **Rôles** : `isAdmin` est un simple booléen ; le premier compte l'obtient toujours.

## Frontière de synchronisation — ce qui suit le compte, et ce qui ne le suit pas

C'est le point le plus souvent mal compris. Sur la **version web**, le profil serveur ne contient
que **7 champs** (`src/lib/profileSync.svelte.ts`) :

**Synchronisé (suit ton compte, d'un navigateur à l'autre)**

- les connexions **Jellyfin**, **PinePods**, **ListenBrainz**, **Last.fm**, **Lidarr** ;
- l'objet **Préférences** en entier (thème, qualité de flux, égaliseur, fondu, source podcast,
  tri des épisodes, etc.) ;
- les **radios** enregistrées.

**NON synchronisé — local à l'appareil / au navigateur**

| Donnée | Clé `localStorage` |
| --- | --- |
| **Abonnements aux podcasts « Intégrés »** (+ progression, file, épisodes vus) | `tentacle:local-podcasts`, `…-state`, `…-queue`, `…-seen` |
| Vitesse de lecture mémorisée **par podcast** | `tentacle:podcast-speeds` |
| Saut d'intro/outro **par podcast** | `tentacle:podcast-skips` |
| Réveil programmé | `tentacle:alarm` |
| Registre des **téléchargements hors-ligne** | `tentacle:downloads`, `tentacle:download-albums` |
| File de lecture + position courante | `tentacle:player` |
| Dernière liste « En cours » (cache d'affichage) | `tentacle:podcast-inprogress-cache` |

> ⚠️ Conséquence concrète : **les abonnements aux podcasts intégrés ne suivent pas le compte.**
> C'est précisément ce que PinePods apporte en plus (un serveur qui centralise). Pour transférer
> ces données d'un appareil à l'autre, utilise l'export/import de réglages
> (Configuration → *Sauvegarde des réglages*), qui **inclut** ces clés locales.

**Cycle de vie** : à la connexion, `loadProfile()` hydrate les stores depuis le serveur ; si le
profil serveur est vide (première connexion), la config locale existante y est poussée
(*migration douce*). Ensuite chaque modification déclenche une sauvegarde différée de 800 ms. À la
déconnexion sur le web, la config locale est **purgée** pour qu'un navigateur partagé ne laisse
pas fuiter la config d'un utilisateur vers le compte suivant. Les onglets se resynchronisent entre
eux via l'événement `storage`.

> 🔒 Le profil contient les **jetons et clés API en clair** dans `DATA_DIR/users.json`. Protège ce
> fichier comme un secret (volume Docker, sauvegardes chiffrées).

## Deux cibles de build

`vite.config.ts` choisit l'adaptateur selon la variable d'environnement `BUILD_TARGET` :

| Cible | Commande | Adaptateur | Sortie |
| --- | --- | --- | --- |
| **Web** | `npm run build` | `adapter-node` | `build/` — serveur Node (`node build`) |
| **Mobile** | `npm run build:mobile` | `adapter-static` (SPA, fallback `index.html`) | `build-mobile/` — fichiers statiques pour Capacitor |

Le build mobile passe par `scripts/build-mobile.mjs`, qui **désactive temporairement la couche
d'authentification** (`src/hooks.server.ts` et `src/routes/+layout.server.ts` renommés en
`*.disabled`) le temps du build, puis les restaure systématiquement (bloc `finally`, plus
auto-réparation si un build précédent a été interrompu). Sans cela, le hook intercepterait la
requête de génération du fallback SPA et la redirigerait vers `/login` — la génération statique
échouerait.

La **version affichée** en pied de page (`v0.0.1 · <commit> · <date>`) vient de constantes
injectées au build : `__APP_VERSION__`, `__APP_COMMIT__`, `__APP_BUILD_DATE__`. Comme l'image
Docker ne contient pas `.git`, la CI passe le commit et la date en `--build-arg`
(`SOURCE_COMMIT`, `SOURCE_DATE`).

## Matrice web / mobile

| Fonction | Web (Docker) | APK (Capacitor) |
| --- | --- | --- |
| Comptes, connexion, multi-utilisateur | ✅ | ❌ *(volontaire — verrouillage de l'appareil à la place)* |
| Profil synchronisé entre appareils | ✅ | ❌ *(stockage local ; export/import à la place)* |
| Jellyfin, Radios, ListenBrainz, paroles | ✅ | ✅ |
| Podcasts PinePods | ✅ | ✅ |
| Podcasts « Intégrés » (RSS) | ✅ *(via le relais `/api/podcast-feed`)* | ✅ *(requête native `CapacitorHttp`, sans CORS)* |
| Chapitres de podcast | ✅ | ✅ |
| Scrobbling ListenBrainz | ✅ | ✅ |
| **Scrobbling Last.fm** | ✅ | ❌ *(signature serveur requise)* |
| **Lidarr** (albums manquants) | ✅ | ❌ *(relais serveur requis)* |
| **Titres populaires** d'un artiste | ✅ | ❌ *(relais Deezer requis ; repli silencieux)* |
| **Téléchargements hors-ligne** | ❌ | ✅ *(système de fichiers natif)* |
| **Réveil programmé** | ❌ | ✅ *(notifications locales planifiées)* |
| Contrôles écran verrouillé, lecture en arrière-plan | partiel *(Media Session du navigateur)* | ✅ *(service natif de premier plan)* |

## Capacitor et natif Android

Trois plugins seulement (`package.json`) :

- **`@capacitor/filesystem`** — téléchargements hors-ligne (`downloadFile` dans `Directory.Data`,
  `stat` pour la taille, lecture via `Capacitor.convertFileSrc`).
- **`@capacitor/local-notifications`** — réveil programmé. Comme Capacitor ne sait pas « répéter
  certains jours de la semaine », l'app **pré-programme 8 occurrences** à venir (ids 424200→424207)
  et les réarme à chaque lancement : il faut donc **ouvrir l'app au moins une fois par semaine**.
- **`@capgo/capacitor-media-session`** — vraie `MediaSession` native + service de premier plan
  (contrôles fiables sur l'écran verrouillé, touches Bluetooth). Retombe sur
  `navigator.mediaSession` sur le web.

**Permissions Android** et leur raison (`android/app/src/main/AndroidManifest.xml`) :

| Permission | Pourquoi |
| --- | --- |
| `INTERNET` | streaming et appels API |
| `FOREGROUND_SERVICE` | service de lecture du plugin MediaSession |
| `FOREGROUND_SERVICE_MEDIA_PLAYBACK` | **obligatoire depuis Android 14** pour ce type de service — sans elle, l'app se fermait immédiatement au lancement |
| `POST_NOTIFICATIONS` | notification média (Android 13+) et notifications du réveil |

**`targetSdkVersion = 34` est délibéré** (`android/variables.gradle`, `compileSdk` 36,
`minSdk` 24) : à partir de l'API 35, Android **impose** l'edge-to-edge, ce qui faisait passer
l'interface sous les boutons de navigation. Deux garde-fous complémentaires existent :
`android:windowOptOutEdgeToEdgeEnforcement` dans `styles.xml`, et un listener d'insets natif dans
`MainActivity.java`.

## Service worker

`src/service-worker.ts` est volontairement **minimaliste** : il ne met en cache que la coquille
de l'app (assets de build + contenu de `static/`), en *cache-first* avec rafraîchissement en
arrière-plan. Il **n'intercepte rien d'autre** : ni les pages, ni `/api/*`, ni les flux audio, ni
les pochettes.

Objectif : résister à un réseau capricieux **sans jamais** servir du contenu authentifié périmé ni
casser la lecture. Conséquence : **il n'y a pas de mode hors-ligne sur le web** — la vraie lecture
hors-ligne est la fonction de téléchargement, réservée à l'APK.

## Variables d'environnement

| Variable | Lue par | Défaut | Rôle |
| --- | --- | --- | --- |
| `ORIGIN` | runtime `adapter-node` | `http://localhost:8080` dans les compose | **Obligatoire derrière un reverse proxy** : sans elle, le `POST` de connexion est rejeté (protection CSRF). C'est l'erreur de déploiement n°1 |
| `DATA_DIR` | `src/lib/server/users.ts` | `.data` (image Docker : `/data`) | Dossier de `users.json` (comptes, profils, secret de session) |
| `AUTH_SECRET` | `src/lib/server/users.ts` | généré aléatoirement et persisté dans `users.json` | Clé HMAC des cookies de session. La changer déconnecte tout le monde |
| `SETUP_TOKEN` | `src/routes/setup/+page.server.ts` | vide → `/setup` ouvert au premier visiteur | Jeton exigé pour créer le compte admin |
| `DEMO_MODE` | `src/routes/+layout.server.ts` | `0` | À `1`, l'application **propose** son catalogue de démonstration (bandeau d'invitation). Pour une instance vitrine, où le visiteur n'a aucun serveur à connecter. N'impose rien : une connexion Jellyfin existante n'est jamais remplacée |
| `PORT` | runtime `adapter-node` | `3000` dans l'image | Port d'écoute |

Uniquement au build : `BUILD_TARGET=mobile`, `SOURCE_COMMIT`, `SOURCE_DATE`.

## Limites d'exploitation

Tentacle suppose **un seul processus** — ne le passe pas en plusieurs répliques :

- la limitation de débit de connexion est en mémoire ;
- le secret de session est mémoïsé pour la durée du processus ;
- `users.json` est écrit en lecture-modification-écriture **sans verrou inter-processus** (le
  `rename` est atomique, mais deux processus concurrents peuvent se perdre une écriture).

## Tests

`npm test` (Vitest, environnement Node) — **15 fichiers, 80 cas**. Ils couvrent uniquement des
**fonctions pures**, par choix : `vitest.config.ts` n'inclut pas le plugin SvelteKit, donc `$lib`,
`$app` et `$env` ne sont pas résolus et les composants/routes ne sont pas testables ici.

Sont couverts : hachage de mot de passe, jetons de session, limitation de débit, calcul des
occurrences du réveil, analyse des flux RSS, chapitres, OPML, playlists JSPF ListenBrainz, paroles
LRC, formatage, concurrence bornée, adaptateurs de pistes (podcast/radio), sélection d'album
MusicBrainz, popularité ListenBrainz.

## Accessibilité

Les cinq groupes d'onglets (espaces, catégories de la bibliothèque, sections podcasts et radios,
périodes des statistiques) suivent le motif ARIA *tablist* : `role="tab"` + `aria-selected`, un seul
onglet tabulable à la fois, et navigation aux **flèches / Début / Fin** via l'action partagée
`src/lib/actions/tablist.ts`.

Le confort tactile est traité par média-requête plutôt qu'en grossissant l'interface partout : sous
`@media (hover: none) and (pointer: coarse)`, les cibles d'action passent à 44 px, tandis que
l'aspect compact est conservé tel quel à la souris.

`npm run check` (`svelte-check`) doit rester à **0 erreur / 0 avertissement** — Svelte 5 traite
notamment les sélecteurs CSS inutilisés comme des erreurs.

Il n'y a **pas** de tests bout-en-bout ni de tests de navigateur : c'est le rôle du
[Plan de test](Plan-de-test) manuel.
