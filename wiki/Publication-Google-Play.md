# Publication sur Google Play

Marche à suivre complète, de zéro à l'app en ligne. Apple/App Store est hors périmètre
(voir [pourquoi](#et-lapp-store-).)

> **Avant de commencer, lis [Faut-il vraiment publier ?](#faut-il-vraiment-publier-)** — pour un
> client auto-hébergé, le store n'est pas toujours le bon véhicule, et il existe une voie beaucoup
> plus légère.

## Ce qui est déjà prêt dans le dépôt

Le travail technique est fait ; il te reste les démarches et un test sur appareil.

| Élément | État |
| --- | --- |
| `targetSdk 36` (exigé par Play) | ✅ fait — **à valider sur appareil**, voir §2 |
| Mode edge-to-edge assumé (plus d'échappatoire) | ✅ fait — `MainActivity` encarte le contenu, `windowBackground` habille les bandes |
| Configuration de signature de release | ✅ fait — lit `android/keystore.properties`, ignoré par git |
| Version centralisée (`versionCode` / `versionName`) | ✅ fait — dans `android/variables.gradle` |
| Construction de l'AAB | ✅ fait — `npm run android:release` |
| Politique de confidentialité | ✅ modèle fourni — [`PRIVACY.md`](https://github.com/fuzzinvaders/Tentacle/blob/main/PRIVACY.md), **à compléter et héberger** |
| Compte développeur, fiche store, captures | ⬜ à faire (§1, §5) |
| Test fermé 12 testeurs × 14 jours | ⬜ à faire (§6) |

---

## 1. Créer le compte développeur

1. Va sur [play.google.com/console](https://play.google.com/console) et crée un compte développeur.
   **Frais : 25 $, une seule fois** (à vie, pas d'abonnement).
2. Choisis le type de compte — **c'est une décision importante** :
   - **Personnel** : plus simple, mais soumis au test fermé de 12 testeurs pendant 14 jours (§6)
     si le compte est créé après le 13/11/2023.
   - **Organisation** : **exempté** de cette obligation, mais exige un numéro DUNS et une
     vérification d'entité qui prend du temps.
3. Vérification d'identité : Google demande une pièce d'identité et une adresse. Compte quelques
   jours.

## 2. Valider le mode edge-to-edge sur un vrai téléphone

⚠️ **L'étape à ne pas sauter.** Pour être publiable, l'app est passée de `targetSdk 34` à `36`.
Or c'est précisément ce réglage qui empêchait l'interface de passer sous les boutons de navigation :
à partir de `36`, Android impose l'edge-to-edge et **l'échappatoire
`windowOptOutEdgeToEdgeEnforcement` ne fonctionne plus**.

Le code gère désormais le cas correctement (padding calculé depuis les `WindowInsets`, appliqué à
la vue racine — l'ancienne tentative visait la WebView et ne suffisait pas). Mais ça n'a **pas** pu
être vérifié sur appareil.

```bash
npm run build:mobile && npm run cap:sync
```

Puis compile et installe l'APK de debug, et vérifie :

- l'en-tête n'est **pas** sous la barre d'état ;
- le lecteur en bas n'est **pas** sous les boutons de navigation (test 3.5.3 du
  [Plan de test](Plan-de-test)) ;
- en paysage, rien ne disparaît sous une encoche ;
- les bandes en haut/bas prennent la couleur sombre de l'app, pas du noir brut.

Si ça régresse, `targetSdkVersion = 34` dans `android/variables.gradle` rétablit l'ancien
comportement — mais l'app ne sera alors **pas publiable**. Dans ce cas, il faut corriger le
traitement des insets, pas revenir en arrière définitivement.

## 3. Créer la clé de signature

**Une seule fois, et pour toujours.** Depuis le dossier `android/` :

```bash
keytool -genkey -v -keystore tentacle-release.jks -alias tentacle -keyalg RSA -keysize 2048 -validity 10000
```

Puis copie le modèle et renseigne tes valeurs :

```bash
cp keystore.properties.example keystore.properties
```

> 🔑 **Le keystore est irremplaçable.** Le perdre signifie ne plus **jamais** pouvoir publier de
> mise à jour de l'app sous le même identifiant. Sauvegarde-le hors du dépôt (gestionnaire de mots
> de passe, disque chiffré, coffre) au même titre qu'un mot de passe. `keystore.properties`, `*.jks`
> et `*.keystore` sont déjà ignorés par git — **ne les commite jamais**.
>
> Active aussi **Play App Signing** (proposé au premier envoi) : Google conserve alors la clé de
> signature finale, ce qui limite les dégâts si tu perds ta clé d'upload.

## 4. Construire l'AAB

Google Play n'accepte plus l'APK pour une nouvelle application : il faut un **Android App Bundle**.

```bash
npm run android:release
```

Résultat : `android/app/build/outputs/bundle/release/app-release.aab`

Avant **chaque** nouvel envoi, incrémente `appVersionCode` dans `android/variables.gradle`
(Google refuse un `versionCode` déjà utilisé) et mets `appVersionName` à jour si la version
publique change.

Vérifie que l'AAB est bien signé — sans `keystore.properties`, la construction réussit mais produit
un artefact **non signé** que Play refusera.

## 5. Remplir la fiche de l'application

Dans la Play Console, crée l'application puis complète :

**Contenu obligatoire**

- **Politique de confidentialité** : une **URL publique**. Publie [`PRIVACY.md`](https://github.com/fuzzinvaders/Tentacle/blob/main/PRIVACY.md)
  (après l'avoir complété : adresse de contact, services réellement actifs) sur une page web
  accessible — ton domaine, ou une page de dépôt public.
- **Formulaire « Sécurité des données »** : déclare honnêtement. Points saillants pour Tentacle :
  aucune donnée collectée par l'éditeur, mais l'app **stocke des identifiants et jetons d'API sur
  l'appareil** et les transmet aux serveurs configurés par l'utilisateur. Pas de publicité, pas de
  mesure d'audience, pas de partage avec des tiers.
- **Classification du contenu** : questionnaire. Attention : l'app donne accès à des podcasts et
  radios tiers, dont le contenu peut être explicite — réponds en conséquence.
- **Public cible** : pas destiné aux enfants.

**Éléments graphiques**

| Élément | Format |
| --- | --- |
| Icône | 512 × 512 px, PNG 32 bits |
| Image de bannière | 1024 × 500 px |
| Captures d'écran téléphone | 2 minimum, 8 maximum |

Les captures sont ta seule vitrine : montre l'écran « Lecture en cours » avec la pochette teintée,
la bibliothèque, et l'écran de lecture plein écran — c'est là que l'esthétique pixel-art se voit.

**⚠️ Le piège de la revue** — l'examinateur Google installe l'app et… ne voit rien : pas de serveur
Jellyfin, pas de PinePods, donc une app apparemment vide ou cassée. **C'est une cause classique de
rejet.** Deux solutions, à mettre dans les *notes pour l'examinateur* :

- fournir un **serveur de démonstration** accessible depuis Internet, avec des identifiants de
  test (le plus convaincant) ;
- ou expliquer clairement que l'app est un client nécessitant un serveur personnel, et fournir une
  vidéo de démonstration.

Prévois aussi une **description** qui annonce cette dépendance dès la première ligne : ça évite les
notes 1 étoile de gens qui téléchargent sans avoir de serveur.

## 6. Le test fermé (comptes personnels)

Si ton compte est **personnel** et créé après le 13/11/2023 :

- il faut **12 testeurs** — 12 comptes Google **distincts**, qui rejoignent via ton lien d'opt-in
  et installent l'app sur un **appareil réel** ;
- ils doivent rester inscrits **en continu pendant 14 jours** ;
- ensuite seulement, tu peux demander l'accès à la production depuis le tableau de bord.

C'est en pratique l'obstacle le plus pénible pour un développeur seul. Amis, famille, collègues —
ou un compte organisation pour y échapper.

## 7. Envoyer et publier

1. **Test interne** d'abord (jusqu'à 100 testeurs, disponible immédiatement) : c'est là que tu
   valides l'AAB signé, l'installation depuis Play, et le comportement en release.
2. **Test fermé** (§6) si nécessaire.
3. **Demande d'accès à la production**, puis déploiement — éventuellement progressif (10 % des
   utilisateurs d'abord).

Compte quelques jours de revue pour un premier envoi.

## 8. Après la publication : les obligations qui restent

Publier n'est pas un acte unique, c'est un engagement récurrent :

- **La course au `targetSdk`** : chaque année, Google relève le minimum. Une app qui n'est pas mise
  à jour finit par disparaître des recherches sur les appareils récents.
- **Déclarations annuelles** à re-confirmer dans la console.
- **Comptes inactifs** : un compte développeur sans activité peut être fermé.
- Chaque mise à jour repasse en revue.

---

## Idées de revenus

Regardons ça franchement, parce que la réponse n'est pas la même selon les modèles.

### 💸 Publicité — à écarter, à mon sens

Techniquement possible (AdMob), mais c'est le mauvais outil ici :

- **Le volume n'y sera pas.** La publicité ne rapporte qu'à grande échelle : on parle de dizaines
  de milliers d'utilisateurs actifs quotidiens pour dégager quelques centaines d'euros par mois. Le
  public de Tentacle — les gens qui possèdent un serveur Jellyfin *et* cherchent ce client précis —
  se compte en centaines, pas en dizaines de milliers.
- **Ça abîme le produit.** Une bannière dans un lecteur audio dont l'argument est justement
  « ta musique, ton serveur, sans intermédiaire » est une contradiction. Les utilisateurs
  auto-hébergés sont précisément ceux qui fuient ça.
- **Ça alourdit la conformité.** Un SDK publicitaire signifie collecte de l'identifiant
  publicitaire, consentement RGPD à gérer (SDK UMP), et une déclaration « Sécurité des données »
  bien plus lourde — alors que la fiche actuelle peut afficher fièrement *aucune donnée collectée*.

### 💰 App payante — le modèle réaliste

C'est le modèle qui correspond au produit, et **il existe un précédent qui le prouve** :
**Symfonium**, un client Jellyfin/Plex/Emby payant (~5 €, achat unique), est un vrai succès sur ce
créneau exact. Le public auto-hébergé paie volontiers pour un bon client — c'est même souvent une
population qui préfère payer plutôt que subir de la publicité.

- Prix réaliste : **3 à 6 €**, achat unique.
- Nécessite un **compte marchand** (Google Payments) et des informations fiscales.
- Inconvénient : une app payante n'est pas essayable, donc les captures et la description font tout
  le travail de conviction.

### 🧩 Gratuit avec fonctions payantes — le meilleur compromis

Le modèle le plus adapté selon moi : l'app est gratuite et pleinement utilisable, et un achat
unique (« Soutenir / Version complète ») déverrouille les fonctions de confort. Des candidates
naturelles existent déjà dans l'app :

- téléchargements hors-ligne ;
- égaliseur et normalisation du volume ;
- réveil programmé ;
- sauts d'intro/outro par podcast ;
- thèmes supplémentaires.

Avantages : l'utilisateur essaie avant de payer, la fiche reste attractive, et tu gardes une app
sans publicité. Coût technique : il faut intégrer **Google Play Billing** — Google **impose** son
système de paiement pour tout achat numérique dans l'app. C'est un développement à part entière
(un plugin Capacitor existe), plus la gestion du « déjà acheté » à la réinstallation.

### 🎁 Dons

Attention au piège : Google exige Play Billing pour les achats numériques dans l'app, et les
exceptions « don » visent surtout les organisations à but non lucratif. Le plus sûr pour un
particulier :

- un lien **hors de l'app** (page du dépôt, site) vers Ko-fi / GitHub Sponsors / Liberapay ;
- ou un article Play Billing non consommable intitulé « Soutenir le développement », sans
  contrepartie fonctionnelle.

### ⚖️ Un point à vérifier avant de monétiser

Si l'app devient **commerciale**, les conditions d'utilisation des API tierces qu'elle appelle
deviennent un vrai sujet — plusieurs sont pensées pour un usage non commercial ou imposent des
limites :

- **Deezer** (fonction « Titres populaires ») ;
- **annuaire iTunes/Apple** (recherche de podcasts) ;
- **Radio Browser**, **LRCLIB**, **MusicBrainz** (limites de débit, attribution attendue).

Ce ne sont pas forcément des interdictions, mais **à lire avant d'encaisser de l'argent**. Le cas le
plus sensible est Deezer ; au besoin, cette fonction peut retomber sur ListenBrainz seul (le repli
existe déjà dans le code).

Note aussi la police **Pixelify Sans** : licence OFL, utilisation commerciale autorisée, mais la
licence doit être conservée et l'attribution respectée (le fichier `OFL.txt` est déjà dans
`static/fonts/`).

---

## Faut-il vraiment publier ?

Mon avis, à contre-courant de la question : pour un client auto-hébergé personnel, **le store est
souvent un mauvais véhicule**. Les 12 testeurs, la revue à chaque envoi, la course au `targetSdk`,
la fiche à maintenir — pour un public qui, de toute façon, sait installer un APK.

Si ton objectif est la **commodité de mise à jour** plutôt que la distribution grand public, il y a
beaucoup plus léger :

- **Obtainium** + **releases Gitea/GitHub** : l'app se met à jour automatiquement depuis tes
  releases. Zéro frais, zéro revue, zéro testeur.
- **F-Droid** (dépôt personnel ou officiel) : gratuit, et son public cherche précisément ce genre
  d'application auto-hébergée.

Si ton objectif est la **vitrine** ou un **revenu**, alors Play a du sens — et dans ce cas, vise le
modèle « gratuit + achat unique », pas la publicité.

## Et l'App Store ?

Écarté volontairement, pour deux raisons de fond :

1. **La plateforme iOS n'existe pas dans le projet** — il n'y a pas de dossier `ios/`, et tout le
   versant iOS serait à créer et à valider de zéro (lecture en arrière-plan, comportement iOS des
   trois plugins Capacitor).
2. **Compiler pour iOS exige macOS** — contournable via un macOS distant (Xcode Cloud, Codemagic),
   mais l'abonnement **Apple Developer à 99 $/an** est obligatoire, et la revue Apple est plus
   stricte (guideline 4.2 « fonctionnalité minimale » vise exactement les apps inutilisables sans
   serveur fourni par l'utilisateur).
