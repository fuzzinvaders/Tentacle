import { json, error } from '@sveltejs/kit';
import { deleteUser, findById, updatePassword, verifyPasswordForUser } from '$lib/server/users';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = ({ params, locals }) => {
	if (!locals.user?.isAdmin) throw error(403, "Réservé à l'administrateur.");
	if (params.id === locals.user.id) throw error(400, 'Impossible de supprimer votre propre compte.');
	if (!findById(params.id!)) throw error(404, 'Utilisateur introuvable.');
	deleteUser(params.id!);
	return json({ ok: true });
};

/**
 * Change de mot de passe : soi-même (avec le mot de passe actuel) ou, si admin,
 * réinitialisation du mot de passe d'un autre compte (sans le connaître).
 */
export const PATCH: RequestHandler = async ({ request, params, locals }) => {
	if (!locals.user) throw error(401, 'Non authentifié.');
	const targetId = params.id!;
	const isSelf = locals.user.id === targetId;
	if (!isSelf && !locals.user.isAdmin) throw error(403, "Réservé à l'administrateur.");

	const body = await request.json().catch(() => ({}));
	const newPassword = String(body.newPassword ?? '');

	if (isSelf) {
		const currentPassword = String(body.currentPassword ?? '');
		if (!verifyPasswordForUser(targetId, currentPassword)) {
			throw error(400, 'Mot de passe actuel incorrect.');
		}
	} else if (!findById(targetId)) {
		throw error(404, 'Utilisateur introuvable.');
	}

	const res = updatePassword(targetId, newPassword);
	if (!res.ok) throw error(400, res.error);
	return json({ ok: true });
};
