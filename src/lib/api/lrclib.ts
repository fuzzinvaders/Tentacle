import { parseLrc, type LrcLine } from '$lib/lrc';

/**
 * Client LRCLIB (lrclib.net) : paroles synchronisées, base communautaire gratuite et sans clé.
 * L'API autorise le CORS → appelable directement depuis le navigateur.
 */

const BASE = 'https://lrclib.net/api';

export type Lyrics = { synced: LrcLine[]; plain: string | null };

type LrclibResult = { syncedLyrics?: string | null; plainLyrics?: string | null };

function toLyrics(r: LrclibResult | null | undefined): Lyrics | null {
	if (!r) return null;
	const synced = r.syncedLyrics ? parseLrc(r.syncedLyrics) : [];
	const plain = r.plainLyrics ?? null;
	if (synced.length === 0 && !plain) return null;
	return { synced, plain };
}

export async function getLyrics(opts: {
	title: string;
	artist: string;
	album?: string;
	durationSec?: number;
}): Promise<Lyrics | null> {
	// 1. Correspondance exacte (avec durée si connue) — la plus fiable.
	try {
		const q = new URLSearchParams({ track_name: opts.title, artist_name: opts.artist });
		if (opts.album) q.set('album_name', opts.album);
		if (opts.durationSec && opts.durationSec > 0) q.set('duration', String(Math.round(opts.durationSec)));
		const res = await fetch(`${BASE}/get?${q.toString()}`);
		if (res.ok) {
			const j = toLyrics((await res.json()) as LrclibResult);
			if (j) return j;
		}
	} catch {
		/* réseau/CORS : on tente la recherche */
	}
	// 2. Repli : recherche (sans durée) et préférence pour les paroles synchronisées.
	try {
		const q = new URLSearchParams({ track_name: opts.title, artist_name: opts.artist });
		const res = await fetch(`${BASE}/search?${q.toString()}`);
		if (res.ok) {
			const arr = (await res.json()) as LrclibResult[];
			const list = Array.isArray(arr) ? arr : [];
			return toLyrics(list.find((r) => r.syncedLyrics) ?? list[0]);
		}
	} catch {
		/* indisponible */
	}
	return null;
}
