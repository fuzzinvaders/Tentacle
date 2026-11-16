import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deezer, resolveArtistId } from '$lib/server/deezer';

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

type DeezerTop = { data?: { title: string; title_short?: string; artist?: { name?: string } }[] };

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) throw error(401, 'Non authentifié.');
	const name = url.searchParams.get('name')?.trim();
	if (!name) throw error(400, 'Paramètre « name » requis.');

	try {
		const artistId = await resolveArtistId(name);
		if (artistId === null) return json({ tracks: [] });

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
