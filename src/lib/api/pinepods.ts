import type {
	PinePodsConnection,
	PinePodsEpisode,
	PinePodsPodcast,
	PinePodsSearchResult
} from '$lib/types';
import { mapLimit } from '$lib/concurrency';

/**
 * Endpoint paths verified directly against the PinePods rust-api source
 * (rust-api/src/handlers/podcasts.rs, rust-api/src/models.rs) and cross-checked against
 * the official web frontend's own request layer (web/src/requests/search_pods.rs,
 * episode.rs) to confirm exact request/response shapes — not just route names.
 */
const ENDPOINTS = {
	getKey: 'api/data/get_key',
	getUser: 'api/data/get_user',
	verifyMfaAndGetKey: 'api/data/verify_mfa_and_get_key',
	getPodcasts: (userId: number) => `api/data/return_pods/${userId}`,
	getEpisodes: (podcastId: number, userId: number, sortOrder: 'asc' | 'desc') =>
		`api/data/podcast_episodes?podcast_id=${podcastId}&user_id=${userId}&sort_by=date&sort_order=${sortOrder}`,
	recentEpisodes: (userId: number) => `api/data/return_episodes/${userId}`,
	proxySearch: (query: string, index: string) =>
		`api/data/proxy_search?query=${encodeURIComponent(query)}&index=${encodeURIComponent(index)}`,
	addPodcast: 'api/data/add_podcast',
	removePodcastId: 'api/data/remove_podcast_id',
	recordListenDuration: 'api/data/record_listen_duration',
	markEpisodeCompleted: 'api/data/mark_episode_completed',
	markEpisodeUncompleted: 'api/data/mark_episode_uncompleted',
	getQueue: (userId: number) => `api/data/get_queued_episodes?user_id=${userId}`,
	queuePod: 'api/data/queue_pod',
	removeQueuedPod: 'api/data/remove_queued_pod'
} as const;

export class PinePodsApiError extends Error {
	constructor(
		message: string,
		public status?: number
	) {
		super(message);
		this.name = 'PinePodsApiError';
	}
}

function normalizeBaseUrl(url: string): string {
	return url.replace(/\/+$/, '');
}

const REQUEST_TIMEOUT_MS = 20000;

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
	try {
		return await fetch(url, { ...init, signal: controller.signal });
	} catch (err) {
		if (err instanceof DOMException && err.name === 'AbortError') {
			throw new PinePodsApiError(`PinePods n'a pas répondu sur ${url} (délai dépassé).`);
		}
		throw new PinePodsApiError(
			`Impossible de joindre PinePods sur ${url} (réseau/CORS) : ${err instanceof Error ? err.message : err}`
		);
	} finally {
		clearTimeout(timeout);
	}
}

/** Resolves the user_id that an API key belongs to, so users only need to paste a token —
 * they don't need to know/find their own PinePods user_id. */
export async function getUserId(baseUrl: string, apiKey: string): Promise<number> {
	const base = normalizeBaseUrl(baseUrl);
	const res = await fetchWithTimeout(`${base}/${ENDPOINTS.getUser}`, {
		headers: { 'Api-Key': apiKey }
	});
	if (!res.ok) {
		throw new PinePodsApiError(`Token invalide ou refusé par PinePods (HTTP ${res.status}).`, res.status);
	}
	const data = await res.json();
	if (!data.retrieved_id) {
		throw new PinePodsApiError('Réponse PinePods inattendue : user_id manquant.');
	}
	return data.retrieved_id;
}

export type GetKeyResult =
	| { status: 'ok'; apiKey: string; userId: number }
	| { status: 'mfa_required'; mfaSessionToken: string };

export async function getApiKey(
	baseUrl: string,
	username: string,
	password: string
): Promise<GetKeyResult> {
	const base = normalizeBaseUrl(baseUrl);
	const res = await fetchWithTimeout(`${base}/${ENDPOINTS.getKey}`, {
		headers: {
			Authorization: `Basic ${btoa(`${username}:${password}`)}`
		}
	});
	if (!res.ok) {
		throw new PinePodsApiError(
			`Échec de connexion à PinePods (HTTP ${res.status}). Vérifie l'URL, l'identifiant et le mot de passe.`,
			res.status
		);
	}
	const data = await res.json();
	if (data.status === 'mfa_required') {
		return { status: 'mfa_required', mfaSessionToken: data.mfa_session_token };
	}
	if (!data.retrieved_key || !data.user_id) {
		throw new PinePodsApiError('Réponse PinePods inattendue : clé API ou user_id manquant.');
	}
	return { status: 'ok', apiKey: data.retrieved_key, userId: data.user_id };
}

async function request<T>(conn: PinePodsConnection, path: string, init: RequestInit = {}): Promise<T> {
	const base = normalizeBaseUrl(conn.baseUrl);
	const res = await fetchWithTimeout(`${base}/${path}`, {
		...init,
		headers: {
			'Api-Key': conn.apiKey,
			...(init.body ? { 'Content-Type': 'application/json' } : {}),
			...init.headers
		}
	});
	if (!res.ok) {
		throw new PinePodsApiError(`PinePods a répondu ${res.status} sur ${path}`, res.status);
	}
	if (res.status === 204) return undefined as T;
	return (await res.json()) as T;
}

/**
 * Several PinePods episode-shaped endpoints disagree on casing (`podcast_episodes` returns
 * `Episodetitle`/`Episodeid`/etc. capitalized, `return_episodes`/`get_queued_episodes` return
 * lowercase) — confirmed by the official web frontend's `Episode` struct, which declares
 * `#[serde(alias = "Episodetitle")]` etc. specifically to tolerate both. This normalizer does
 * the same on the JS side, and backfills `podcastid` (absent from `podcast_episodes` responses)
 * from the call-site context when provided.
 */
function normalizeEpisode(raw: Record<string, unknown>, fallbackPodcastId?: number): PinePodsEpisode {
	const pick = (...keys: string[]): unknown => {
		for (const key of keys) {
			if (raw[key] !== undefined && raw[key] !== null) return raw[key];
		}
		return undefined;
	};
	return {
		episodeid: Number(pick('episodeid', 'Episodeid') ?? 0),
		episodetitle: String(pick('episodetitle', 'Episodetitle', 'title') ?? ''),
		podcastname: String(pick('podcastname', 'feedTitle') ?? ''),
		podcastid: Number(pick('podcastid') ?? fallbackPodcastId ?? 0),
		episodepubdate: String(pick('episodepubdate', 'Episodepubdate', 'pub_date') ?? ''),
		episodedescription: String(pick('episodedescription', 'Episodedescription', 'description') ?? ''),
		episodeartwork: String(pick('episodeartwork', 'Episodeartwork', 'artwork', 'image') ?? ''),
		episodeurl: String(pick('episodeurl', 'Episodeurl', 'enclosure_url', 'enclosureUrl') ?? ''),
		episodeduration: Number(pick('episodeduration', 'Episodeduration', 'duration') ?? 0),
		listenduration: Number(pick('listenduration', 'Listenduration') ?? 0),
		websiteurl: String(pick('websiteurl', 'link') ?? ''),
		completed: Boolean(pick('completed', 'Completed') ?? false),
		saved: Boolean(pick('saved', 'is_saved') ?? false),
		queued: Boolean(pick('queued', 'is_queued') ?? false),
		downloaded: Boolean(pick('downloaded', 'is_downloaded') ?? false),
		is_youtube: Boolean(pick('is_youtube') ?? false)
	};
}

function extractEpisodeArray(data: unknown): Record<string, unknown>[] {
	if (Array.isArray(data)) return data as Record<string, unknown>[];
	const obj = data as Record<string, unknown>;
	const candidate = obj.episodes ?? obj.data;
	return Array.isArray(candidate) ? (candidate as Record<string, unknown>[]) : [];
}

export async function listPodcasts(conn: PinePodsConnection): Promise<PinePodsPodcast[]> {
	const data = await request<{ pods?: PinePodsPodcast[] } | PinePodsPodcast[]>(
		conn,
		ENDPOINTS.getPodcasts(conn.userId)
	);
	return Array.isArray(data) ? data : (data.pods ?? []);
}

export async function listEpisodes(
	conn: PinePodsConnection,
	podcastId: number,
	sortOrder: 'asc' | 'desc' = 'desc'
): Promise<PinePodsEpisode[]> {
	const data = await request<unknown>(conn, ENDPOINTS.getEpisodes(podcastId, conn.userId, sortOrder));
	return extractEpisodeArray(data).map((raw) => normalizeEpisode(raw, podcastId));
}

export async function homeOverview(conn: PinePodsConnection): Promise<PinePodsEpisode[]> {
	const data = await request<unknown>(conn, ENDPOINTS.recentEpisodes(conn.userId));
	return extractEpisodeArray(data).map((raw) => normalizeEpisode(raw));
}

/**
 * Épisodes « en cours » (progression partielle, non terminés) sur TOUS les abonnements.
 * PinePods n'expose pas de flux « en cours » dédié : `return_episodes` ne liste que les
 * épisodes récemment publiés, donc un épisode plus ancien dont on a écouté une partie n'y
 * figure jamais. On interroge ici chaque podcast abonné via l'endpoint vérifié
 * `podcast_episodes` (concurrence bornée), puis on ne garde que ceux avec une progression
 * réelle et non terminés — c'est la source de vérité côté PinePods pour « En cours ».
 */
export async function listInProgressEpisodes(
	conn: PinePodsConnection,
	podcastIds: number[]
): Promise<PinePodsEpisode[]> {
	const perPodcast = await mapLimit(podcastIds, 6, (podcastId) =>
		listEpisodes(conn, podcastId, 'desc').catch(() => [] as PinePodsEpisode[])
	);
	return perPodcast.flat().filter((ep) => ep.listenduration > 0 && !ep.completed);
}

export async function getQueue(conn: PinePodsConnection): Promise<PinePodsEpisode[]> {
	const data = await request<unknown>(conn, ENDPOINTS.getQueue(conn.userId));
	return extractEpisodeArray(data).map((raw) => normalizeEpisode(raw));
}

/** PinePods proxies external podcast discovery through `/api/data/proxy_search`. PodcastIndex
 * ("podcastindex") responses come back as `{status, feeds: [...]}`; iTunes ("itunes") as
 * `{resultCount, results: [...]}` — both shapes are normalized here. */
export async function searchPodcasts(conn: PinePodsConnection, term: string): Promise<PinePodsSearchResult[]> {
	const data = await request<Record<string, unknown>>(conn, ENDPOINTS.proxySearch(term, 'podcastindex'));

	const feeds = data.feeds as Record<string, unknown>[] | undefined;
	if (Array.isArray(feeds)) {
		return feeds.map((f) => ({
			podcastname: String(f.title ?? ''),
			feedurl: String(f.url ?? f.originalUrl ?? ''),
			artworkurl: String(f.artwork ?? f.image ?? ''),
			description: String(f.description ?? ''),
			author: String(f.author ?? f.ownerName ?? ''),
			episodecount: Number(f.episodeCount ?? 0),
			podcastindexid: Number(f.id ?? 0),
			websiteurl: String(f.link ?? ''),
			explicit: Boolean(f.explicit ?? false),
			categories: (f.categories as Record<string, string>) ?? {}
		}));
	}

	const results = data.results as Record<string, unknown>[] | undefined;
	if (Array.isArray(results)) {
		return results.map((r) => ({
			podcastname: String(r.trackName ?? ''),
			feedurl: String(r.feedUrl ?? ''),
			artworkurl: String(r.artworkUrl100 ?? ''),
			description: '',
			author: String(r.artistName ?? ''),
			episodecount: Number(r.trackCount ?? 0),
			podcastindexid: 0,
			websiteurl: String(r.collectionViewUrl ?? ''),
			explicit: r.collectionExplicitness === 'explicit',
			categories: {}
		}));
	}

	return [];
}

/** Builds the (oddly-shaped, nested) request `add_podcast` expects. In practice PinePods
 * re-parses the feed itself server-side and only falls back to pod_title/pod_description/
 * pod_website from this payload when its own parse is incomplete — pod_feed_url and user_id
 * are what actually matter. */
export async function addPodcast(conn: PinePodsConnection, result: PinePodsSearchResult): Promise<void> {
	await request(conn, ENDPOINTS.addPodcast, {
		method: 'POST',
		body: JSON.stringify({
			podcast_values: {
				pod_title: result.podcastname,
				pod_artwork: result.artworkurl,
				pod_author: result.author,
				categories: result.categories ?? {},
				pod_description: result.description,
				pod_episode_count: result.episodecount ?? 0,
				pod_feed_url: result.feedurl,
				pod_website: result.websiteurl ?? '',
				pod_explicit: result.explicit ?? false,
				user_id: conn.userId
			},
			podcast_index_id: result.podcastindexid || null
		})
	});
}

/** Abonne à un podcast à partir de sa seule URL de flux (import OPML). PinePods re-parse le
 * flux côté serveur ; seul pod_feed_url compte réellement, le titre n'est qu'un repli. */
export async function addPodcastByFeed(
	conn: PinePodsConnection,
	feedUrl: string,
	title = ''
): Promise<void> {
	await addPodcast(conn, {
		podcastname: title,
		feedurl: feedUrl,
		artworkurl: '',
		description: '',
		author: '',
		episodecount: 0,
		podcastindexid: 0,
		websiteurl: '',
		explicit: false,
		categories: {}
	});
}

export async function removePodcast(conn: PinePodsConnection, podcastId: number): Promise<void> {
	await request(conn, ENDPOINTS.removePodcastId, {
		method: 'POST',
		body: JSON.stringify({ user_id: conn.userId, podcast_id: podcastId })
	});
}

export async function saveEpisodePosition(
	conn: PinePodsConnection,
	episodeId: number,
	positionSec: number
): Promise<void> {
	await request(conn, ENDPOINTS.recordListenDuration, {
		method: 'POST',
		body: JSON.stringify({
			user_id: conn.userId,
			episode_id: episodeId,
			listen_duration: positionSec,
			is_youtube: false
		})
	});
}

export async function markEpisodeCompleted(conn: PinePodsConnection, episodeId: number): Promise<void> {
	await request(conn, ENDPOINTS.markEpisodeCompleted, {
		method: 'POST',
		body: JSON.stringify({ user_id: conn.userId, episode_id: episodeId, is_youtube: false })
	});
}

export async function markEpisodeUncompleted(conn: PinePodsConnection, episodeId: number): Promise<void> {
	await request(conn, ENDPOINTS.markEpisodeUncompleted, {
		method: 'POST',
		body: JSON.stringify({ user_id: conn.userId, episode_id: episodeId, is_youtube: false })
	});
}

export async function addToQueue(conn: PinePodsConnection, episodeId: number): Promise<void> {
	await request(conn, ENDPOINTS.queuePod, {
		method: 'POST',
		body: JSON.stringify({ user_id: conn.userId, episode_id: episodeId, is_youtube: false })
	});
}

export async function removeFromQueue(conn: PinePodsConnection, episodeId: number): Promise<void> {
	await request(conn, ENDPOINTS.removeQueuedPod, {
		method: 'POST',
		body: JSON.stringify({ user_id: conn.userId, episode_id: episodeId, is_youtube: false })
	});
}
