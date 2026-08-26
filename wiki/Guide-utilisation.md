# Guide d'utilisation

Tout ce que fait Tentacle, écran par écran. Pour **connecter** tes sources, va d'abord sur
[Configuration des sources](Configuration).

> 📱 Les fonctions marquées **APK** n'existent que dans l'application Android ;
> celles marquées **Web** seulement dans la version navigateur. Le détail du pourquoi est dans
> [Architecture](Architecture#matrice-web--mobile).

## Vue d'ensemble

Quatre onglets en haut : **⌂ Accueil**, **▤ Bibliothèque**, **⌁ Radios**, **⊙ Podcasts**.
La **Configuration** s'ouvre par la **roue crantée ⚙ de l'en-tête** (ce n'est pas un onglet).

Toutes les sources partagent **un seul lecteur et une seule file d'attente** : tu peux lancer un
album, changer d'onglet, chercher une radio — la lecture continue. Le lecteur reste visible en bas
en permanence.

L'en-tête affiche aussi, sur la **version web connectée** : ton identifiant (avec ★ si tu es
administrateur), un bouton **Déconnexion**, et un badge **⚠ Non synchronisé** si la sauvegarde de
ta configuration vers le serveur a échoué.

---

## ⌂ Accueil

Un tableau de bord qui agrège toutes tes sources. Chaque section disparaît si elle est vide.

- **Reprendre** — reprend la lecture en cours (pochette, titre, ▶/⏸).
- **Découvrir** — **∞ Mix surprise** (une sélection de titres similaires générée par Jellyfin à
  partir de ton album le plus récent), **🔀 Lecture aléatoire** (100 titres au hasard dans toute la
  bibliothèque), et **⌁ Radio au hasard** si tu as des stations enregistrées.
- **Reprendre les podcasts** — jusqu'à 8 épisodes commencés et non terminés, quelle que soit ta
  source de podcasts.
- **♥ Favoris** — jusqu'à 12 titres favoris ; un clic lance le titre.
- **Récemment ajoutés** — jusqu'à 12 albums ; un clic lance l'album entier.

Chaque section a un lien **Voir tout** vers l'espace correspondant.

---

## ▤ Bibliothèque

Nécessite **Jellyfin** (sauf *Playlists* / *Écoutes*, qui dépendent de ListenBrainz, et
*Téléchargés*, qui est local).

La rangée de catégories montre les destinations quotidiennes — **Suggestions**, **Artistes**,
**Albums**, **♥ Favoris**, et **⭳ Téléchargés** sur l'APK. Le bouton **⋯** au bout donne accès aux
deux destinations occasionnelles, **Playlists** et **📊 Écoutes** ; quand tu t'y trouves, il affiche
leur nom au lieu des points de suspension, pour que l'endroit où tu es reste lisible.

### Suggestions

L'onglet par défaut. Une rangée d'accès rapides (**Reprendre**, **∞ Mix surprise**,
**🔀 Lecture aléatoire**) puis trois sections d'albums : **Récemment ajoutés**, **Lus récemment**,
**Fréquemment lus**.

### Artistes

Grille d'artistes. Dès que tu tapes une recherche, elle porte sur **toute la collection Jellyfin**
(pas seulement la page affichée).

En ouvrant un artiste :

- **▶ Tout lire** — tous ses titres.
- **★ Titres populaires** — ses titres les plus connus **au niveau mondial** (via Deezer puis
  ListenBrainz), rapprochés de ta bibliothèque. Si aucune correspondance n'est trouvée, repli sur
  tes titres les plus écoutés de cet artiste. *(La partie mondiale est **Web** uniquement ; sur
  l'APK le repli local s'applique directement.)*
- **∞ Mix** — mix sans fin autour de cet artiste.
- Puis ses albums, et une section **Artistes similaires**.

### Albums

Grille d'albums avec une barre de filtres :

- **Trier** — Nom, Année, ou Ajout récent.
- **Genre** — si tes albums sont tagués.
- **Téléchargés** — **APK** : ne montrer que les albums ayant au moins un titre hors-ligne.

Là aussi, une recherche interroge **tout le serveur Jellyfin**. Un badge **⭳** signale les albums
partiellement ou totalement téléchargés.

Les albums (et les artistes) se chargent **par tranches de 100**. Sous la grille, un compteur
indique toujours **« chargés sur total »**, avec un bouton **Afficher plus** tant qu'il en reste :
rien n'est masqué en silence, même sur une très grosse collection.

### ♥ Favoris

Tes titres favoris Jellyfin, avec **▶ Tout lire** et un ♥ par ligne pour retirer le favori.

### ⭳ Téléchargés — **APK**

Tes albums disponibles hors-ligne, avec le total d'espace occupé. Un album s'ouvre **sans réseau**
(la liste des titres est mémorisée) ; les titres non téléchargés apparaissent grisés et portent
l'étiquette **hors-ligne : non**. Voir [Hors-ligne](#hors-ligne).

### Playlists

Tes playlists **ListenBrainz** : *Créées pour vous* (Weekly Jams, Daily Jams…) et *Mes playlists*.

Chaque morceau est recherché dans ta bibliothèque Jellyfin : les morceaux trouvés sont jouables,
les absents sont grisés et marqués « indispo. ». La ligne « N / M morceaux disponibles » résume la
couverture.

Si **Lidarr** est connecté (**Web**), chaque morceau manquant gagne un bouton **⤓ Lidarr**, avec un
bouton global **⤓ Compléter via Lidarr (N)** : Tentacle identifie l'album via MusicBrainz et le
demande à Lidarr. Compte environ **1 seconde par morceau** (limite de l'API MusicBrainz) et sache
que le choix de l'album reste heuristique.

### 📊 Écoutes

Tes statistiques ListenBrainz : **artistes** et **titres les plus écoutés**, sur
**Semaine / Mois / Année / Tout**.

### Vue d'un album

En-tête avec pochette, artiste, année, nombre de titres et durée totale. Puis :

- **▶ Lire l'album** — remplace la file.
- **∞** Mix sans fin · **⏭** Lire ensuite (insère l'album après le titre courant) ·
  **＋** Ajouter à la file · **♡/♥** Favori · **⭳** Télécharger l'album (**APK**, avec progression
  `n/total`).

Chaque ligne de titre a son propre **⏭ Lire ensuite** et son **♡ Favori**.

### Menus contextuels

**Clic droit** (ordinateur) ou **appui long** (tactile, ~0,5 s) ouvre un menu sur :

- une **carte d'album** — Lire · Lire ensuite · Ajouter à la file · Mix sans fin · Favori ;
- une **carte d'artiste** — Tout lire · Mix sans fin · Favori ;
- un **titre** — Lire · Lire ensuite · Ajouter à la file · **Ajouter à une playlist…** · Favori ·
  **Télécharger / Supprimer le téléchargement** (**APK**).

**Ajouter à une playlist…** propose **Nouvelle playlist…** (création d'une playlist Jellyfin) ou
une playlist existante.

---

## ⌁ Radios

Aucune connexion nécessaire. Trois onglets :

- **Mes radios** — tes stations enregistrées (▶/⏸ et ✕ pour retirer). Recliquer la station en cours
  met en pause au lieu de relancer le flux.
- **Recherche** — l'annuaire communautaire [Radio Browser](https://www.radio-browser.info/)
  (pays, tags, codec/débit), avec **▶** pour écouter et **+ Ajouter** pour enregistrer.
- **Ajouter un flux** — saisie manuelle : nom + URL du flux (+ icône optionnelle).

Pendant une radio, le lecteur affiche **● DIRECT** au lieu d'une barre de progression.

---

## ⊙ Podcasts

### Deux sources, au choix

Dans Configuration → *Préférences Podcasts* → **Source des podcasts** :

| Source | Ce que ça donne |
| --- | --- |
| **PinePods (serveur)** | Abonnements et progression **centralisés sur ton serveur** → synchronisés entre tous tes appareils |
| **Intégrés (flux RSS)** | Aucun serveur nécessaire : tout est géré dans l'app. En contrepartie, abonnements et progression sont **locaux à l'appareil** |

Les deux coexistent : basculer d'une source à l'autre ne fait rien perdre.

### Onglets

- **En cours** *(par défaut)* — tous les épisodes commencés et non terminés, tous abonnements
  confondus.
- **Abonnements** — grille de tes podcasts. En ouvrir un affiche ses épisodes (et ses réglages de
  saut, voir plus bas).
- **Récents** — les épisodes les plus récemment publiés.
- **À suivre** — ta file d'épisodes, avec **▶ Lire la file**. Si *Enchaînement automatique* est
  activé (par défaut), ces épisodes s'enchaînent tout seuls.
- **Ajouter** — recherche par nom et ajout par URL de flux, voir ci-dessous.

### S'abonner

- **Par recherche** — tape un nom : en source Intégrés c'est l'annuaire **iTunes/Apple Podcasts**
  qui répond, en source PinePods c'est ton serveur. Résultats avec pochette et auteur, bouton
  **S'abonner**.
- **Par URL de flux** — bloc « Ou directement par URL de flux », disponible avec **les deux
  sources**. Indispensable pour un podcast absent de l'annuaire de recherche, alors que son flux
  est parfaitement valide. En source Intégrés le flux est analysé dans l'app ; en source PinePods
  il est envoyé à ton serveur, qui l'analyse lui-même.
- **OPML** — import/export de tes abonnements. Pour les podcasts **Intégrés**, c'est dans le même
  bloc ; pour **PinePods**, c'est dans Configuration → *Préférences Podcasts*.

### Un épisode

Pochette, titre repliable (le chevron révèle la description), date · durée, et une étiquette
**Lu** ou **En cours** avec barre de progression. Boutons : **Lire**,
**Ajouter / Retirer de la file**, **Marquer comme lu / non lu**.

La reprise est automatique : un épisode commencé repart où tu t'étais arrêté ; un épisode
**marqué lu repart du début**. Un épisode est considéré lu à partir de **97 %** de sa durée.

### Réglages par podcast

Ces deux réglages s'appliquent à **tous les épisodes** du podcast concerné, présents et futurs :

- **Vitesse de lecture** — change la vitesse pendant un épisode (pastille `1×` de l'écran plein
  écran) et elle est mémorisée **pour ce podcast**. Ta vitesse pour la musique reste séparée.
- **⏱ Sauts (intro / outro)** — dans Abonnements, en ouvrant un podcast. **Intro** = démarrer à
  +N secondes (générique, annonces) ; **Outro** = considérer l'épisode lu à N secondes de la fin
  (outro, publicité) et enchaîner. `0` désactive. Le saut d'intro ne s'applique qu'en **début**
  d'épisode : reprendre un épisode entamé respecte ta position.

### Badges « nouveaux épisodes » *(source Intégrés)*

Un badge numéroté apparaît sur la pochette d'un abonnement quand il a publié depuis ta dernière
visite. Ouvrir le podcast efface le badge. Les épisodes déjà présents au moment de l'abonnement ne
comptent pas comme nouveaux.

### Chapitres

Si un épisode fournit des chapitres (norme *Podcasting 2.0*), un onglet **Chapitres** apparaît dans
l'écran plein écran : liste horodatée, chapitre courant surligné, clic pour sauter.
*Réservé aux podcasts **Intégrés** — PinePods n'expose pas cette information.*

---

## Le lecteur

### La barre « walkman »

Toujours visible en bas. Au centre, une cassette dont les bobines tournent pendant la lecture :
**cliquer l'étiquette ouvre l'écran plein écran**.

- **Barre de progression** en forme de bande magnétique (glisser pour se déplacer), temps écoulé /
  total — ou `● DIRECT` pour une radio.
- **Transport** : **⇄** aléatoire · **⏮** · **▶/⏸** · **⏭** · **↻** répétition (désactivée → toute
  la file → un titre) · **☰** file d'attente, avec un **badge indiquant le nombre de titres**.
- À droite : **▾** replier, un VU-mètre, le **volume**, une LED d'alimentation.
- Un badge **☾** apparaît quand un **minuteur de sommeil** est armé (avec le temps restant) —
  cliquer dessus l'annule.
- En bas, la **version** de l'app (`v0.0.1 · commit · date`) — pratique pour vérifier une mise à jour.

### La file d'attente

Le bouton **☰** ouvre la file : **⋮⋮** pour glisser-réordonner (ou les touches **↑/↓** quand la
poignée a le focus), clic sur un titre pour y sauter, **✕** pour retirer.

- **Vider** ne coupe **pas** la lecture en cours : seuls les titres à venir sont retirés.
- **Playlist** *(si Jellyfin est connecté)* enregistre la file comme playlist Jellyfin.
- Un titre qui se termine naturellement **sort** de la file ; le bouton **⏭** manuel, lui, ne
  retire rien.

### Mini-lecteur et gestes

Replié (par défaut sur téléphone), le lecteur devient une seule ligne. Sur cette ligne :

| Geste | Effet |
| --- | --- |
| Appui simple | Ouvre l'écran plein écran |
| Glisser vers le haut | Ouvre l'écran plein écran |
| Glisser à gauche / à droite | Titre suivant / précédent |

### Écran « Lecture en cours » (plein écran)

Le fond se teinte automatiquement aux couleurs de la pochette.

En haut : **📡** lire sur un autre appareil Jellyfin du réseau · **⇉** diffuser
(Chromecast/AirPlay, **Web** seulement, selon le navigateur) · la **vitesse de lecture**
(1× → 1,25 → 1,5 → 1,75 → 2) · le **minuteur de sommeil** (15/30/45/60 min ou *Fin du titre*).

Au centre : grande pochette, visualiseur animé, contrôles et volume.

| Geste sur la pochette | Effet |
| --- | --- |
| Double-appui à gauche | −10 s |
| Double-appui à droite | +10 s |
| Glisser à gauche / droite | Titre suivant / précédent |
| Glisser vers le bas | Ferme l'écran |

À droite, trois onglets : **Paroles** (synchronisées via LRCLIB, la ligne courante défile
automatiquement), **Chapitres** (si l'épisode en fournit) et **File**.

### Contrôles système

Titre, pochette, lecture/pause, précédent/suivant et barre de progression apparaissent sur
l'**écran verrouillé** et dans les notifications. Sur l'**APK**, c'est un vrai service natif : les
touches Bluetooth et les commandes de la voiture ciblent Tentacle de façon fiable, et la lecture
continue en arrière-plan.

---

## Confort d'écoute

Réglages dans Configuration → **Préférences Lecture** :

- **Qualité de streaming** (Jellyfin) — Maximale (jusqu'à 320 kbps) / Élevée (256) / Moyenne (192) /
  Économique (128). S'applique aux titres lancés ensuite.
- **Fondu du son** à la lecture et à la pause *(activé par défaut)*.
- **Lecture sans fin** — quand la file Jellyfin se vide, enchaîne un mix de titres similaires.
- **Normalisation du volume** — égalise le niveau entre albums (Jellyfin / fichiers locaux).
- **Fondu enchaîné entre titres** — 2 à 10 secondes *(expérimental)*. Musique Jellyfin/locale
  uniquement, en lecture séquentielle. Incompatible avec l'égaliseur et la normalisation.
- **Égaliseur** 5 bandes *(expérimental)* — 60 / 230 / 910 / 3,6k / 14k Hz, ±12 dB, avec 8
  préréglages (*Plat, Grave +, Loudness, Voix / Podcast, Rock, Acoustique, Aigu +, Nuit*).
  Jellyfin / fichiers locaux uniquement ; prend effet au titre suivant.

**Robustesse** : si un flux se fige (réseau capricieux, onglet mobile réveillé), un *chien de
garde* relance la lecture au bon endroit après 8 secondes sans progression. Les erreurs réseau ou
de décodage sont réessayées jusqu'à 3 fois.

---

## Hors-ligne

**APK uniquement** (le web n'a pas accès au système de fichiers).

- **Que télécharger ?** Des titres **Jellyfin** : un titre via son menu contextuel, ou un album
  entier via le bouton **⭳** de la vue album. Les téléchargements se font toujours en **320 kbps**,
  indépendamment de ton réglage de qualité de streaming.
- **Où les retrouver ?** Catégorie **⭳ Téléchargés** de la Bibliothèque, avec l'espace disque total.
  Le filtre *Téléchargés* de l'onglet Albums et les badges **⭳** sur les pochettes aident aussi.
- **Lecture automatique depuis le disque** : dès qu'un titre est téléchargé, Tentacle le lit depuis
  l'appareil au lieu du réseau — partout dans l'app, sans rien changer à tes habitudes.
- **Supprimer** demande une confirmation, puis libère l'espace.

Les radios, podcasts et fichiers locaux ne sont pas téléchargeables par cette fonction.

---

## Réveil

**APK uniquement.** Configuration → **Réveil** : activer, choisir l'heure, les jours (aucun
sélectionné = tous les jours) et la source (*Reprendre la dernière lecture* ou une station radio).

> ⚠️ Ce n'est **pas** un démarrage automatique silencieux : une **notification** s'affiche à
> l'heure prévue et **il faut appuyer dessus** pour lancer la lecture. Android restreint trop
> l'exécution en arrière-plan pour garantir mieux de façon fiable.
>
> Pense aussi à **ouvrir l'app au moins une fois par semaine** : le réveil est programmé par
> tranches d'environ 8 jours et se réarme à chaque lancement.

---

## Raccourcis clavier

Actifs partout, sauf pendant la saisie dans un champ texte (`Ctrl+K` fonctionne quand même) :

| Raccourci | Action |
| --- | --- |
| `Ctrl+K` / `Cmd+K` | Palette de commandes |
| `Espace` | Lecture / pause |
| `←` / `→` | −10 s / +10 s |
| `Shift+←` / `Shift+→` | Titre précédent / suivant |
| `M` | Couper / rétablir le son |
| `/` | Placer le curseur dans la recherche |
| `Échap` | Fermer l'écran plein écran, la palette ou un menu |
| `↑` / `↓` | Réordonner un titre de la file (poignée sélectionnée) ; naviguer dans la palette |

### Palette de commandes (`Ctrl+K`)

Une barre unique pour tout atteindre :

- **Naviguer** vers n'importe quel espace ;
- **Piloter le lecteur** : lecture/pause, suivant/précédent, aléatoire, répétition, vider la file,
  ouvrir *Lecture en cours* ;
- **Minuteur de sommeil** : 15 / 30 / 60 min, ou l'annuler ;
- **Chercher** (à partir de 2 caractères) : tes **radios**, tes **podcasts** abonnés, et — si
  Jellyfin est connecté — des **titres, albums et artistes** de toute ta bibliothèque, jouables
  directement depuis la liste.

---

## Scrobbling (historique d'écoute)

Deux services, **cumulables** :

- **ListenBrainz** — alimente aussi les playlists de recommandation et l'onglet *Écoutes*.
- **Last.fm** — **Web** uniquement.

Dans les deux cas : un « en écoute » est envoyé au démarrage du titre, et l'écoute est comptée à
**la moitié du titre (ou 4 minutes, le plus court)** pour les titres de plus de 30 secondes. Les
radios ne sont jamais scrobblées.

---

## Sauvegarde, comptes et thèmes

- **Thème** — trois choix : **Terminus** (par défaut), **Tentacle** (violet/or d'origine),
  **Nocturne** (néons façon Dracula, formes adoucies).
- **Sauvegarde des réglages** — Configuration → *Sauvegarde des réglages* : exporte un fichier
  `tentacle-reglages.json` contenant préférences, radios, vitesses et sauts par podcast, et
  abonnements aux podcasts intégrés. **Aucun mot de passe ni jeton de source** n'y figure. C'est le
  moyen de transférer ces données d'un appareil à l'autre.
- **Mon compte** *(Web)* — changer son mot de passe.
- **Utilisateurs** *(Web, administrateur)* — créer des comptes, réinitialiser un mot de passe,
  supprimer un compte. Chaque compte a **sa propre configuration**.

Sur le web, connexions aux sources, préférences et radios **suivent ton compte** d'un navigateur à
l'autre. Certaines données restent en revanche **locales à l'appareil** — notamment les abonnements
aux podcasts intégrés, les téléchargements et le réveil. Le détail exact est dans
[Architecture](Architecture#frontière-de-synchronisation--ce-qui-suit-le-compte-et-ce-qui-ne-le-suit-pas).

---

## Si quelque chose ne marche pas

- Une source ne répond pas → c'est presque toujours **CORS** ou **mixed content** :
  voir [Configuration](Configuration#cors--mixed-content--à-lire-si-une-connexion-échoue).
- La connexion échoue derrière un reverse proxy → la variable **`ORIGIN`** est probablement
  manquante : voir [Installation Docker](Installation-Docker).
- Un doute sur la version déployée → le **pied de page du lecteur** affiche le commit et la date
  du build.
- Pour signaler un problème de façon utile, le [Plan de test](Plan-de-test#5-modèle-de-rapport-de-problème)
  propose un modèle.
