# Plan de test

Ce plan sert à **valider en conditions réelles** ce qui a été livré. Beaucoup de
fonctionnalités récentes ont été vérifiées statiquement (`npm run check` à 0 erreur,
tests unitaires au vert, compilation web + APK) mais **jamais exercées avec de vraies
données** : pas d'identifiants Jellyfin/PinePods, pas de clé Last.fm, pas de téléphone
dans l'environnement de développement. Les sections sont donc classées par **risque
décroissant** : le §1 est celui qui compte.

## Comment utiliser ce plan

- **Deux environnements** : `WEB` = version Docker dans un navigateur, `APK` = application
  Android. Chaque test indique où il s'applique ; certains ne valent que sur l'un des deux.
- Note le résultat au fil de l'eau : ✅ conforme / ❌ problème / ➖ non applicable.
- Pour un ❌, retiens **ce que tu faisais**, **ce que tu attendais**, **ce qui s'est passé**
  (voir le modèle en §5).

### Avant de commencer

1. **Vérifie la version déployée** — le pied de page affiche `v0.0.1 · <commit> · <date>`.
   Compare le commit court à celui de `main` ; s'il diffère, l'image Docker n'est pas à jour
   (`docker compose pull && docker compose up -d`).
2. **Sauvegarde tes réglages** — Configuration → *Sauvegarde des réglages* → exporter.
   Certains tests modifient des préférences ; tu pourras revenir en arrière.
3. **Note ta source podcast actuelle** (Configuration → Préférences Podcasts → *Source des
   podcasts*). Le §1.1 demande de basculer sur « Intégrés » ; pense à remettre PinePods
   ensuite si c'est ton mode habituel.

---

## 1. Priorité haute — jamais validé en conditions réelles

### 1.1 Podcasts « Intégrés » (flux RSS, sans PinePods) — `WEB` + `APK`

| # | Test | Attendu |
| --- | --- | --- |
| 1.1.1 | Configuration → Préférences Podcasts → Source = **Intégrés** | L'espace Podcasts se recharge, les abonnements PinePods disparaissent (ils ne sont pas perdus : ils reviennent en rebasculant) |
| 1.1.2 | Onglet **Ajouter** → rechercher un podcast par son nom | Résultats avec pochette + auteur |
| 1.1.3 | Cliquer **S'abonner** sur un résultat | L'abonnement apparaît dans **Abonnements** |
| 1.1.4 | Onglet **Ajouter** → coller une URL de flux RSS directement | Même résultat qu'en 1.1.3 |
| 1.1.5 | Coller une URL invalide (ex. une page HTML) | Message d'erreur clair, pas de plantage |
| 1.1.6 | Ouvrir un abonnement | Liste des épisodes : titres, dates, durées, descriptions |
| 1.1.7 | Lire un épisode | Lecture démarre, la barre de progression avance |
| 1.1.8 | Mettre en pause à ~2 min, quitter l'app, revenir, relire l'épisode | Reprise **à la position quittée** (± quelques secondes) |
| 1.1.9 | Écouter un épisode jusqu'à la fin | Marqué **Lu**, retiré de la file « À suivre » s'il y était |
| 1.1.10 | Marquer un épisode lu, puis le relancer | Redémarre **au début** (et non à 97 %) |
| 1.1.11 | Ajouter/retirer des épisodes de la file « À suivre » | Onglet *À suivre* refléte l'ordre d'ajout |
| 1.1.12 | Onglet **En cours** | N'affiche que les épisodes commencés et non terminés, tous abonnements confondus |
| 1.1.13 | Onglet **Récents** | Épisodes les plus récents, tous abonnements confondus |
| 1.1.14 | Import OPML (fichier exporté d'une autre app podcast) | Les abonnements sont créés |
| 1.1.15 | Export OPML puis réimport | Aucune perte |
| 1.1.16 | Se désabonner d'un podcast | Disparaît, et sa progression est purgée |

**Badge « nouveaux épisodes »** *(le plus difficile à vérifier — demande d'attendre une vraie
publication)*

| # | Test | Attendu |
| --- | --- | --- |
| 1.1.17 | Juste après s'être abonné, revenir sur **Abonnements** | **Aucun** badge (les épisodes préexistants ne sont pas « nouveaux ») |
| 1.1.18 | Attendre qu'un podcast suivi publie un épisode, puis rouvrir Abonnements | Badge numéroté sur sa pochette |
| 1.1.19 | Ouvrir ce podcast, revenir à Abonnements | Badge disparu |

### 1.2 Accueil et recherche unifiés — `WEB` + `APK`

| # | Test | Attendu |
| --- | --- | --- |
| 1.2.1 | En source **Intégrés**, avec un épisode en cours : aller à l'**Accueil** | Section « Reprendre les podcasts » présente avec cet épisode |
| 1.2.2 | Cliquer cet épisode depuis l'Accueil, écouter un peu, revenir aux Podcasts | La progression est bien enregistrée (l'épisode reste « En cours » avec la bonne position) |
| 1.2.3 | En source **Intégrés**, sans Jellyfin ni PinePods connectés | L'Accueil ne dit **pas** « connecte une source » puisque des podcasts existent |
| 1.2.4 | `Ctrl+K` (web) → taper le nom d'un podcast local | Il apparaît dans les résultats, avec la mention *Podcast* |
| 1.2.5 | Rebasculer sur **PinePods** et refaire 1.2.1 / 1.2.4 | Même comportement, avec les abonnements PinePods |

### 1.3 Chapitres (podcasts intégrés uniquement) — `WEB` + `APK`

> ⚠️ Ne concerne que les épisodes dont le flux RSS fournit des chapitres
> (balise Podcasting 2.0 `<podcast:chapters>`). PinePods n'expose pas cette information.
> Si aucun de tes podcasts n'en fournit, marque cette section ➖.

| # | Test | Attendu |
| --- | --- | --- |
| 1.3.1 | Lire un épisode avec chapitres → ouvrir l'écran plein écran (*Lecture en cours*) | Un onglet **Chapitres** est présent (absent sinon) |
| 1.3.2 | Consulter l'onglet | Liste des chapitres avec horodatage, celui en cours est surligné |
| 1.3.3 | Cliquer un chapitre | La lecture saute à cet endroit |
| 1.3.4 | Laisser jouer au passage d'un chapitre à l'autre | Le surlignage suit automatiquement |

### 1.4 Saut d'intro / outro par abonnement — `WEB` + `APK`

| # | Test | Attendu |
| --- | --- | --- |
| 1.4.1 | Ouvrir un abonnement → encart **⏱ Sauts** → Intro = `20`, Outro = `30` | Réglage conservé si on quitte et revient |
| 1.4.2 | Lire un épisode **depuis le début** de ce podcast | Démarre à ~20 s (pas à 0) |
| 1.4.3 | Reprendre un épisode **déjà commencé** du même podcast | Reprend à la position sauvegardée, **sans** re-sauter l'intro |
| 1.4.4 | Laisser un épisode arriver à 30 s de la fin | Considéré comme lu, enchaîne l'épisode suivant |
| 1.4.5 | Lire un épisode d'un **autre** podcast (sans réglage) | Aucun saut |
| 1.4.6 | Remettre Intro et Outro à `0` | Comportement normal restauré |

### 1.5 Scrobbling Last.fm — `WEB` uniquement

> Nécessite de créer une clé API sur **last.fm/api/account/create** (gratuit).
> Ne fonctionne **pas** dans l'APK (la signature des requêtes exige le serveur).

| # | Test | Attendu |
| --- | --- | --- |
| 1.5.1 | Configuration → **Last.fm** → coller clé API + secret → *Connecter* | Une fenêtre last.fm s'ouvre pour autoriser l'accès |
| 1.5.2 | Autoriser sur last.fm, revenir, cliquer *J'ai autorisé → Confirmer* | Section marquée **Connecté** avec ton nom d'utilisateur |
| 1.5.3 | Cliquer *Confirmer* **sans** avoir autorisé | Message d'erreur explicite, pas de connexion bâtarde |
| 1.5.4 | Lire un morceau (Jellyfin) et regarder ton profil last.fm | « En cours d'écoute » apparaît quasi immédiatement |
| 1.5.5 | Laisser passer la moitié du morceau (ou 4 min) | Le morceau est **scrobblé** dans l'historique last.fm |
| 1.5.6 | Vérifier ListenBrainz en parallèle (s'il est connecté) | Le morceau y est scrobblé **aussi** — les deux services sont indépendants |
| 1.5.7 | Écouter une **radio** | Aucun scrobble (volontaire) |
| 1.5.8 | *Déconnecter* Last.fm | Plus aucun scrobble Last.fm, ListenBrainz continue |

### 1.6 Réveil programmé — `APK` uniquement

> ⚠️ Ce n'est **pas** un démarrage automatique silencieux : une notification s'affiche à
> l'heure prévue et **il faut appuyer dessus** pour lancer la lecture. Android restreint
> trop l'exécution en arrière-plan pour garantir mieux de façon fiable.

| # | Test | Attendu |
| --- | --- | --- |
| 1.6.1 | Configuration → **Réveil** → activer | Android demande l'autorisation de notifications (Android 13+) |
| 1.6.2 | Régler l'heure à ~2 min dans le futur, laisser les jours vides | Message « Réveil programmé » |
| 1.6.3 | Verrouiller le téléphone et attendre | La notification arrive **à l'heure**, avec un écart faible |
| 1.6.4 | Appuyer sur la notification | L'app s'ouvre et la lecture démarre |
| 1.6.5 | Choisir une **station radio** comme source, refaire le test | C'est bien cette station qui démarre |
| 1.6.6 | Choisir « Reprendre la dernière lecture » avec une file existante | Reprend le titre courant |
| 1.6.7 | Sélectionner uniquement certains jours (ex. Lun–Ven) | Aucune notification le week-end |
| 1.6.8 | Désactiver le réveil | Plus aucune notification |
| 1.6.9 | Refuser l'autorisation de notifications | Message d'erreur clair (« le réveil ne sonnera pas »), pas d'échec muet |

---

## 2. Priorité moyenne — corrections récentes à confirmer

### 2.1 Interface et lecteur — `WEB` + `APK`

| # | Test | Attendu |
| --- | --- | --- |
| 2.1.1 | Ouvrir une **longue** liste (grande bibliothèque) et défiler jusqu'en bas | Le lecteur reste **visible en bas** en permanence ; l'en-tête et les onglets d'espaces restent en place |
| 2.1.2 | Défiler horizontalement sur mobile (glisser vers la gauche) | **Aucune** « page fantôme » vide à droite |
| 2.1.3 | Boutons de catégories (Suggestions, Artistes, Albums…) | Compacts, lisibles, tiennent sans occuper la moitié de l'écran |
| 2.1.4 | Ouvrir un album dont certains titres ont un artiste différent (compilation) | Les boutons ⏭ et ♡ de chaque ligne sont **alignés verticalement** |
| 2.1.5 | Lire un titre, puis **Vider la file** (lecteur ou `Ctrl+K`) | La lecture **continue** ; seuls les titres à venir sont retirés |
| 2.1.6 | Vider la file alors que rien ne joue | File vide, pas d'erreur |

### 2.2 Synchronisation PinePods — `WEB` + `APK`

| # | Test | Attendu |
| --- | --- | --- |
| 2.2.1 | Écouter un épisode PinePods jusqu'au bout | Marqué lu **et retiré de la file** côté PinePods (vérifie dans l'interface PinePods) |
| 2.2.2 | Mettre en pause, quitter l'app immédiatement, rouvrir | La position est à jour (pas de perte des ~15 dernières secondes) |
| 2.2.3 | Mettre en arrière-plan pendant la lecture, revenir | Idem, position conservée |
| 2.2.4 | Relancer un épisode marqué lu | Redémarre au début |
| 2.2.5 | Sur la durée (quelques jours d'usage) | Pas d'épisodes finis qui traînent dans la file, reprises justes |

### 2.3 Téléchargements hors-ligne — `APK` uniquement

| # | Test | Attendu |
| --- | --- | --- |
| 2.3.1 | Album → bouton de téléchargement | Progression affichée (`n/total`), puis album marqué téléchargé |
| 2.3.2 | Télécharger **un seul titre** via l'appui long / clic droit | Le titre est téléchargé |
| 2.3.3 | Catégorie **⭳ Téléchargés** de la bibliothèque | Affiche les albums téléchargés **y compris** ceux composés de titres téléchargés isolément |
| 2.3.4 | Ouvrir un album partiellement téléchargé | Les titres non téléchargés sont grisés |
| 2.3.5 | Passer en **mode avion** et lire un album téléchargé | Lecture fonctionne sans réseau |
| 2.3.6 | Vérifier l'espace disque affiché | Cohérent avec la taille réelle |
| 2.3.7 | Supprimer un téléchargement | Confirmation demandée, puis retiré (et l'espace disque baisse) |
| 2.3.8 | Badges sur les cartes d'albums | Présents sur les albums ayant au moins un titre téléchargé |
| 2.3.9 | Filtre « Téléchargés » dans Albums | Ne liste que les albums concernés |

---

## 3. Régression — cœur de l'application

À parcourir plus rapidement : ce sont des fonctions anciennes, mais le lecteur et la mise en
page ont été touchés récemment, donc une vérification s'impose.

### 3.1 Lecture par source

| # | Test | Attendu |
| --- | --- | --- |
| 3.1.1 | Lire un album Jellyfin en entier | Enchaînement automatique des titres, sans coupure |
| 3.1.2 | Lire une radio | Démarre, mention **DIRECT**, pas de barre de progression active |
| 3.1.3 | Lire un podcast (PinePods **et** Intégrés) | OK dans les deux modes |
| 3.1.4 | Lire un fichier local (source *Fichiers locaux*) | OK |
| 3.1.5 | Lire une playlist ListenBrainz | Titres trouvés jouables, absents grisés |
| 3.1.6 | **∞ Mix surprise** | Enchaîne des titres similaires, sans s'arrêter à la fin du premier |
| 3.1.7 | **🔀 Lecture aléatoire** | File de titres au hasard |
| 3.1.8 | Enchaînement d'un titre au suivant, plusieurs fois de suite | Aucun blocage, aucun titre sauté |

### 3.2 File d'attente et navigation

| # | Test | Attendu |
| --- | --- | --- |
| 3.2.1 | « Lire ensuite » sur un titre | Inséré juste après le titre courant |
| 3.2.2 | Ajouter un album entier à la file | Tous les titres ajoutés dans l'ordre |
| 3.2.3 | Réordonner la file | L'ordre est respecté, le titre courant continue |
| 3.2.4 | Retirer un titre de la file | Retiré sans interrompre la lecture |
| 3.2.5 | Précédent / Suivant | Cohérent, y compris en mode aléatoire |
| 3.2.6 | Répétition (aucune / file / titre) | Les trois modes se comportent comme annoncé |

### 3.3 Confort d'écoute

| # | Test | Attendu |
| --- | --- | --- |
| 3.3.1 | **Fondu enchaîné** activé, écouter deux titres à la suite | Transition douce ; en cas d'échec, l'enchaînement normal prend le relais (pas de silence ni de plantage) |
| 3.3.2 | **Égaliseur** activé, bouger les bandes | Effet audible sur Jellyfin/fichiers locaux |
| 3.3.3 | **Normalisation du volume** activée | Volume homogène entre albums |
| 3.3.4 | Vitesse de lecture sur un podcast, puis changer d'épisode du même podcast | La vitesse est mémorisée **par podcast** |
| 3.3.5 | **Minuteur de sommeil** (15 min ou fin du titre) | S'arrête au bon moment |
| 3.3.6 | Qualité de streaming (max → basse) | Prend effet au titre suivant |

### 3.4 Écran « Lecture en cours » et gestes — surtout `APK`

| # | Test | Attendu |
| --- | --- | --- |
| 3.4.1 | Ouvrir l'écran plein écran | Fond teinté par la pochette |
| 3.4.2 | Onglet **Paroles** sur un morceau connu | Paroles synchronisées, ligne active surlignée et défilement auto |
| 3.4.3 | Double-tap à gauche / à droite de la pochette | −10 s / +10 s |
| 3.4.4 | Glisser vers le bas | Ferme l'écran |
| 3.4.5 | Glisser gauche / droite | Titre suivant / précédent |
| 3.4.6 | Mini-lecteur replié / déplié | Bascule correcte, pas de contenu tronqué |

### 3.5 Système et contexte

| # | Test | Attendu |
| --- | --- | --- |
| 3.5.1 | `APK` : contrôles sur l'**écran verrouillé** | Titre, pochette, lecture/pause, suivant/précédent, barre de progression |
| 3.5.2 | `APK` : lecture en arrière-plan (app minimisée) | La lecture continue |
| 3.5.3 | `APK` : l'app **ne passe pas** sous les boutons de navigation Android | Contenu entièrement visible |
| 3.5.4 | `APK` : couper le réseau en pleine lecture puis le rétablir | Le chien de garde relance la lecture figée |
| 3.5.5 | `WEB` : se déconnecter puis se reconnecter | La configuration (sources, préférences, radios) est retrouvée |
| 3.5.6 | `WEB` : ouvrir l'app dans deux onglets et changer un réglage | L'autre onglet se synchronise |
| 3.5.7 | `WEB` : créer un second utilisateur (admin → gestion des utilisateurs) | Config indépendante entre comptes |
| 3.5.8 | Sauvegarde → export puis import du fichier de réglages | Réglages, radios, vitesses/sauts podcasts et abonnements locaux restaurés |

---

## 4. Comportements attendus — à ne pas signaler comme bugs

Ces limites sont **connues et volontaires** (ou imposées par une plateforme) :

- **Réveil** : nécessite d'appuyer sur la notification ; ne démarre pas tout seul.
  Il faut aussi **ouvrir l'app au moins une fois par semaine** pour qu'il continue de se
  reprogrammer (fenêtre glissante d'environ 8 jours).
- **Chapitres** : uniquement pour les podcasts « Intégrés » dont le flux les fournit.
- **Podcasts « Intégrés »** : la progression et les abonnements sont **locaux à l'appareil** —
  pas de synchronisation multi-appareils (c'est ce que PinePods apporte en plus).
- **Last.fm** : ne fonctionne pas dans l'APK (signature côté serveur requise).
- **Lidarr** : ne fonctionne pas dans l'APK (relais serveur requis).
- **Téléchargements hors-ligne** : APK uniquement (pas de système de fichiers natif sur le web).
- **Épisode considéré lu à 97 %** de sa durée (ou selon le réglage d'outro).
- **Recherche de podcasts** : basée sur l'annuaire iTunes — un flux confidentiel peut en être
  absent ; il reste ajoutable par son URL.
- **Fondu enchaîné** : désactivé pour les radios/podcasts, et abandonné automatiquement si le
  navigateur refuse la lecture du second flux (mieux vaut un enchaînement net qu'un blocage).
- **Égaliseur / normalisation** : n'agissent que sur Jellyfin et les fichiers locaux.
- **CORS / mixed content** : si une source ne répond pas, c'est très souvent là qu'est la cause
  — voir [Configuration](Configuration).

---

## 5. Modèle de rapport de problème

```
Test : (ex. 1.4.2)
Environnement : WEB (Chrome/Firefox…) ou APK (modèle + version Android)
Source concernée : Jellyfin / PinePods / Podcasts intégrés / Radio / Fichiers locaux
Ce que je faisais :
Ce que j'attendais :
Ce qui s'est passé :
Reproductible : oui / non / parfois
Console (web, touche F12) ou capture d'écran :
```

Pour un problème de lecture, la **console du navigateur** (F12) donne souvent la cause exacte
(CORS, mixed content, format audio, réseau). Sur l'APK, `adb logcat` joue le même rôle.
