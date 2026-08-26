# Configuration des sources

Toute la configuration se fait dans l'espace **⚙️ Configuration**, accessible par la **roue crantée
de l'en-tête**.

## Où est stockée la configuration ?

- **Version web** : les **connexions aux sources**, les **préférences** et les **radios** sont
  sauvegardées côté serveur, par utilisateur (profil). Elles te suivent donc d'un navigateur ou
  d'un appareil à l'autre : connecte-toi et tu retrouves ta config. Le `localStorage` sert de cache
  local, synchronisé automatiquement.
- **Version mobile (APK)** : pas de serveur → tout reste dans le stockage local de l'application.

> ⚠️ **Certaines données ne suivent pas le compte**, même sur le web : les **abonnements aux
> podcasts « Intégrés »** (et leur progression), les **vitesses et sauts mémorisés par podcast**, le
> **réveil** et les **téléchargements hors-ligne** sont **locaux à l'appareil**. Pour les
> transférer, utilise l'**export/import de réglages** (voir [Sauvegarde](#sauvegarde-des-réglages)).
> Le détail exhaustif est dans
> [Architecture](Architecture#frontière-de-synchronisation--ce-qui-suit-le-compte-et-ce-qui-ne-le-suit-pas).

> 🔒 Le profil contient les tokens/clés API des sources, **en clair**, dans le fichier des comptes
> (`DATA_DIR/users.json`) ; il n'est servi qu'à son propriétaire authentifié. Sur un navigateur
> **partagé**, la config locale est purgée à la déconnexion pour ne pas fuiter vers le compte
> suivant.

---

## Jellyfin (Bibliothèque)

Deux méthodes de connexion, dans l'ordre de priorité :

1. **Token d'accès + ID utilisateur** *(prioritaire si renseigné)*
   - **URL du serveur** — ex. `https://jellyfin.exemple.fr`
   - **Token d'accès** — une clé API Jellyfin (Tableau de bord → *API Keys*)
   - **ID utilisateur** — l'identifiant de l'utilisateur Jellyfin (obligatoire avec un token)
2. **Identifiant + mot de passe**
   - Authentification classique par nom d'utilisateur / mot de passe Jellyfin.

## Fichiers locaux

Aucune connexion : **Choisir des fichiers** ou **Choisir un dossier** depuis l'appareil. Formats
acceptés : mp3, flac, ogg/oga, m4a, m4b, aac, wav, opus, wma, aif(f), alac.

Rien n'est envoyé nulle part — les fichiers sont lus sur place. En contrepartie, la sélection
**ne survit pas au rechargement de la page** (les URL temporaires du navigateur expirent) : il faut
resélectionner les fichiers à chaque session.

## Podcasts — deux sources au choix

Dans **Préférences Podcasts → Source des podcasts** :

> Quelle que soit la source, tu peux t'abonner **par recherche** ou **en collant l'URL d'un flux
> RSS** (onglet *Ajouter* de l'espace Podcasts).

### PinePods (serveur)

Abonnements et progression centralisés sur ton serveur, donc **synchronisés entre tous tes
appareils**. Deux méthodes, dans l'ordre de priorité :

1. **Token d'accès (API Key)** *(prioritaire)*
   - **URL du serveur** — ex. `https://pinepods.exemple.fr`
   - **Token d'accès** — une clé API PinePods (*Paramètres → Clés API*)
   - **ID utilisateur** — optionnel, déduit automatiquement du token s'il est laissé vide
2. **Identifiant + mot de passe**
   - ⚠️ Si le compte a la **double authentification (2FA)** activée, ce formulaire ne la gère pas
     encore : génère une **clé API** depuis PinePods et connecte-toi avec le token à la place.

### Intégrés (flux RSS, sans serveur)

Rien à connecter : les abonnements sont gérés directement dans l'app. Tu peux **chercher un podcast
par son nom** (annuaire iTunes), **coller l'URL d'un flux RSS**, ou **importer un fichier OPML**.
C'est l'option pour qui n'a pas de serveur PinePods.

Limite à connaître : les abonnements et la progression restent **locaux à l'appareil** (pas de
synchronisation multi-appareils). En revanche cette source apporte les **chapitres** de podcasts,
que PinePods n'expose pas.

Les deux sources **coexistent** : basculer de l'une à l'autre ne fait rien perdre.

## Radios (Radio Browser)

Aucune connexion requise : les stations proviennent de l'API publique
[Radio Browser](https://www.radio-browser.info/). Tu peux chercher, ajouter des stations, ou saisir
manuellement l'URL d'un flux.

## ListenBrainz (playlists, statistiques, scrobbling)

- **Token d'accès** — ton token personnel, sur [listenbrainz.org/profile](https://listenbrainz.org/profile).

Une fois connecté :

- l'onglet **Playlists** de la Bibliothèque affiche tes playlists et les mixes générés pour toi
  (Weekly Jams, Daily Jams…). Chaque morceau est recherché dans ta bibliothèque **Jellyfin** : les
  morceaux trouvés sont jouables, les absents sont grisés ;
- l'onglet **📊 Écoutes** affiche tes artistes et titres les plus écoutés (semaine / mois / année /
  tout) ;
- tes écoutes sont **scrobblées** automatiquement.

## Last.fm (scrobbling) — optionnel, **web uniquement**

Fait doublon avec ListenBrainz sur le principe. À connecter surtout si tu as déjà un historique
Last.fm ou si tu utilises son écosystème (widgets, apps tierces, stats).

1. Crée une clé API sur **[last.fm/api/account/create](https://www.last.fm/api/account/create)**
   (gratuit) — tu obtiens une **clé API** et un **secret partagé**.
2. Colle les deux dans Tentacle, puis **Connecter** : une fenêtre Last.fm s'ouvre pour autoriser
   l'accès.
3. Autorise, reviens dans Tentacle et clique **« J'ai autorisé → Confirmer »**.

Les deux scrobblings sont **indépendants et cumulables**. Un titre est compté à la moitié de sa
durée (ou 4 minutes, le plus court) s'il dépasse 30 secondes ; les radios ne sont jamais scrobblées.

> Ne fonctionne **pas dans l'APK** : chaque requête Last.fm doit être signée avec le secret partagé,
> ce que seul le serveur Tentacle fait.

## Lidarr (albums manquants) — optionnel, **web uniquement**

- **URL du serveur** — ex. `https://lidarr.exemple.fr`
- **Clé API** — dans Lidarr : *Paramètres → Général → Clé API*

Quand Lidarr est connecté, les morceaux **manquants** d'une playlist ListenBrainz gagnent un bouton
**« ⤓ Lidarr »** (et un bouton global **« Compléter via Lidarr »**) : Tentacle identifie l'album du
morceau via MusicBrainz, l'ajoute à Lidarr (artiste créé au besoin, avec le premier dossier racine
et les premiers profils configurés dans Lidarr) et déclenche la recherche. Le téléchargement dépend
ensuite de tes indexers/clients ; après import et rescan Jellyfin, le morceau deviendra jouable à la
prochaine ouverture de la playlist.

À savoir :

- **~1 seconde par morceau** pour l'identification (limite imposée par l'API MusicBrainz) — le
  bouton global traite les morceaux séquentiellement.
- **Le choix de l'album est heuristique** (album studio officiel le plus ancien de préférence) —
  pour un morceau très compilé, l'album demandé peut différer de celui attendu.
- Les requêtes vers Lidarr passent par le **serveur Tentacle** (relais authentifié), car l'API
  Lidarr n'autorise pas les appels directs du navigateur (pas de CORS). Conséquence : cette fonction
  **ne marche pas dans l'app mobile APK**.

---

## Préférences

### Thème

Trois choix : **Terminus** *(par défaut)*, **Tentacle** (violet/or d'origine), **Nocturne** (néons
façon Dracula, coins arrondis et ombres douces).

### Général

| Réglage | Défaut | Effet |
| --- | --- | --- |
| **Espace ouvert au lancement** | Accueil | Accueil, Bibliothèque, Radios ou Podcasts. Évite un clic à chaque ouverture si tu vas toujours au même endroit ; prend effet au prochain lancement |

### Préférences Lecture

| Réglage | Défaut | Effet |
| --- | --- | --- |
| **Qualité de streaming** (Jellyfin) | Maximale | Plafond de débit : Maximale (jusqu'à 320 kbps) / Élevée (256) / Moyenne (192) / Économique (128). S'applique aux titres lancés ensuite |
| **Fondu du son** | activé | Léger fondu à la lecture et à la pause |
| **Lecture sans fin** | désactivé | Quand la file Jellyfin se vide, enchaîne un mix de titres similaires |
| **Normalisation du volume** | désactivé | Égalise le niveau entre albums (Jellyfin / fichiers locaux) |
| **Fondu enchaîné entre titres** | désactivé | 2 à 10 s. *Expérimental* — musique Jellyfin/locale, lecture séquentielle, **incompatible avec l'égaliseur et la normalisation** |
| **Égaliseur** 5 bandes | désactivé | 60 / 230 / 910 / 3,6k / 14k Hz, ±12 dB, 8 préréglages. *Expérimental* — Jellyfin/local uniquement, effectif au titre suivant |

### Préférences Podcasts

| Réglage | Défaut | Effet |
| --- | --- | --- |
| **Source des podcasts** | PinePods | PinePods (serveur) ou Intégrés (RSS) — voir plus haut |
| **Masquer les épisodes déjà lus** | désactivé | Filtre les épisodes terminés dans toutes les listes |
| **Trier les épisodes par date** | plus récents d'abord | Ordre d'affichage |
| **Onglet Podcasts par défaut** | En cours | Onglet ouvert en arrivant dans l'espace Podcasts |
| **Enchaînement automatique** | activé | Les épisodes de la file « À suivre » s'enchaînent |
| **Abonnements (OPML)** | — | Import/export — visible seulement si la source est **PinePods** et qu'il est connecté (pour la source Intégrés, l'OPML est dans l'onglet *Ajouter*) |

Deux réglages supplémentaires se font **par podcast**, dans l'espace Podcasts et non ici : la
**vitesse de lecture** et le **saut d'intro/outro**. Voir le
[Guide d'utilisation](Guide-utilisation#réglages-par-podcast).

### Réveil — **APK uniquement**

Activer, heure, jours, et source (dernière lecture ou une station radio). Sur le web, la section
affiche seulement un message expliquant que la fonction est réservée à l'application Android.
⚠️ Il faut **appuyer sur la notification** pour démarrer la lecture — voir
[Guide d'utilisation](Guide-utilisation#réveil).

### Sauvegarde des réglages

**⬇ Exporter** produit un fichier `tentacle-reglages.json` contenant :

- les **préférences** ;
- les **radios** enregistrées ;
- les **vitesses** et **sauts intro/outro** mémorisés par podcast ;
- les **abonnements aux podcasts « Intégrés »**, avec progression et file.

**Aucun mot de passe ni jeton de source n'y figure** — c'est volontaire, le fichier peut donc être
transféré sans risque. C'est le moyen de déplacer les données « locales à l'appareil » d'un
téléphone ou navigateur à l'autre.

**⬆ Restaurer** remplace tout ce qui précède. Un fichier qui n'est pas une sauvegarde Tentacle est
refusé.

### Comptes — **web uniquement**

- **Mon compte** — changer son mot de passe (mot de passe actuel requis).
- **Utilisateurs** *(administrateur)* — créer des comptes, réinitialiser un mot de passe, supprimer
  un compte. Chaque compte a **sa propre configuration**. Tu ne peux pas supprimer ton propre compte.

---

## CORS & mixed content — à lire si une connexion échoue

Les requêtes vers Jellyfin, PinePods, Radio Browser et ListenBrainz partent **du navigateur de
l'utilisateur**, pas du serveur Tentacle. Deux conséquences fréquentes :

- **CORS** — le serveur source doit autoriser l'origine de Tentacle
  (`Access-Control-Allow-Origin`). Sinon la requête est bloquée par le navigateur.
- **Mixed content** — si Tentacle est servi en HTTPS, les serveurs sources doivent aussi être en
  HTTPS, sinon le navigateur bloque les appels.

En cas d'échec de connexion malgré des identifiants corrects, ouvre la **console développeur** du
navigateur (F12) : l'erreur exacte (CORS, mixed content, réseau) y sera affichée.

> 💡 Dans l'**APK**, ce problème disparaît pour les flux de podcasts (requête native, hors CORS),
> mais reste entier pour Jellyfin et PinePods.
