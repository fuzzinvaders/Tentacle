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

type DeezerSearch = { data?: { id: number; name: string }[] };
type DeezerTop = { data?: { title: string; title_short?: string; artist?: { name?: string } }[] };

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) throw error(401, 'Non authentifié.');
	const name = url.searchParams.get('name')?.trim();
	if (!name) throw error(400, 'Paramètre « name » requis.');

	try {
		const search = await deezer<DeezerSearch>(
			`/search/artist?q=${encodeURIComponent(name)}&limit=1`
		);
		const artistId = search.data?.[0]?.id;
		if (!artistId) return json({ tracks: [] });

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
