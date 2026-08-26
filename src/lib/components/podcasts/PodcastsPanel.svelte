<script lang="ts">
	import PixelPanel from '$lib/components/shared/PixelPanel.svelte';
	import PodcastSubscriptions from '$lib/components/podcasts/PodcastSubscriptions.svelte';
	import PodcastEpisodeList from '$lib/components/podcasts/PodcastEpisodeList.svelte';
	import PodcastSkipConfig from '$lib/components/podcasts/PodcastSkipConfig.svelte';
	import PodcastSearch from '$lib/components/podcasts/PodcastSearch.svelte';
	import LocalPodcastManage from '$lib/components/podcasts/LocalPodcastManage.svelte';
	import PodcastFeedAdd from '$lib/components/podcasts/PodcastFeedAdd.svelte';
	import { pinepods } from '$lib/stores/pinepods.svelte';
	import { player } from '$lib/stores/player.svelte';
	import { ui } from '$lib/stores/ui.svelte';
	import { settings } from '$lib/stores/settings.svelte';
	import { toasts } from '$lib/stores/toasts.svelte';
	import type { PodcastsSubTab } from '$lib/stores/settings.svelte';
	import { episodeToTrack } from '$lib/podcastTrack';
	import { tablist } from '$lib/actions/tablist';
	import { podcastProgressCache } from '$lib/stores/podcastProgressCache.svelte';
	import {
		listPodcasts,
		listEpisodes,
		listInProgressEpisodes,
		homeOverview,
		removePodcast,
		getQueue,
		addToQueue,
		removeFromQueue,
		markEpisodeCompleted,
		markEpisodeUncompleted,
		searchPodcasts,
		addPodcast,
		addPodcastByFeed,
		PinePodsApiError
	} from '$lib/api/pinepods';
	import {
		listSubscriptions as listLocalSubscriptions,
		listEpisodes as listLocalEpisodes,
		listInProgressEpisodes as listLocalInProgress,
		listRecentEpisodes as listLocalRecent,
		listQueue as listLocalQueue,
		unsubscribe as unsubscribeLocal,
		toggleQueue as toggleLocalQueue,
		markCompleted as markLocalCompleted,
		markUncompleted as markLocalUncompleted,
		searchPodcastsItunes,
		subscribeToFeed,
		markPodcastSeen,
		getNewEpisodeCounts
	} from '$lib/api/localPodcasts';
	import type { PinePodsEpisode, PinePodsPodcast, PinePodsSearchResult } from '$lib/types';

	let subTab = $state<PodcastsSubTab>(settings.values.defaultPodcastsTab);
	// Source active : PinePods (serveur) ou podcasts locaux (flux RSS gérés dans l'app) — choix
	// explicite dans la Configuration (voir « Préférences Podcasts »).
	const isLocal = $derived(settings.values.podcastSource === 'local');
	/** Prêt à afficher le panneau normal (par opposition au placeholder « non connecté ») :
	 * toujours vrai en local (pas de serveur requis), sinon nécessite une connexion PinePods. */
	const ready = $derived(isLocal || pinepods.connected);

	// Onglets de la barre de sections. Dérivé plutôt qu'écrit en dur : le libellé du dernier
	// dépend de la source active, et la boucle garantit une sémantique ARIA identique partout.
	const subTabs = $derived<{ id: PodcastsSubTab; label: string; accent: string }[]>([
		{ id: 'encours', label: 'En cours', accent: 'var(--gold)' },
		{ id: 'abonnements', label: 'Abonnements', accent: 'var(--teal)' },
		{ id: 'recents', label: 'Récents', accent: 'var(--coral)' },
		{ id: 'suivre', label: 'À suivre', accent: 'var(--rust)' },
		// « Ajouter » quelle que soit la source : l'onglet propose désormais la recherche ET
		// l'ajout par URL de flux dans les deux modes.
		{ id: 'recherche', label: 'Ajouter', accent: 'var(--gold-bright)' }
	]);

	let podcasts = $state<PinePodsPodcast[]>([]);
	/** Nombre de nouveaux épisodes par abonnement local, pour le badge des cartes. */
	let newEpisodeCounts = $state<Record<number, number>>({});
	let selectedPodcastId = $state<number | null>(null);
	let episodes = $state<PinePodsEpisode[]>([]);
	let recentEpisodes = $state<PinePodsEpisode[]>([]);
	let queueEpisodes = $state<PinePodsEpisode[]>([]);
	let progressEpisodes = $state<PinePodsEpisode[]>([]);

	let loadingSubs = $state(false);
	let loadingEpisodes = $state(false);
	let loadingRecent = $state(false);
	let loadingQueue = $state(false);
	let loadingProgress = $state(false);
	let errorMessage = $state('');

	function sortByDate(list: PinePodsEpisode[]): PinePodsEpisode[] {
		const order = settings.values.episodeSortOrder;
		return [...list].sort((a, b) => {
			const da = Date.parse(a.episodepubdate) || 0;
			const db = Date.parse(b.episodepubdate) || 0;
			return order === 'desc' ? db - da : da - db;
		});
	}

	function hideCompletedIfSet(list: PinePodsEpisode[]): PinePodsEpisode[] {
		return settings.values.hideCompletedEpisodes ? list.filter((ep) => !ep.completed) : list;
	}

	const displayedEpisodes = $derived(hideCompletedIfSet(episodes));
	const displayedRecent = $derived(sortByDate(hideCompletedIfSet(recentEpisodes)));
	/** "En cours" = tout episode ayant une progression et non termine, sur TOUS les abonnements.
	 * La source de verite est `progressEpisodes` (balaye chaque podcast, PinePods ou local) ; on y
	 * superpose les episodes deja connus localement (podcast consulte, recents, file) pour refleter
	 * instantanement une lecture qui vient de demarrer (markStarted) avant le prochain rechargement.
	 * Deduplique par episodeid, en privilegiant la copie locale (etat optimiste le plus recent). */
	const inProgressEpisodes = $derived.by(() => {
		const byId = new Map<number, PinePodsEpisode>();
		for (const ep of [...progressEpisodes, ...episodes, ...recentEpisodes, ...queueEpisodes]) {
			byId.set(ep.episodeid, ep);
		}
		return sortByDate([...byId.values()].filter((ep) => ep.listenduration > 0 && !ep.completed));
	});
	const displayedQueue = $derived(hideCompletedIfSet(queueEpisodes));

	async function loadSubscriptions() {
		if (isLocal) {
			loadingSubs = true;
			errorMessage = '';
			try {
				podcasts = listLocalSubscriptions();
			} finally {
				loadingSubs = false;
			}
			// En tâche de fond (reparse chaque flux) : n'attend pas l'affichage des abonnements,
			// les badges apparaissent dès que dispo.
			if (podcasts.length > 0) {
				getNewEpisodeCounts()
					.then((counts) => (newEpisodeCounts = counts))
					.catch(() => {});
			}
			return;
		}
		const conn = pinepods.connection;
		if (!conn) return;
		loadingSubs = true;
		errorMessage = '';
		try {
			podcasts = await listPodcasts(conn);
		} catch (err) {
			errorMessage = err instanceof PinePodsApiError ? err.message : 'Impossible de charger les abonnements.';
		} finally {
			loadingSubs = false;
		}
	}

	async function selectPodcast(podcastId: number) {
		selectedPodcastId = podcastId;
		loadingEpisodes = true;
		errorMessage = '';
		try {
			if (isLocal) {
				episodes = await listLocalEpisodes(podcastId, settings.values.episodeSortOrder);
				markPodcastSeen(podcastId);
				if (newEpisodeCounts[podcastId]) {
					const { [podcastId]: _seen, ...rest } = newEpisodeCounts;
					newEpisodeCounts = rest;
				}
			} else {
				const conn = pinepods.connection;
				if (!conn) return;
				episodes = await listEpisodes(conn, podcastId, settings.values.episodeSortOrder);
			}
		} catch (err) {
			errorMessage =
				err instanceof PinePodsApiError
					? err.message
					: isLocal
						? 'Flux injoignable ou invalide.'
						: 'Impossible de charger les épisodes.';
			episodes = [];
		} finally {
			loadingEpisodes = false;
		}
	}

	async function unsubscribe(podcastId: number) {
		if (isLocal) {
			unsubscribeLocal(podcastId);
			podcasts = podcasts.filter((p) => p.podcastid !== podcastId);
			if (selectedPodcastId === podcastId) {
				selectedPodcastId = null;
				episodes = [];
			}
			return;
		}
		const conn = pinepods.connection;
		if (!conn) return;
		try {
			await removePodcast(conn, podcastId);
			podcasts = podcasts.filter((p) => p.podcastid !== podcastId);
			if (selectedPodcastId === podcastId) {
				selectedPodcastId = null;
				episodes = [];
			}
		} catch (err) {
			errorMessage = err instanceof PinePodsApiError ? err.message : "Impossible de se désabonner.";
		}
	}

	async function loadRecent() {
		loadingRecent = true;
		errorMessage = '';
		try {
			if (isLocal) {
				recentEpisodes = await listLocalRecent();
			} else {
				const conn = pinepods.connection;
				if (!conn) return;
				recentEpisodes = await homeOverview(conn);
			}
		} catch (err) {
			errorMessage = err instanceof PinePodsApiError ? err.message : 'Impossible de charger les épisodes récents.';
		} finally {
			loadingRecent = false;
		}
	}

	async function loadInProgress() {
		// Affichage instantané de la dernière liste connue : ce balayage prend plusieurs
		// secondes (tous les abonnements, et en local un re-téléchargement de chaque flux),
		// or c'est l'onglet ouvert par défaut. On remplace dès que le vrai résultat arrive.
		const cached = podcastProgressCache.get(isLocal ? 'local' : 'pinepods');
		if (cached && progressEpisodes.length === 0) progressEpisodes = cached;

		loadingProgress = true;
		errorMessage = '';
		try {
			if (isLocal) {
				progressEpisodes = await listLocalInProgress();
			} else {
				const conn = pinepods.connection;
				if (!conn) return;
				// Balaye tous les abonnements → nécessite la liste des podcasts d'abord.
				if (podcasts.length === 0) {
					try {
						podcasts = await listPodcasts(conn);
					} catch {
						/* l'erreur d'abonnements est déjà remontée par loadSubscriptions */
					}
				}
				progressEpisodes = await listInProgressEpisodes(conn, podcasts.map((p) => p.podcastid));
			}
			podcastProgressCache.set(isLocal ? 'local' : 'pinepods', progressEpisodes);
		} catch (err) {
			errorMessage =
				err instanceof PinePodsApiError ? err.message : 'Impossible de charger les épisodes en cours.';
		} finally {
			loadingProgress = false;
		}
	}

	/** Mirrors queued episodes into the local playback bus (additively — never removes
	 * unrelated tracks) so "À suivre" actually auto-plays in sequence via the player's onEnded. */
	function syncQueueToPlayer(eps: PinePodsEpisode[]) {
		if (!settings.values.autoplayQueue) return;
		for (const ep of eps) {
			const id = `podcast-${ep.episodeid}`;
			if (!player.queue.some((t) => t.id === id)) player.enqueue(episodeToTrack(ep, isLocal));
		}
	}

	async function loadQueue() {
		loadingQueue = true;
		try {
			if (isLocal) {
				queueEpisodes = await listLocalQueue();
			} else {
				const conn = pinepods.connection;
				if (!conn) return;
				queueEpisodes = await getQueue(conn);
			}
			syncQueueToPlayer(queueEpisodes);
		} catch (err) {
			errorMessage = err instanceof PinePodsApiError ? err.message : 'Impossible de charger la file d’attente.';
		} finally {
			loadingQueue = false;
		}
	}

	async function toggleQueue(ep: PinePodsEpisode) {
		try {
			if (isLocal) {
				toggleLocalQueue(ep);
				if (ep.queued) player.removeFromQueue(`podcast-${ep.episodeid}`);
				else if (settings.values.autoplayQueue) player.enqueue(episodeToTrack(ep, isLocal));
				toasts.info(ep.queued ? 'Épisode retiré de la file' : 'Épisode ajouté à la file');
			} else {
				const conn = pinepods.connection;
				if (!conn) return;
				if (ep.queued) {
					await removeFromQueue(conn, ep.episodeid);
					player.removeFromQueue(`podcast-${ep.episodeid}`);
					toasts.info('Épisode retiré de la file');
				} else {
					await addToQueue(conn, ep.episodeid);
					if (settings.values.autoplayQueue) player.enqueue(episodeToTrack(ep, isLocal));
					toasts.info('Épisode ajouté à la file');
				}
			}
			// Reflect the flip everywhere the episode might be listed, then refresh the queue view.
			const flip = (list: PinePodsEpisode[]) =>
				list.map((e) => (e.episodeid === ep.episodeid ? { ...e, queued: !e.queued } : e));
			episodes = flip(episodes);
			recentEpisodes = flip(recentEpisodes);
			progressEpisodes = flip(progressEpisodes);
			await loadQueue();
		} catch (err) {
			errorMessage = err instanceof PinePodsApiError ? err.message : 'Impossible de mettre à jour la file d’attente.';
		}
	}

	async function toggleCompleted(ep: PinePodsEpisode) {
		try {
			if (isLocal) {
				if (ep.completed) markLocalUncompleted(ep.episodeid, ep.podcastid);
				else markLocalCompleted(ep.episodeid, ep.podcastid);
			} else {
				const conn = pinepods.connection;
				if (!conn) return;
				if (ep.completed) await markEpisodeUncompleted(conn, ep.episodeid);
				else await markEpisodeCompleted(conn, ep.episodeid);
			}
			const flip = (list: PinePodsEpisode[]) =>
				list.map((e) => (e.episodeid === ep.episodeid ? { ...e, completed: !e.completed } : e));
			episodes = flip(episodes);
			recentEpisodes = flip(recentEpisodes);
			queueEpisodes = flip(queueEpisodes);
			progressEpisodes = flip(progressEpisodes);
			if (isLocal && !ep.completed) await loadQueue(); // markCompleted retire aussi de la file
		} catch (err) {
			errorMessage =
				err instanceof PinePodsApiError ? err.message : 'Impossible de mettre à jour le statut de lecture.';
		}
	}

	/** Reflete localement, tout de suite, qu'un episode vient d'etre lance — sans ca, il ne
	 * rejoint "En cours" qu'apres le prochain rechargement (qui peut prendre du temps ou ne
	 * jamais se declencher tant qu'on ne quitte pas l'onglet). Le vrai suivi reste gere par
	 * PodcastProgressSync (rapport de position toutes les ~15s). */
	function markStarted(ep: PinePodsEpisode) {
		const withStart = (e: PinePodsEpisode) => ({
			...e,
			listenduration: Math.max(e.listenduration, 1),
			completed: false
		});
		const flip = (list: PinePodsEpisode[]) =>
			list.map((e) => (e.episodeid === ep.episodeid ? withStart(e) : e));
		episodes = flip(episodes);
		recentEpisodes = flip(recentEpisodes);
		queueEpisodes = flip(queueEpisodes);
		// Injecte l'épisode dans « En cours » même s'il n'y figurait pas encore
		// (lancé depuis un autre onglet) — sinon il n'y apparaît qu'au prochain rechargement.
		progressEpisodes = progressEpisodes.some((e) => e.episodeid === ep.episodeid)
			? flip(progressEpisodes)
			: [...progressEpisodes, withStart(ep)];
	}

	function playQueue() {
		if (displayedQueue.length === 0) return;
		const ep = displayedQueue[0];
		player.playNow(episodeToTrack(ep, isLocal));
		markStarted(ep);
	}

	// Verrous de requête (non réactifs) : garantissent un seul chargement par connexion/source et
	// par onglet. On NE peut PAS se fier à `xxx.length === 0` comme condition de (re)chargement :
	// une réponse légitimement vide laisse la longueur à 0, et la réassignation du tableau vide
	// redéclencherait l'effect en boucle (nouvelle référence à chaque fois).
	let subsRequested = false;
	let recentRequested = false;
	let queueRequested = false;
	let progressRequested = false;
	let lastSource: 'pinepods' | 'local' | null = null;

	// Recharge selon l'onglet actif à chaque connexion/changement de source ET à chaque
	// changement d'onglet — couvre le montage initial, les clics sur les onglets, et le
	// changement de source dans la Configuration (repart de zéro pour ne pas mélanger les deux).
	$effect(() => {
		const source = settings.values.podcastSource; // dépendance explicite au réglage de source
		if (!ready) {
			subsRequested = false;
			recentRequested = false;
			queueRequested = false;
			progressRequested = false;
			podcasts = [];
			selectedPodcastId = null;
			episodes = [];
			recentEpisodes = [];
			queueEpisodes = [];
			progressEpisodes = [];
			lastSource = source;
			return;
		}
		if (lastSource !== source) {
			subsRequested = false;
			recentRequested = false;
			queueRequested = false;
			progressRequested = false;
			podcasts = [];
			selectedPodcastId = null;
			episodes = [];
			recentEpisodes = [];
			queueEpisodes = [];
			progressEpisodes = [];
			lastSource = source;
		}
		if (!subsRequested) {
			subsRequested = true;
			loadSubscriptions();
		}
		// La file « à suivre » est chargée dès le montage (et pas seulement sur son onglet) :
		// elle alimente le player pour l'enchaînement automatique, quel que soit l'onglet
		// depuis lequel on lance une lecture.
		if (!queueRequested) {
			queueRequested = true;
			loadQueue();
		}
		if (subTab === 'recents' && !recentRequested) {
			recentRequested = true;
			loadRecent();
		}
		if (subTab === 'encours' && !progressRequested) {
			progressRequested = true;
			loadInProgress();
		}
	});

	function switchTab(tab: PodcastsSubTab) {
		subTab = tab;
		errorMessage = '';
	}

	function backToSubscriptions() {
		selectedPodcastId = null;
		episodes = [];
	}

	function goToConfig() {
		ui.activeSpace = 'config';
	}

	// Recherche/abonnement : dispatché selon la source active (annuaire iTunes en local, proxy
	// PinePods sinon) — le composant PodcastSearch reste générique, découplé des deux.
	function searchDiscovery(term: string): Promise<PinePodsSearchResult[]> {
		if (isLocal) return searchPodcastsItunes(term);
		const conn = pinepods.connection;
		if (!conn) return Promise.resolve([]);
		return searchPodcasts(conn, term);
	}
	async function subscribeDiscovery(result: PinePodsSearchResult): Promise<void> {
		if (isLocal) {
			await subscribeToFeed(result.feedurl);
			return;
		}
		const conn = pinepods.connection;
		if (!conn) return;
		await addPodcast(conn, result);
	}

	/**
	 * Abonnement par URL de flux RSS, pour les DEUX sources. Utile même avec PinePods : un
	 * podcast confidentiel peut manquer à l'annuaire de recherche alors que son flux est valide.
	 * Renvoie le nom du podcast quand la source le connaît (le local analyse le flux lui-même),
	 * sinon une chaîne vide — PinePods analyse le flux côté serveur et ne le renvoie pas.
	 */
	async function subscribeByFeed(feedUrl: string): Promise<string> {
		if (isLocal) {
			const pod = await subscribeToFeed(feedUrl);
			return pod.podcastname;
		}
		const conn = pinepods.connection;
		if (!conn) throw new PinePodsApiError('PinePods non connecté.');
		await addPodcastByFeed(conn, feedUrl);
		return '';
	}

	const selectedPodcast = $derived(podcasts.find((p) => p.podcastid === selectedPodcastId) ?? null);
</script>

{#if !ready}
	<PixelPanel>
		<h3>PinePods non connecté</h3>
		<p class="hint">
			Relie ton instance PinePods depuis l'onglet Configuration pour retrouver tes abonnements,
			épisodes et file d'attente ici — ou bascule sur « Podcasts intégrés » dans les
			préférences pour gérer tes abonnements directement dans l'app, sans serveur.
		</p>
		<button type="button" class="pixel-btn" onclick={goToConfig}>Aller à la configuration</button>
	</PixelPanel>
{:else}
	<PixelPanel>
		<div class="podcasts-toolbar">
			<div class="podcasts-subnav" role="tablist" aria-label="Sections des podcasts" use:tablist>
				{#each subTabs as tab (tab.id)}
					<button
						type="button"
						class="category-btn"
						style:--accent={tab.accent}
						role="tab"
						aria-selected={subTab === tab.id}
						tabindex={subTab === tab.id ? 0 : -1}
						class:is-active={subTab === tab.id}
						onclick={() => switchTab(tab.id)}
					>
						{tab.label}
					</button>
				{/each}
			</div>
			<button type="button" class="pixel-btn pixel-btn--ghost" onclick={goToConfig}> Configuration </button>
		</div>

		{#if errorMessage}
			<p class="error">{errorMessage}</p>
		{/if}

		{#if subTab === 'abonnements'}
			{#if selectedPodcastId}
				<button type="button" class="pixel-btn pixel-btn--ghost back-btn" onclick={backToSubscriptions}>
					← Retour aux abonnements
				</button>
				<h3>{selectedPodcast?.podcastname ?? 'Épisodes'}</h3>
				<PodcastSkipConfig podcastId={selectedPodcastId} />
				{#if loadingEpisodes}
					<p class="loading">Chargement des épisodes…</p>
				{:else}
					<PodcastEpisodeList
						episodes={displayedEpisodes}
						onToggleQueue={toggleQueue}
						onToggleCompleted={toggleCompleted}
						onPlay={markStarted}
						{isLocal}
					/>
				{/if}
			{:else if loadingSubs}
				<p class="loading">Chargement des abonnements…</p>
			{:else}
				<PodcastSubscriptions {podcasts} selectedId={selectedPodcastId} onSelect={selectPodcast} onUnsubscribe={unsubscribe} newCounts={newEpisodeCounts} />
			{/if}
		{:else if subTab === 'recents'}
			{#if loadingRecent}
				<p class="loading">Chargement des derniers épisodes…</p>
			{:else}
				<PodcastEpisodeList
					episodes={displayedRecent}
					showPodcastName
					emptyMessage="Aucun épisode récent."
					onToggleQueue={toggleQueue}
					onToggleCompleted={toggleCompleted}
					onPlay={markStarted}
					{isLocal}
				/>
			{/if}
		{:else if subTab === 'encours'}
			{#if loadingProgress && inProgressEpisodes.length === 0}
				<p class="loading">Chargement…</p>
			{:else}
				{#if loadingProgress}
					<!-- Une liste mémorisée est déjà affichée : on signale l'actualisation en cours
					     plutôt que de la remplacer par un écran vide. -->
					<p class="refreshing">Actualisation…</p>
				{/if}
				<PodcastEpisodeList
					episodes={inProgressEpisodes}
					showPodcastName
					emptyMessage="Aucun épisode en cours d’écoute."
					onToggleQueue={toggleQueue}
					onToggleCompleted={toggleCompleted}
					onPlay={markStarted}
					{isLocal}
				/>
			{/if}
		{:else if subTab === 'suivre'}
			<div class="suivre-toolbar">
				<p class="hint">
					Ajoute des épisodes ici (bouton « Ajouter à la file » sur n’importe quel épisode) : ils
					s’enchaînent automatiquement à la suite de la lecture en cours.
				</p>
				<button type="button" class="pixel-btn" disabled={displayedQueue.length === 0} onclick={playQueue}>
					▶ Lire la file
				</button>
			</div>
			{#if loadingQueue}
				<p class="loading">Chargement…</p>
			{:else}
				<PodcastEpisodeList
					episodes={displayedQueue}
					showPodcastName
					emptyMessage="File d’attente vide."
					onToggleQueue={toggleQueue}
					onToggleCompleted={toggleCompleted}
					onPlay={markStarted}
					{isLocal}
				/>
			{/if}
		{:else}
			<PodcastSearch search={searchDiscovery} subscribe={subscribeDiscovery} onSubscribed={loadSubscriptions} />
			<div class="manual-add">
				<span class="label-tag">Ou directement par URL de flux</span>
				<PodcastFeedAdd
					subscribe={subscribeByFeed}
					onSubscribed={loadSubscriptions}
					hint={isLocal
						? "Abonnement direct à un flux RSS, sans serveur. Colle l'URL du flux (souvent obtenue via « Copier le lien du flux RSS » sur la page du podcast)."
						: "Le flux est ajouté à ton serveur PinePods, qui l'analyse lui-même. Pratique pour un podcast absent de la recherche."}
				/>
				{#if isLocal}
					<!-- L'OPML de PinePods se gère depuis la Configuration (côté serveur). -->
					<LocalPodcastManage onSubscribed={loadSubscriptions} />
				{/if}
			</div>
		{/if}
	</PixelPanel>
{/if}

<style>
	.podcasts-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin-bottom: 1rem;
	}

	.podcasts-subnav {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
	}

	.error {
		color: var(--coral);
		margin-bottom: 0.75rem;
	}

	.loading {
		color: var(--muted);
	}

	/* Actualisation en fond, au-dessus d'une liste déjà affichée. */
	.refreshing {
		margin: 0 0 0.5rem;
		font-size: 0.75rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--gold);
	}

	.hint {
		color: var(--muted);
		margin: 0 0 0.75rem;
	}

	h3 {
		margin-bottom: 0.75rem;
	}

	.back-btn {
		margin-bottom: 0.75rem;
	}

	.suivre-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.manual-add {
		margin-top: 1.25rem;
		padding-top: 1rem;
		border-top: 2px solid var(--bezel);
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
</style>
