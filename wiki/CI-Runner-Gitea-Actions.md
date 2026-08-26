# CI — Runner Gitea Actions

Le workflow [`docker-publish.yml`](Installation-Docker#publication-automatique-de-limage-ci-gitea-actions) qui construit et publie l'image Docker ne s'exécute que si un **runner Gitea Actions** (`act_runner`) est enregistré sur ton instance. Sans runner, chaque exécution reste bloquée en **« En attente »** avec le message *« Aucun exécuteur en ligne correspondant au libellé ubuntu-latest »* (visible dans l'onglet **Actions** du dépôt).

## Ce que ça implique

Le job du workflow lance `docker buildx build` (via `docker/build-push-action`) **à l'intérieur du conteneur de job**. Pour que ça fonctionne, le runner partage le **Docker du serveur hôte** avec chaque job (socket monté). C'est un vrai niveau de privilège — équivalent à un accès root sur la machine qui héberge le runner. À réserver à un usage personnel où tu maîtrises les workflows exécutés (le cas ici).

## Fichiers fournis

| Fichier | Rôle |
| --- | --- |
| `ci/act-runner-compose.yml` | Lance le conteneur `act_runner` |
| `ci/act-runner-config.yaml` | Config minimale : partage le socket Docker avec les jobs |

À lancer sur une machine avec **Docker installé** — idéalement le serveur qui héberge déjà Gitea, ou toute machine avec un accès réseau à `<ton-instance-gitea>`.

## Étapes

### 1. Récupérer un token d'enregistrement

Dans l'interface Gitea, en tant qu'administrateur :

- **Au niveau instance** : `https://gitea.exemple.fr/-/admin/actions/runners` → *Create new runner*
- **Au niveau dépôt** : *Settings → Actions → Runners* sur le dépôt Tentacle → *Create new runner*

Copie le **token d'enregistrement** affiché (valable une seule inscription, à usage court).

### 2. Démarrer le runner

Depuis le dossier `ci/` du dépôt cloné sur la machine qui hébergera le runner :

```sh
RUNNER_TOKEN=<le-token-copié> docker compose -f act-runner-compose.yml up -d
```

Le token n'est utilisé qu'à la première inscription (le résultat est écrit dans `./data/.runner`) ; tu peux ensuite l'omettre des lancements suivants.

### 3. Vérifier l'enregistrement

- Sur la page *Runners* (instance ou dépôt), le runner `tentacle-runner` doit apparaître avec le statut **Idle** et le label `ubuntu-latest`.
- Sur l'onglet **Actions** du dépôt, relance manuellement une exécution bloquée (bouton *Re-run* sur un run existant) — ou pousse un nouveau commit — pour vérifier qu'elle passe en cours d'exécution puis en succès.

### 4. Suivre les logs

```sh
# depuis le dossier ci/
docker compose -f act-runner-compose.yml logs -f
```

### 5. Authentification du push (si nécessaire)

Par défaut, le workflow se connecte au registre avec le **token automatique** du job (permission `packages: write`). Beaucoup d'instances Gitea l'accordent — dans ce cas, rien à faire.

Si le job échoue à l'étape *Log in* / *Build and push* avec une erreur 401/403 :

1. Crée un **jeton d'accès personnel** (Gitea → *Settings → Applications*) avec le scope **`write:package`**.
2. Dans le dépôt Tentacle → *Settings → Actions → Secrets*, ajoute :
   - `REGISTRY_USER` = ton identifiant Gitea
   - `REGISTRY_TOKEN` = le jeton créé
3. Relance le workflow. Le workflow utilise ces secrets **en priorité** s'ils existent.

### 6. Rendre l'image publique (pour un déploiement sans login)

Après la première publication réussie, le package apparaît dans l'onglet **Paquets** du dépôt. Pour que `docker-compose.deploy.yml` puisse tirer l'image **sans `docker login`**, règle la **visibilité du package sur public** depuis sa page (bouton *Paramètres du paquet*). Sinon, garde-le privé et fais un `docker login <ton-instance-gitea>` sur la machine de déploiement.

Voir [Installation via Docker](Installation-Docker) pour la suite du déploiement.

## Dépannage

| Symptôme | Piste |
| --- | --- |
| Toujours « En attente » après démarrage | Vérifie que le label du runner (`ubuntu-latest`) correspond bien à `runs-on: ubuntu-latest` du workflow ; regarde les logs du conteneur runner |
| Le job échoue sur `docker buildx build` | Le socket Docker n'est pas correctement partagé — vérifie `container.options` dans `act-runner-config.yaml` et que `/var/run/docker.sock` existe bien sur l'hôte |
| Token refusé | Génère un nouveau token (l'ancien a peut-être expiré ou déjà servi) |
| Push refusé (401/403 sur *Build and push*) | Le token automatique n'a pas `packages: write` sur ton instance → ajoute les secrets `REGISTRY_USER` / `REGISTRY_TOKEN` (étape 5) |
| `docker pull` réclame un login au déploiement | Le package est privé → rends-le public (étape 6) ou fais `docker login` |
| Le runner disparaît après redémarrage de la machine | Le service Docker doit démarrer au boot ; `restart: unless-stopped` relance le conteneur, encore faut-il que Docker lui-même soit lancé au démarrage |

Une fois le runner opérationnel, voir [Installation via Docker](Installation-Docker) pour déployer l'image publiée avec `docker-compose.deploy.yml`.
