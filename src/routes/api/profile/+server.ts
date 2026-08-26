import { json, error } from '@sveltejs/kit';
import { getProfile, setProfile } from '$lib/server/users';
import type { RequestHandler } from './$types';

/**
 * Profil applicatif par utilisateur (connexions aux sources + préférences +
 * radios), pour que la config suive l'utilisateur d'un navigateur à l'autre.
 * Uniquement disponible sur la version web (serveur Node) ; l'app mobile
 * statique n'a pas cette route et retombe sur le localStorage.
 */

export const GET: RequestHandler = ({ locals }) => {
	if (!locals.user) throw error(401, 'Non authentifié.');
	return json({ profile: getProfile(locals.user.id) });
};

// Le profil ne contient que quelques connexions + préférences + radios : un
// plafond large suffit à écarter un client buggé/malveillant qui gonflerait
// users.json sans jamais gêner un usage légitime.
const MAX_PROFILE_BYTES = 256 * 1024;

export const PUT: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Non authentifié.');
	const raw = await request.text();
	if (raw.length > MAX_PROFILE_BYTES) throw error(413, 'Profil trop volumineux.');
	let body: unknown;
	try {
		body = JSON.parse(raw);
	} catch {
		body = null;
	}
	if (body === null || typeof body !== 'object') throw error(400, 'Profil invalide.');
	setProfile(locals.user.id, body as Record<string, unknown>);
	return json({ ok: true });
};
