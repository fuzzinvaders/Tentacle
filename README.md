# 🐙 Tentacle

**Lecteur audio multi-sources à l'esthétique pixel-art.** Une seule interface, un seul lecteur,
pour ta bibliothèque musicale, tes podcasts, tes radios et tes fichiers locaux.

Auto-hébergeable via Docker, ou installable en application Android.

**▶️ Démonstration en ligne : <https://tentacle.fuzzonaut.space>** — un petit catalogue d'exemple,
jouable, pour faire le tour de l'interface sans rien installer ni connecter.

## Sources réunies

| Source | Ce qu'elle apporte |
| --- | --- |
| **[Jellyfin](https://jellyfin.org/)** | Bibliothèque musicale : albums, artistes, favoris, mixes |
| **Podcasts** | Deux modes : **[PinePods](https://www.pinepods.online/)** (serveur, synchro multi-appareils) ou **Intégrés** (flux RSS gérés dans l'app, sans serveur) |
| **[Radio Browser](https://www.radio-browser.info/)** | Des milliers de radios en direct |
| **Fichiers locaux** | Lecture de fichiers depuis l'appareil |
| **[ListenBrainz](https://listenbrainz.org/)** | Playlists de recommandation + scrobbling |
| **[Last.fm](https://www.last.fm/)** | Scrobbling *(web uniquement)* |
| **[Lidarr](https://lidarr.audio/)** | Récupérer les albums manquants d'une playlist *(web uniquement)* |

Toutes les sources partagent un **bus audio commun** : la lecture continue quel que soit l'écran
affiché.

## Quelques fonctions

- Lecteur « walkman » pixel-art, mini-lecteur repliable, écran plein écran teinté par la pochette
- **Paroles synchronisées** (LRCLIB) et **chapitres** de podcasts (Podcasting 2.0)
- Égaliseur 5 bandes, fondu enchaîné, normalisation du volume, vitesse de lecture
- Vitesse et **saut d'intro/outro mémorisés par podcast**
- **Téléchargements hors-ligne** et **réveil programmé** *(application Android)*
- Minuteur de sommeil, file d'attente réordonnable, palette de commandes `Ctrl+K`
- Trois thèmes, contrôles média système / écran verrouillé

## Démarrage rapide (Docker)

```sh
docker compose -f docker-compose.deploy.yml up -d
```

Puis ouvre `http://localhost:8080` et crée ton compte administrateur.

> ⚠️ Derrière un reverse proxy, la variable **`ORIGIN`** est obligatoire (sinon la connexion
> échoue) — voir [Installation Docker](https://github.com/fuzzinvaders/Tentacle/wiki/Installation-Docker).

## Documentation

Tout est dans le [**wiki**](https://github.com/fuzzinvaders/Tentacle/wiki) :

- 📖 [Guide d'utilisation](https://github.com/fuzzinvaders/Tentacle/wiki/Guide-utilisation) — toutes les fonctions, écran par écran
- ⚙️ [Configuration des sources](https://github.com/fuzzinvaders/Tentacle/wiki/Configuration) — connecter Jellyfin, podcasts, scrobbling…
- 🐳 [Installation Docker](https://github.com/fuzzinvaders/Tentacle/wiki/Installation-Docker)
- 📱 [Application mobile (APK)](https://github.com/fuzzinvaders/Tentacle/wiki/Application-Mobile-APK)
- 🏛️ [Architecture](https://github.com/fuzzinvaders/Tentacle/wiki/Architecture) — ce qui tourne où, web vs mobile
- 🛠️ [Développement local](https://github.com/fuzzinvaders/Tentacle/wiki/Developpement)
- 🧪 [Plan de test](https://github.com/fuzzinvaders/Tentacle/wiki/Plan-de-test)

## Développement

```sh
npm install
npm run dev        # serveur de dev (HMR)
npm run check      # vérification TypeScript / Svelte — doit rester à 0 erreur
npm test           # tests unitaires (Vitest)
```

Stack : SvelteKit 2 + Svelte 5 (*runes*), Vite 8, TypeScript, `adapter-node` pour le web et
`adapter-static` + Capacitor pour l'Android.

## Licence et dons

**Logiciel libre sous [AGPL-3.0-or-later](LICENSE), et gratuit.** Tu peux l'utiliser, l'étudier, le
modifier et le redistribuer. L'AGPL ajoute une seule contrainte à la GPL, et c'est celle qui compte
pour une application servie sur le réseau : **si tu en héberges une version modifiée pour d'autres,
tu dois proposer ton code source à ses utilisateurs.** Un usage privé, lui, n'oblige à rien.

C'est le choix adapté à un outil auto-hébergeable : il garantit que les améliorations restent
partageables, y compris quand l'application est servie plutôt que distribuée.

Les dons sont **bienvenus, jamais demandés** — rien n'est bridé, rien n'expire, aucune fonction
n'attend un paiement : <https://ko-fi.com/talva>.

Le bouton flottant vient d'un script servi par Ko-fi. Il n'est chargé **qu'une fois la session
ouverte**, pour qu'un script tiers ne partage jamais sa page avec le champ de mot de passe, et il
est **absent de l'application Android** (un script distant contredirait son fonctionnement
hors-ligne, et un lien de paiement externe dans une app relève des règles de Google Play). Pour
retirer le soutien entièrement, vide la constante `KOFI` dans
[`src/lib/support.ts`](src/lib/support.ts) : le lien du pied de page, lui, ne dépend d'aucun tiers.

La musique, les podcasts et les radios que tu écoutes ne relèvent évidemment pas de cette licence :
Tentacle est un lecteur, il ne distribue aucun contenu.
