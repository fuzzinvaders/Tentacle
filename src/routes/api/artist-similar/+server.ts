import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deezer, resolveArtistId } from '$lib/server/deezer';

/**
 * Artistes proches d'un artiste, via « related » de l'API publique Deezer (gratuite, sans clé).
 * Sert au « mix » : on ne garde ensuite que ceux présents dans la bibliothèque de l'utilisateur.
 *
 * Sécurité : hôte fixe (api.deezer.com), aucun paramètre d'URL arbitraire → pas de SSRF ;
 * réservé aux utilisateurs authentifiés. Absent du build mobile statique (pas de serveur) →
 * le client se rabat alors sur les artistes similaires de Jellyfin.
 */

type DeezerRelated = { data?: { name: string }[] };

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) throw error(401, 'Non authentifié.');
	const name = url.searchParams.get('name')?.trim();
	if (!name) throw error(400, 'Paramètre « name » requis.');

	try {
		const artistId = await resolveArtistId(name);
		if (artistId === null) return json({ artists: [] });
		const related = await deezer<DeezerRelated>(`/artist/${artistId}/related?limit=25`);
		return json({ artists: (related.data ?? []).map((a) => a.name).filter(Boolean) });
	} catch (e) {
		if (e && typeof e === 'object' && 'status' in e) throw e;
		throw error(502, 'Deezer indisponible.');
	}
};
