import { json, error } from '@sveltejs/kit';
import { listUsers, createUser } from '$lib/server/users';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals }) => {
	if (!locals.user?.isAdmin) throw error(403, "Réservé à l'administrateur.");
	return json({ users: listUsers() });
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.isAdmin) throw error(403, "Réservé à l'administrateur.");
	const body = await request.json().catch(() => ({}));
	const res = createUser(String(body.username ?? ''), String(body.password ?? ''), Boolean(body.isAdmin));
	if (!res.ok) throw error(400, res.error);
	return json({ user: res.user }, { status: 201 });
};
