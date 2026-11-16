import { error } from '@sveltejs/kit';

/**
 * Accès serveur à l'API publique Deezer (gratuite, sans clé). Proxifié côté serveur car
 * api.deezer.com n'envoie pas d'en-têtes CORS. Hôte fixe → pas de SSRF.
 */

const TIMEOUT_MS = 12000;

export async function deezer<T>(path: string): Promise<T> {
	const res = await fetch(`https://api.deezer.com${path}`, {
		headers: { Accept: 'application/json' },
		signal: AbortSignal.timeout(TIMEOUT_MS)
	});
	if (!res.ok) throw error(502, 'Deezer indisponible.');
	return (await res.json()) as T;
}

type DeezerSearch = { data?: { id: number; name: string; nb_fan?: number; nb_album?: number }[] };

export function normalizeArtistName(s: string): string {
	return s
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '') // retire les diacritiques (å → a, é → e…)
		.toLowerCase()
		.trim();
}

/**
 * Identifiant Deezer d'un artiste d'après son nom, ou null.
 *
 * Un simple « premier résultat » est faux : Deezer classe parfois un doublon quasi vide avant le
 * vrai artiste (constaté : « Måneskin » renvoie d'abord « Maneskin », 0 album, 43 fans, top vide,
 * AVANT le vrai — 21 albums, 1M+ fans). On départage par nombre de fans, mais SEULEMENT parmi les
 * résultats dont le nom correspond réellement (diacritiques ignorés) : sans ce filtre, un
 * homonyme partiel très suivi (« Marilyn Manson » pour « Måneskin ») prendrait la place à tort.
 */
export async function resolveArtistId(name: string): Promise<number | null> {
	const search = await deezer<DeezerSearch>(`/search/artist?q=${encodeURIComponent(name)}&limit=5`);
	const candidates = search.data ?? [];
	if (candidates.length === 0) return null;
	const query = normalizeArtistName(name);
	const sameName = candidates.filter((c) => normalizeArtistName(c.name) === query);
	const pool = sameName.length > 0 ? sameName : candidates;
	return pool.reduce((a, b) => ((b.nb_fan ?? 0) > (a.nb_fan ?? 0) ? b : a)).id;
}
