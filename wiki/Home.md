# Tentacle

**Tentacle** est un lecteur audio multi-sources, à l'esthétique pixel-art, qui réunit dans une
seule interface :

- 🎵 **Bibliothèque** — ta musique [Jellyfin](https://jellyfin.org/) (albums, artistes, favoris,
  mixes), tes **playlists [ListenBrainz](https://listenbrainz.org/)** et tes **fichiers locaux**
- 📻 **Radios** — stations en direct via [Radio Browser](https://www.radio-browser.info/)
- 🎙️ **Podcasts** — au choix : **[PinePods](https://www.pinepods.online/)** (serveur, synchronisé
  entre appareils) ou **Intégrés** (flux RSS gérés dans l'app, sans aucun serveur)
- ⌂ **Accueil** — reprise de lecture, favoris, nouveautés et découvertes, toutes sources confondues
- ⚙️ **Configuration** — connexions aux sources et préférences

Le tout partage un **bus audio commun** : la lecture continue quel que soit l'écran affiché.

Au-delà de la lecture : paroles synchronisées, chapitres de podcasts, égaliseur, fondu enchaîné,
normalisation du volume, minuteur de sommeil, scrobbling ListenBrainz et Last.fm, palette de
commandes `Ctrl+K` — et, dans l'application Android, **téléchargements hors-ligne** et
**réveil programmé**. Le tour complet est dans le [Guide d'utilisation](Guide-utilisation).

## Architecture en bref

Tentacle est une app **SvelteKit** (Svelte 5, mode *runes*) rendue côté client, servie par un
**serveur Node volontairement minimal** (`adapter-node`). Ce serveur n'a que trois rôles :

1. l'**authentification** (comptes, sessions) — voir [Installation Docker](Installation-Docker#authentification-comptes-utilisateurs) ;
2. quelques **relais** vers les API qui refusent les appels directs du navigateur (Lidarr, flux
   RSS de podcasts, Last.fm, Deezer) ;
3. le **profil utilisateur**, pour que ta configuration te suive d'un appareil à l'autre.

Tout le reste part **directement du navigateur** : Jellyfin, PinePods, Radio Browser, ListenBrainz,
les paroles, la recherche de podcasts.

> ⚠️ **Conséquence CORS** — comme ces requêtes partent du navigateur, tes serveurs Jellyfin /
> PinePods doivent autoriser l'origine sur laquelle Tentacle est servi (en-têtes CORS), sinon les
> connexions échoueront. Voir [Configuration](Configuration).

L'app existe en **deux formes** — site web auto-hébergé et application Android — qui n'ont pas
exactement les mêmes fonctions (le mobile n'a pas de serveur, mais a accès au natif). La
[matrice web / mobile](Architecture#matrice-web--mobile) dit précisément quoi va où.

## Installer / déployer

- 🐳 **[Installation via Docker](Installation-Docker)** — la méthode recommandée pour
  l'auto-hébergement
- 📱 **[Application mobile (APK)](Application-Mobile-APK)** — empaqueter Tentacle en app Android via
  Capacitor
- 🛠️ **[Développement local](Developpement)** — lancer l'app en mode dev ou builder à la main

## Utiliser l'application

- 📖 **[Guide d'utilisation](Guide-utilisation)** — toutes les fonctions, écran par écran
- ⚙️ **[Configuration des sources](Configuration)** — connecter Jellyfin, les podcasts, le
  scrobbling, et régler les préférences

## Comprendre / contribuer

- 🏛️ **[Architecture](Architecture)** — ce qui tourne où, frontière de synchronisation, variables
  d'environnement, limites d'exploitation
- 🧪 **[Plan de test](Plan-de-test)** — la campagne de validation manuelle
- 🏗️ **[CI — Runner Gitea Actions](CI-Runner-Gitea-Actions)** — build et publication de l'image Docker

---

## Licence et dons

**Logiciel libre sous AGPL-3.0-or-later, et gratuit.** L'AGPL ajoute à la GPL la seule contrainte
qui compte pour une application servie sur le réseau : si tu en héberges une version modifiée pour
d'autres, tu dois proposer ton code source à ses utilisateurs. Un usage privé n'oblige à rien.

Les dons sont **bienvenus, jamais demandés** — rien n'est bridé, rien n'expire, aucune fonction
n'attend un paiement : [ko-fi.com/talva](https://ko-fi.com/talva).

Le lecteur ne distribue aucun contenu : la musique, les podcasts et les radios que tu écoutes ne
relèvent pas de cette licence.

---

*Dépôt : [`fuzzinvaders/Tentacle`](https://github.com/fuzzinvaders/Tentacle)*
