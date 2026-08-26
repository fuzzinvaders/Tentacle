import { browser } from '$app/environment';

const FEEDS_KEY = 'tentacle:local-podcasts';
const STATE_KEY = 'tentacle:local-podcast-state';
const QUEUE_KEY = 'tentacle:local-podcast-queue';
const SEEN_KEY = 'tentacle:local-podcast-seen';

/** Abonnement à un flux RSS géré directement dans l'app (sans PinePods). Les métadonnées
 * sont rafraîchies à chaque analyse réussie du flux ; la liste d'épisodes, elle, n'est PAS
 * persistée ici (trop volumineuse) : elle est reparsée à la demande depuis le flux, comme
 * PinePods le ferait via son API — seuls progression/complétion/file le sont. */
export type LocalFeedMeta = {
	feedUrl: string;
	title: string;
	artworkUrl: string;
	author: string;
	description: string;
};

export type LocalEpisodeState = {
	/** Permet de purger l'état d'un épisode quand son abonnement est retiré. */
	podcastId: number;
	listenSec: number;
	completed: boolean;
	queued: boolean;
};

function loadJson<T>(key: string, fallback: T): T {
	if (!browser) return fallback;
	try {
		const raw = localStorage.getItem(key);
		if (!raw) return fallback;
		const data = JSON.parse(raw);
		return data && typeof data === 'object' ? data : fallback;
	} catch {
		return fallback;
	}
}

/**
 * Podcasts « locaux » : abonnements RSS gérés entièrement dans l'app (pas de serveur requis),
 * pour les utilisateurs sans PinePods. Coexiste avec PinePods (voir réglage `podcastSource`) —
 * mêmes composants d'affichage (PodcastEpisodeList, etc.) via des objets façonnés comme les
 * types PinePods (PinePodsPodcast/PinePodsEpisode), avec des ids numériques dérivés par hash
 * (voir [[rss.ts]]) plutôt qu'attribués par un serveur.
 */
class LocalPodcastsStore {
	feeds = $state<Record<number, LocalFeedMeta>>(loadJson(FEEDS_KEY, {}));
	episodeState = $state<Record<number, LocalEpisodeState>>(loadJson(STATE_KEY, {}));
	/** Ordre FIFO de la file « à suivre » (ids d'épisodes). */
	queueOrder = $state<number[]>(loadJson(QUEUE_KEY, []));
	/** Dernière visite de l'écran des épisodes de chaque abonnement (epoch ms) — sert à compter
	 * les « nouveaux » épisodes (publiés après cette date) pour le badge sur les cartes. */
	lastSeenAt = $state<Record<number, number>>(loadJson(SEEN_KEY, {}));

	// ---- Abonnements ----

	list(): Array<LocalFeedMeta & { podcastId: number }> {
		return Object.entries(this.feeds).map(([id, meta]) => ({ ...meta, podcastId: Number(id) }));
	}

	has(podcastId: number): boolean {
		return podcastId in this.feeds;
	}

	get(podcastId: number): LocalFeedMeta | undefined {
		return this.feeds[podcastId];
	}

	/** Ajoute/rafraîchit un abonnement (appelé à l'abonnement ET à chaque analyse réussie du
	 * flux, pour garder titre/pochette à jour sans action de l'utilisateur). */
	upsert(podcastId: number, meta: LocalFeedMeta) {
		this.feeds[podcastId] = meta;
		this.saveFeeds();
	}

	/** Désabonne et purge tout l'état (progression/complétion/file) des épisodes de ce podcast. */
	remove(podcastId: number) {
		delete this.feeds[podcastId];
		this.saveFeeds();
		for (const [idStr, st] of Object.entries(this.episodeState)) {
			if (st.podcastId === podcastId) delete this.episodeState[Number(idStr)];
		}
		this.saveState();
		this.queueOrder = this.queueOrder.filter((id) => this.episodeState[id] !== undefined);
		this.saveQueue();
		delete this.lastSeenAt[podcastId];
		this.saveSeen();
	}

	// ---- Nouveaux épisodes (badge) ----

	getLastSeenAt(podcastId: number): number {
		return this.lastSeenAt[podcastId] ?? 0;
	}

	markSeen(podcastId: number, atMs: number = Date.now()) {
		this.lastSeenAt[podcastId] = atMs;
		this.saveSeen();
	}

	// ---- Progression / complétion / file par épisode ----

	getEpisodeState(episodeId: number): LocalEpisodeState | undefined {
		return this.episodeState[episodeId];
	}

	private ensure(episodeId: number, podcastId: number): LocalEpisodeState {
		return (this.episodeState[episodeId] ??= {
			podcastId,
			listenSec: 0,
			completed: false,
			queued: false
		});
	}

	setListenSec(episodeId: number, podcastId: number, sec: number) {
		const st = this.ensure(episodeId, podcastId);
		st.listenSec = Math.max(0, Math.floor(sec));
		this.saveState();
	}

	setCompleted(episodeId: number, podcastId: number, completed: boolean) {
		const st = this.ensure(episodeId, podcastId);
		st.completed = completed;
		this.saveState();
	}

	isQueued(episodeId: number): boolean {
		return this.episodeState[episodeId]?.queued ?? false;
	}

	toggleQueued(episodeId: number, podcastId: number) {
		const st = this.ensure(episodeId, podcastId);
		st.queued = !st.queued;
		if (st.queued) {
			if (!this.queueOrder.includes(episodeId)) this.queueOrder = [...this.queueOrder, episodeId];
		} else {
			this.queueOrder = this.queueOrder.filter((id) => id !== episodeId);
		}
		this.saveState();
		this.saveQueue();
	}

	removeFromQueue(episodeId: number) {
		const st = this.episodeState[episodeId];
		if (st) st.queued = false;
		this.queueOrder = this.queueOrder.filter((id) => id !== episodeId);
		this.saveState();
		this.saveQueue();
	}

	// ---- Sauvegarde/restauration (BackupManager) ----

	allFeeds(): Record<number, LocalFeedMeta> {
		return { ...this.feeds };
	}
	allState(): Record<number, LocalEpisodeState> {
		return { ...this.episodeState };
	}
	allQueue(): number[] {
		return [...this.queueOrder];
	}
	replaceAll(feeds: Record<number, LocalFeedMeta>, state: Record<number, LocalEpisodeState>, queue: number[]) {
		this.feeds = { ...feeds };
		this.episodeState = { ...state };
		this.queueOrder = [...queue];
		this.saveFeeds();
		this.saveState();
		this.saveQueue();
	}

	private saveFeeds() {
		if (!browser) return;
		try {
			localStorage.setItem(FEEDS_KEY, JSON.stringify(this.feeds));
		} catch {
			/* quota / mode privé : confort, non critique */
		}
	}
	private saveState() {
		if (!browser) return;
		try {
			localStorage.setItem(STATE_KEY, JSON.stringify(this.episodeState));
		} catch {
			/* idem */
		}
	}
	private saveQueue() {
		if (!browser) return;
		try {
			localStorage.setItem(QUEUE_KEY, JSON.stringify(this.queueOrder));
		} catch {
			/* idem */
		}
	}
	private saveSeen() {
		if (!browser) return;
		try {
			localStorage.setItem(SEEN_KEY, JSON.stringify(this.lastSeenAt));
		} catch {
			/* idem */
		}
	}
}

export const localPodcasts = new LocalPodcastsStore();
