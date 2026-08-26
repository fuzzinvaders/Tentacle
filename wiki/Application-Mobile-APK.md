# Application mobile (APK Capacitor)

Tentacle peut être empaqueté en application Android (`.apk`) via [Capacitor](https://capacitorjs.com/), qui embarque le build web dans une WebView native. Cette version mobile **n'a pas la couche d'authentification web** (comptes, `/login`, `/setup`) : elle tourne en local sur l'appareil, protégée par le verrouillage d'écran du téléphone — inutile de dupliquer un système de comptes pour un usage strictement personnel.

## Pourquoi un build séparé ?

L'app web normale utilise un **serveur Node** (`adapter-node`) pour gérer l'authentification (voir [Installation Docker](Installation-Docker)). Une app Capacitor n'a pas de serveur : elle charge des fichiers statiques directement dans la WebView. Il faut donc une sortie **100 % statique**, sans la moindre dépendance à un backend.

- `vite.config.ts` choisit l'adaptateur selon la variable `BUILD_TARGET` :
  - non définie → `adapter-node` (build web normal, `npm run build`)
  - `BUILD_TARGET=mobile` → `adapter-static` en mode SPA (fallback `index.html`), sortie dans `build-mobile/`
- [`scripts/build-mobile.mjs`](https://github.com/fuzzinvaders/Tentacle/blob/main/scripts/build-mobile.mjs) désactive **temporairement** `hooks.server.ts` et `+layout.server.ts` (qui gèrent l'authentification) le temps du build, puis les restaure systématiquement ensuite — ces fichiers exigent un serveur pour répondre aux requêtes, ce qu'une sortie statique ne peut pas fournir.

## Prérequis (sur la machine qui compile l'APK)

- [Android Studio](https://developer.android.com/studio) (fournit le JDK et le SDK Android nécessaires), **ou** un JDK 17+ et le SDK Android en ligne de commande
- Node.js (déjà nécessaire pour le reste du projet)

### Recette de build utilisée sur le poste de développement

Android Studio installe un JDK (« JBR ») et le SDK, mais ne les met pas dans le `PATH` : il faut
donc renseigner `JAVA_HOME` et `ANDROID_HOME` pour l'appel à Gradle. Chemins par défaut sous
Windows :

```sh
cd android
JAVA_HOME="C:\Program Files\Android\Android Studio\jbr" \
ANDROID_HOME="$LOCALAPPDATA\Android\Sdk" \
  ./gradlew.bat assembleDebug --console=plain
```

Sans ces deux variables, Gradle échoue avec un message du type *« Unable to locate a Java
Runtime »* ou *« SDK location not found »*.

## Étapes

### 1. Builder le web statique mobile

```sh
npm run build:mobile
```

Génère `build-mobile/` (SPA statique, sans authentification).

### 2. Synchroniser le projet Android

```sh
npm run cap:sync
```

Recopie `build-mobile/` dans `android/app/src/main/assets/public`. À refaire **à chaque changement de code** avant de recompiler l'APK.

### 3. Ouvrir dans Android Studio

```sh
npm run android:open
```

Ouvre le dossier `android/` dans Android Studio (déjà scaffoldé et versionné dans le dépôt).

### 4. Compiler l'APK

Dans Android Studio : **Build → Build Bundle(s) / APK(s) → Build APK(s)**.

Ou en ligne de commande, depuis `android/` :

```sh
# Windows
gradlew.bat assembleDebug

# macOS / Linux
./gradlew assembleDebug
```

L'APK généré se trouve dans :

```
android/app/build/outputs/apk/debug/app-debug.apk
```

Installe-le sur un appareil Android (transfert du fichier + autoriser les sources inconnues), ou via `adb install app-debug.apk`.

## Mettre à jour l'app après un changement de code

```sh
npm run build:mobile
npm run cap:sync
# puis recompiler l'APK (étape 4)
```

## Icône, nom, identifiant

- `appId` (`space.fuzzonaut.tentacle`) et `appName` (`Tentacle`) sont définis dans [`capacitor.config.ts`](https://github.com/fuzzinvaders/Tentacle/blob/main/capacitor.config.ts) — modifiables librement.
- L'icône et le splash screen se personnalisent directement dans `android/app/src/main/res/` (ou via l'outil [Asset Studio](https://developer.android.com/studio/write/create-app-icons) d'Android Studio).

> 📦 Pour **publier sur Google Play** (AAB signé, compte développeur, fiche store, monétisation),
> voir la page dédiée : [Publication sur Google Play](Publication-Google-Play).

## Signer pour une release (Play Store ou distribution hors debug)

Le build `assembleDebug` produit un APK signé avec une clé de debug (installable, non publiable).
La configuration de signature de release est **déjà en place** dans `android/app/build.gradle` : il
ne reste qu'à fournir la clé.

1. Générer la clé, depuis `android/` :
   ```sh
   keytool -genkey -v -keystore tentacle-release.jks -alias tentacle -keyalg RSA -keysize 2048 -validity 10000
   ```
2. Copier le modèle et renseigner tes valeurs :
   ```sh
   cp keystore.properties.example keystore.properties
   ```
3. Construire :
   - **AAB pour Google Play** (format exigé) : `npm run android:release` →
     `android/app/build/outputs/bundle/release/app-release.aab`
   - **APK signé** pour une distribution directe : `gradlew assembleRelease` →
     `android/app/build/outputs/apk/release/app-release.apk`

Sans `keystore.properties`, la construction **réussit quand même** mais produit un artefact **non
signé** (que Play refusera) — vérifie donc bien la présence du fichier.

> 🔑 `keystore.properties`, `*.jks` et `*.keystore` sont ignorés par git. **Ne les commite jamais**,
> et sauvegarde le keystore hors du dépôt : le perdre signifie ne plus jamais pouvoir publier de
> mise à jour de l'app sous le même identifiant.

Le numéro de version se règle dans `android/variables.gradle` (`appVersionCode`, `appVersionName`) —
à incrémenter avant chaque envoi sur Play.

## Fonctions spécifiques à l'APK

Certaines fonctions n'existent **que** dans l'app mobile, parce qu'elles reposent sur des
capacités natives (Capacitor) absentes d'un navigateur :

- **Téléchargements hors-ligne** (système de fichiers natif) — voir [Guide d'utilisation](Guide-utilisation#hors-ligne).
- **Réveil programmé** (notifications locales planifiées).
- **Contrôles média système** enrichis + lecture en arrière-plan via un service de premier plan.
- **Récupération directe des flux RSS** des podcasts intégrés (requête native, donc sans CORS ni
  proxy serveur).

## Limites connues

- Pas de compte / multi-utilisateur sur mobile (volontaire — voir plus haut).
- **Pas de Last.fm ni de Lidarr** : ces deux fonctions ont besoin du serveur Tentacle (signature
  des requêtes Last.fm, relais Lidarr) qui n'existe pas dans l'APK.
- **Pas de synchronisation de profil** : la config vit dans le stockage local de l'app. Pour la
  transférer, utilise l'export/import de réglages (Configuration → *Sauvegarde des réglages*).
- Les sources (Jellyfin, PinePods, ListenBrainz) doivent rester accessibles **depuis le réseau du téléphone** (CORS et mixed-content s'appliquent comme sur le web, voir [Configuration](Configuration)).
- `android/` est versionné dans le dépôt (projet natif, pas juste un artefact) ; `build-mobile/` ne l'est pas (regénéré à chaque build).
