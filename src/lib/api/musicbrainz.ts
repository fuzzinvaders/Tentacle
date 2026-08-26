import { fetchWithTimeout, ApiError } from '$lib/http';
import { pickBestAlbum, type MbRecordingResponse, type ResolvedAlbum } from '$lib/api/musicbrainzSelect';

export { ApiError as MusicBrainzApiError };
export type { ResolvedAlbum };

/**
 * Client MusicBrainz minimal : résout un enregistrement (recording MBID, fourni
 * par les playlists ListenBrainz) vers son album (release group MBID) pour
 * Lidarr. L'API MusicBrainz autorise le CORS mais impose ~1 requête/seconde :
 * toutes les requêtes passent par une file throttlée.
 */

const BASE = 'https://musicbrainz.org/ws/2';
const MIN_INTERVAL_MS = 1100;

let queue: Promise<unknown> = Promise.resolve();
let lastCallAt = 0;

function throttled<T>(fn: () => Promise<T>): Promise<T> {
	const next = queue.then(async () => {
		const wait = lastCallAt + MIN_INTERVAL_MS - Date.now();
		if (wait > 0) await new Promise((r) => setTimeout(r, wait));
		lastCallAt = Date.now();
		return fn();
	});
	queue = next.catch(() => {});
	return next;
}

async function mbGet<T>(path: string): Promise<T> {
	return throttled(async () => {
		const res = await fetchWithTimeout(`${BASE}${path}`, {
			headers: { Accept: 'application/json' }
		});
		if (!res.ok) throw new ApiError(`MusicBrainz a répondu ${res.status}.`, res.status);
		return (await res.json()) as T;
	});
}

/**
 * recording MBID → meilleur album : privilégie l'album studio officiel le plus
 * ancien (voir pickBestAlbum). Récupère la donnée MusicBrainz puis délègue la
 * sélection à la fonction pure testée.
 */
export async function resolveRecordingToAlbum(recordingMbid: string): Promise<ResolvedAlbum | null> {
	const data = await mbGet<MbRecordingResponse>(
		`/recording/${encodeURIComponent(recordingMbid)}?inc=releases+release-groups+artist-credits&fmt=json`
	);
	return pickBestAlbum(data);
}

type MbArtistSearchResponse = { artists?: { id: string; score?: number }[] };

/** Recherche l'identifiant MusicBrainz d'un artiste par son nom (repli quand Jellyfin ne
 * fournit pas le ProviderId). Renvoie null si aucune correspondance fiable. */
export async function searchArtistMbid(name: string): Promise<string | null> {
	const clean = name.replace(/["\\]/g, ' ').trim();
	if (!clean) return null;
	const data = await mbGet<MbArtistSearchResponse>(
		`/artist?query=artist:"${encodeURIComponent(clean)}"&limit=1&fmt=json`
	);
	const top = data.artists?.[0];
	if (!top || (top.score ?? 0) < 85) return null;
	return top.id;
}

type MbSearchResponse = { recordings?: { id: string; score?: number }[] };

/** Recherche texte (pistes sans MBID) : titre + artiste → recording MBID le plus probable. */
export async function searchRecordingMbid(title: string, artist: string): Promise<string | null> {
	const escape = (s: string) => s.replace(/["\\]/g, ' ').trim();
	const query = `recording:"${escape(title)}" AND artist:"${escape(artist)}"`;
	const data = await mbGet<MbSearchResponse>(
		`/recording?query=${encodeURIComponent(query)}&limit=3&fmt=json`
	);
	const top = data.recordings?.[0];
	// Score < 80 = correspondance douteuse ; mieux vaut échouer que demander le mauvais album.
	if (!top || (top.score ?? 0) < 80) return null;
	return top.id;
}
