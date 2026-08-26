import { fetchWithTimeout, ApiError } from '$lib/http';
import type { ListenBrainzConnection } from '$lib/stores/listenbrainz.svelte';
import type { LBPlaylist, LBTrack } from '$lib/types';
import { parsePlaylistList, parsePlaylistTracks, type JspfTrack } from '$lib/jspf';
import { parseTopRecordings, type PopularTrack } from '$lib/api/listenbrainzPopularity';

export type { PopularTrack };

export { ApiError as ListenBrainzApiError };

const BASE_URL = 'https://api.listenbrainz.org';

function authHeaders(token: string): HeadersInit {
	return { Authorization: `Token ${token}` };
}

async function lbGet<T>(path: string, token?: string): Promise<T> {
	const res = await fetchWithTimeout(`${BASE_URL}${path}`, {
		headers: token ? authHeaders(token) : undefined
	});
	if (!res.ok) {
		throw new ApiError(`ListenBrainz a répondu ${res.status} sur ${path}.`, res.status);
	}
	return (await res.json()) as T;
}

export type ListenInput = {
	trackName: string;
	artistName: string;
	releaseName?: string;
	/** secondes epoch ; ignoré pour playing_now. */
	listenedAt?: number;
	/** true = « en écoute » (pas d'historique) ; false/omis = écoute confirmée (single). */
	playingNow?: boolean;
};

/**
 * Soumet une écoute à ListenBrainz — `POST /1/submit-listens`.
 * - playing_now : au démarrage d'un titre (affichage « en écoute », non historisé) ;
 * - single : quand l'écoute est confirmée (seuil de durée), avec listened_at.
 * Nécessite le token du compte. Best-effort côté appelant (le scrobbling ne doit jamais
 * gêner la lecture).
 */
export async function submitListen(conn: ListenBrainzConnection, input: ListenInput): Promise<void> {
	const track_metadata = {
		artist_name: input.artistName,
		track_name: input.trackName,
		...(input.releaseName ? { release_name: input.releaseName } : {}),
		additional_info: { submission_client: 'Tentacle', music_service_name: 'Jellyfin' }
	};
	const body = input.playingNow
		? { listen_type: 'playing_now', payload: [{ track_metadata }] }
		: {
				listen_type: 'single',
				payload: [{ listened_at: input.listenedAt ?? Math.floor(Date.now() / 1000), track_metadata }]
			};
	const res = await fetchWithTimeout(`${BASE_URL}/1/submit-listens`, {
		method: 'POST',
		headers: { ...authHeaders(conn.token), 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
	if (!res.ok) {
		throw new ApiError(`ListenBrainz a refusé l'écoute (HTTP ${res.status}).`, res.status);
	}
}

export type ValidateTokenResult = { valid: boolean; userName?: string };

/** Validates a personal token and resolves the account's user name — `GET /1/validate-token`. */
export async function validateToken(token: string): Promise<ValidateTokenResult> {
	const data = await lbGet<{ valid?: boolean; user_name?: string }>('/1/validate-token', token);
	return { valid: Boolean(data.valid), userName: data.user_name };
}

// NB: playlist reads are sent WITHOUT the Authorization header. These endpoints serve public
// playlists, and omitting the header keeps the request a "simple" CORS GET (no preflight) —
// ListenBrainz's per-route OPTIONS handling is inconsistent and the preflight fails on the
// user-playlist routes even though the GET itself is CORS-enabled.

/** Playlists the user created themselves (public ones). */
export async function getUserPlaylists(conn: ListenBrainzConnection): Promise<LBPlaylist[]> {
	const data = await lbGet<{ playlists?: unknown[] }>(
		`/1/user/${encodeURIComponent(conn.userName)}/playlists?count=25`
	);
	return parsePlaylistList(data);
}

/** Algorithmic "mixes" ListenBrainz generates for the user (Weekly/Daily Jams, Exploration…). */
export async function getCreatedForPlaylists(conn: ListenBrainzConnection): Promise<LBPlaylist[]> {
	const data = await lbGet<{ playlists?: unknown[] }>(
		`/1/user/${encodeURIComponent(conn.userName)}/playlists/createdfor?count=25`
	);
	return parsePlaylistList(data);
}

/** Full track list of a playlist (JSPF) — `GET /1/playlist/{mbid}`. */
export async function getPlaylistTracks(mbid: string): Promise<LBTrack[]> {
	const data = await lbGet<{ playlist?: { track?: JspfTrack[] } }>(
		`/1/playlist/${encodeURIComponent(mbid)}`
	);
	return parsePlaylistTracks(data);
}

export type StatsRange = 'week' | 'month' | 'year' | 'all_time';
export type ArtistStat = { name: string; listenCount: number; mbid?: string };
export type RecordingStat = { name: string; artist: string; listenCount: number };

/**
 * Statistiques d'écoute publiques d'un utilisateur ListenBrainz. Les endpoints `/1/stats/user/…`
 * renvoient 204 tant que les stats ne sont pas (encore) calculées → on renvoie une liste vide
 * plutôt qu'une erreur. Lecture seule, sans token (CORS GET simple).
 */
export async function getUserTopArtists(
	userName: string,
	range: StatsRange = 'month',
	count = 25
): Promise<ArtistStat[]> {
	const res = await fetchWithTimeout(
		`${BASE_URL}/1/stats/user/${encodeURIComponent(userName)}/artists?count=${count}&range=${range}`
	);
	if (res.status === 204) return [];
	if (!res.ok) throw new ApiError(`ListenBrainz stats a répondu ${res.status}.`, res.status);
	const data = (await res.json()) as {
		payload?: { artists?: { artist_name?: string; listen_count?: number; artist_mbid?: string }[] };
	};
	return (data.payload?.artists ?? []).map((a) => ({
		name: a.artist_name ?? '',
		listenCount: a.listen_count ?? 0,
		mbid: a.artist_mbid
	}));
}

export async function getUserTopRecordings(
	userName: string,
	range: StatsRange = 'month',
	count = 25
): Promise<RecordingStat[]> {
	const res = await fetchWithTimeout(
		`${BASE_URL}/1/stats/user/${encodeURIComponent(userName)}/recordings?count=${count}&range=${range}`
	);
	if (res.status === 204) return [];
	if (!res.ok) throw new ApiError(`ListenBrainz stats a répondu ${res.status}.`, res.status);
	const data = (await res.json()) as {
		payload?: { recordings?: { track_name?: string; artist_name?: string; listen_count?: number }[] };
	};
	return (data.payload?.recordings ?? []).map((r) => ({
		name: r.track_name ?? '',
		artist: r.artist_name ?? '',
		listenCount: r.listen_count ?? 0
	}));
}

/**
 * Titres les plus écoutés (globalement) d'un artiste, via l'endpoint public de popularité
 * ListenBrainz — `GET /1/popularity/top-recordings-for-artist/{artist_mbid}`. Aucun token requis.
 */
export async function getTopRecordingsForArtist(artistMbid: string): Promise<PopularTrack[]> {
	const data = await lbGet<unknown>(
		`/1/popularity/top-recordings-for-artist/${encodeURIComponent(artistMbid)}`
	);
	return parseTopRecordings(data);
}
