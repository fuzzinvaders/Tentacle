import type { LastfmConnection } from '$lib/stores/lastfm.svelte';

/**
 * Client Last.fm. Toutes les requêtes passent par le proxy signé /api/lastfm (le secret
 * partagé ne doit jamais servir à signer côté navigateur d'une façon qu'on pourrait
 * confondre avec une politique de sécurité — ici il est simplement transmis avec chaque
 * requête, comme la clé API Lidarr, et le serveur calcule la signature).
 */

export class LastfmApiError extends Error {}

type Credentials = { apiKey: string; secret: string; sessionKey?: string };

async function call(creds: Credentials, method: string, params: Record<string, string> = {}): Promise<any> {
	const res = await fetch('/api/lastfm', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			apiKey: creds.apiKey,
			secret: creds.secret,
			sessionKey: creds.sessionKey,
			method,
			params
		})
	});
	const data = await res.json().catch(() => null);
	if (!res.ok) {
		throw new LastfmApiError(
			data?.message ? String(data.message) : `Last.fm a répondu ${res.status}.`
		);
	}
	return data;
}

/** Étape 1 du mini-flux d'autorisation : jeton temporaire. */
export async function getToken(apiKey: string, secret: string): Promise<string> {
	const data = await call({ apiKey, secret }, 'auth.getToken');
	const token = data?.token;
	if (typeof token !== 'string' || !token) throw new LastfmApiError('Réponse Last.fm inattendue (jeton manquant).');
	return token;
}

/** URL à ouvrir pour que l'utilisateur autorise l'accès sur last.fm. */
export function getAuthUrl(apiKey: string, token: string): string {
	return `https://www.last.fm/api/auth/?api_key=${encodeURIComponent(apiKey)}&token=${encodeURIComponent(token)}`;
}

/** Étape 3 : échange le jeton (autorisé par l'utilisateur) contre une clé de session durable. */
export async function getSession(
	apiKey: string,
	secret: string,
	token: string
): Promise<{ sessionKey: string; username: string }> {
	const data = await call({ apiKey, secret }, 'auth.getSession', { token });
	const key = data?.session?.key;
	const name = data?.session?.name;
	if (typeof key !== 'string' || !key) {
		throw new LastfmApiError("Autorisation refusée ou pas encore validée sur Last.fm.");
	}
	return { sessionKey: key, username: typeof name === 'string' ? name : '' };
}

export async function updateNowPlaying(
	conn: LastfmConnection,
	track: { track: string; artist: string; album?: string }
): Promise<void> {
	await call(conn, 'track.updateNowPlaying', {
		track: track.track,
		artist: track.artist,
		...(track.album ? { album: track.album } : {})
	});
}

export async function scrobble(
	conn: LastfmConnection,
	track: { track: string; artist: string; album?: string; timestampSec: number }
): Promise<void> {
	await call(conn, 'track.scrobble', {
		track: track.track,
		artist: track.artist,
		...(track.album ? { album: track.album } : {}),
		timestamp: String(track.timestampSec)
	});
}
