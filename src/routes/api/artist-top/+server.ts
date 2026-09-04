import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Titres les plus populaires d'un artiste, via l'API publique Deezer (gratuite, sans clé).
 * Proxifié côté serveur car api.deezer.com n'envoie pas d'en-têtes CORS — le navigateur ne
 * peut pas l'appeler directement. Utilisé pour « Titres populaires » (l'endpoint de popularité
 * ListenBrainz étant actuellement désactivé côté LB).
 *
 * Sécurité : hôte fixe (api.deezer.com), aucun paramètre d'URL arbitraire → pas de SSRF ;
 * accessible aux seuls utilisateurs authentifiés. Indisponible sur le build mobile statique
 * (pas de serveur) → le client bascule alors sur un repli local.
 */

const TIMEOUT_MS = 12000;

async function deezer<T>(path: string): Promise<T> {
	const res = await fetch(`https://api.deezer.com${path}`, {
		headers: { Accept: 'application/json' },
		signal: AbortSignal.timeout(TIMEOUT_MS)
	});
	if (!res.ok) throw error(502, 'Deezer indisponible.');
	return (await res.json()) as T;
}

type DeezerSearch = { data?: { id: number; name: string; nb_fan?: number; nb_album?: number }[] };
type DeezerTop = { data?: { title: string; title_short?: string; artist?: { name?: string } }[] };

function normalizeArtistName(s: string): string {
	return s
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '') // retire les diacritiques (å → a, é → e…)
		.toLowerCase()
		.trim();
}

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) throw error(401, 'Non authentifié.');
	const name = url.searchParams.get('name')?.trim();
	if (!name) throw error(400, 'Paramètre « name » requis.');

	try {
		// limit=1 (le comportement d'origine) prenait le PREMIER résultat sans discernement —
		// or Deezer classe parfois un doublon quasi vide avant le vrai artiste. Constaté en
		// conditions réelles : chercher « Måneskin » renvoie d'abord un artiste sans le tréma
		// (« Maneskin », 0 album, 43 fans, top vide) AVANT le vrai (21 albums, 1M+ fans) — les
		// plus gros titres disparaissaient donc silencieusement de « Titres populaires ».
		//
		// On départage par nombre de fans, mais SEULEMENT parmi les résultats dont le nom
		// correspond réellement (diacritiques ignorés) : sans ce filtre, un homonyme partiel
		// mais très suivi (constaté : "Marilyn Manson" apparaît dans les résultats pour
		// "Måneskin" et a plus de fans que le vrai Måneskin) prendrait la place à tort.
		const search = await deezer<DeezerSearch>(
			`/search/artist?q=${encodeURIComponent(name)}&limit=5`
		);
		const candidates = search.data ?? [];
		if (candidates.length === 0) return json({ tracks: [] });
		const query = normalizeArtistName(name);
		const sameName = candidates.filter((c) => normalizeArtistName(c.name) === query);
		const pool = sameName.length > 0 ? sameName : candidates;
		const best = pool.reduce((a, b) => ((b.nb_fan ?? 0) > (a.nb_fan ?? 0) ? b : a));
		const artistId = best.id;

		const top = await deezer<DeezerTop>(`/artist/${artistId}/top?limit=30`);
		const tracks = (top.data ?? []).map((t) => ({
			title: t.title_short || t.title,
			artist: t.artist?.name || name
		}));
		return json({ tracks });
	} catch (e) {
		if (e && typeof e === 'object' && 'status' in e) throw e;
		throw error(502, 'Deezer indisponible.');
	}
};
