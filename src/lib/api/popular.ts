import type { PopularTrack } from '$lib/api/listenbrainzPopularity';

/**
 * Titres populaires d'un artiste via le proxy Deezer du serveur (`/api/artist-top`).
 * Renvoie [] si indisponible (build mobile statique sans serveur, ou erreur réseau) —
 * l'appelant bascule alors sur une autre source.
 */
export async function fetchPopularTracks(name: string): Promise<PopularTrack[]> {
	try {
		const res = await fetch(`/api/artist-top?name=${encodeURIComponent(name)}`);
		if (!res.ok) return [];
		const data = (await res.json()) as { tracks?: unknown };
		const list = Array.isArray(data.tracks) ? data.tracks : [];
		const out: PopularTrack[] = [];
		for (const item of list) {
			if (!item || typeof item !== 'object') continue;
			const t = item as Record<string, unknown>;
			if (typeof t.title !== 'string' || !t.title.trim()) continue;
			out.push({ title: t.title.trim(), artist: typeof t.artist === 'string' ? t.artist : '' });
		}
		return out;
	} catch {
		return [];
	}
}
