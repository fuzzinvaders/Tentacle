# Politique de confidentialité — Tentacle

*Dernière mise à jour : 19 août 2026*

Tentacle est un lecteur audio qui se connecte à **tes propres serveurs** (Jellyfin, PinePods) et à
des services publics de ton choix. Cette page décrit précisément quelles données l'application
manipule, où elles vont, et lesquelles ne vont nulle part.

> ⚠️ **À adapter avant publication.** Ce document est un modèle honnête et complet, mais il doit
> refléter *ton* déploiement : complète l'adresse de contact ci-dessous, et retire les mentions des
> services que tu n'active pas. Une politique de confidentialité inexacte est un motif de rejet
> sur Google Play.

## En résumé

- **Aucun compte Tentacle, aucun serveur Tentacle central.** Il n'existe pas de service
  « Tentacle » qui collecterait tes données : l'application parle directement à tes serveurs.
- **Aucune publicité, aucun traceur, aucune analyse d'usage.** L'application n'intègre ni SDK
  publicitaire, ni outil de mesure d'audience, ni rapport de plantage automatique.
- **Aucune donnée n'est vendue ni partagée** avec un tiers à des fins commerciales.

## Données stockées sur ton appareil

Tout ce qui suit reste **local** à l'appareil (stockage de l'application). Rien n'est transmis à
l'éditeur.

| Donnée | Pourquoi |
| --- | --- |
| Adresses de tes serveurs, jetons d'API, identifiants de connexion | Se connecter à Jellyfin, PinePods, ListenBrainz, Last.fm, Lidarr |
| Préférences (thème, égaliseur, qualité de flux, tri…) | Retrouver tes réglages |
| Abonnements aux podcasts « intégrés », progression d'écoute, file d'attente | Faire fonctionner la lecture de podcasts sans serveur |
| Fichiers audio téléchargés pour l'écoute hors-ligne | Écouter sans réseau |
| Heure de réveil programmé | Déclencher la notification |

Ces données sont **supprimées avec l'application**. L'export de réglages
(*Configuration → Sauvegarde*) produit un fichier qui **ne contient aucun mot de passe ni jeton**.

## Données envoyées à des tiers — et lesquels

L'application ne contacte que les services que **tu** as configurés ou utilisés :

| Destinataire | Ce qui est envoyé | Quand |
| --- | --- | --- |
| **Ton serveur Jellyfin** | Tes identifiants/jeton, les requêtes de lecture et de bibliothèque | Si tu le connectes |
| **Ton serveur PinePods** | Ton jeton, la progression de tes épisodes | Si tu le connectes |
| **Ton serveur Lidarr** | Ta clé d'API, les demandes d'ajout d'album | Si tu le connectes |
| **ListenBrainz** *(listenbrainz.org)* | Ton jeton, les titres écoutés (scrobbling) | Si tu le connectes |
| **Last.fm** | Ta clé/session, les titres écoutés | Si tu le connectes |
| **Hébergeurs des flux de podcasts** | Une requête HTTP vers le flux et le fichier audio | À l'ouverture/lecture d'un podcast |
| **Radio Browser** *(api.radio-browser.info)* | Ta recherche de station | Recherche de radios |
| **Annuaire iTunes/Apple** | Ton terme de recherche de podcast | Recherche de podcasts |
| **LRCLIB** *(lrclib.net)* | Titre, artiste, album, durée du morceau | Affichage des paroles |
| **Deezer** *(api.deezer.com)* | Le nom de l'artiste | Fonction « Titres populaires » |
| **MusicBrainz** | Titre/artiste du morceau | Identification d'album (fonction Lidarr) |

Chaque service tiers applique **sa propre** politique de confidentialité. Ces requêtes partent de
ton appareil (ou de ton serveur Tentacle si tu utilises la version web auto-hébergée) ; l'éditeur
de l'application n'y a jamais accès.

## Version web auto-hébergée

Si tu héberges la version web, le serveur que **tu** administres stocke les comptes utilisateurs
(identifiant, mot de passe haché avec scrypt) et le profil de configuration de chaque compte —
lequel **contient les jetons d'API des sources en clair**, dans le fichier `users.json` du volume
de données. Protège ce fichier comme un secret. Tu es le responsable du traitement de ces données.

## Autorisations Android et leur usage

| Autorisation | Usage |
| --- | --- |
| `INTERNET` | Contacter tes serveurs et les services listés ci-dessus |
| `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK` | Poursuivre la lecture quand l'application est en arrière-plan, et afficher les contrôles sur l'écran verrouillé |
| `POST_NOTIFICATIONS` | Notification de lecture en cours et notification du réveil programmé |
| `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK`, `SCHEDULE_EXACT_ALARM` | Reprogrammer et déclencher le réveil à l'heure prévue |

L'application ne demande **ni** localisation, **ni** contacts, **ni** micro, **ni** caméra, **ni**
accès à l'identifiant publicitaire.

## Enfants

L'application n'est pas destinée aux enfants et ne collecte sciemment aucune donnée les
concernant. Les contenus lus proviennent de tes propres serveurs ou de flux publics que tu choisis.

## Tes droits

Comme aucune donnée n'est collectée par l'éditeur, il n'y a rien à demander, corriger ou faire
supprimer de son côté. Pour effacer les données locales : désinstalle l'application, ou vide son
stockage depuis les réglages Android. Pour les données de tes propres serveurs, adresse-toi à
l'administrateur de ces serveurs (c'est-à-dire toi).

## Contact

Pour toute question sur cette politique, ouvre un ticket sur le dépôt :
<https://github.com/fuzzinvaders/Tentacle/issues>.

> Si tu héberges ta propre instance, **remplace ce contact par le tien** : les visiteurs de *ton*
> instance s'adressent à toi, pas au dépôt du projet. Google Play exige d'ailleurs une adresse de
> contact valable pour l'éditeur de l'application publiée.

## Modifications

Toute évolution de cette politique sera publiée sur cette page, avec mise à jour de la date en
en-tête. Un changement substantiel (ajout d'une collecte de données, d'une publicité, d'une mesure
d'audience) sera signalé dans l'application.
