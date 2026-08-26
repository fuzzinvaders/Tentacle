import { fail, redirect } from '@sveltejs/kit';
import { authenticate } from '$lib/server/users';
import { setSessionCookie } from '$lib/server/auth';
import { checkRateLimit, recordFailure, recordSuccess } from '$lib/server/rateLimit';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ request, cookies, url, getClientAddress }) => {
		const data = await request.formData();
		const username = String(data.get('username') ?? '');
		const password = String(data.get('password') ?? '');

		// Clé IP + identifiant : évite qu'on puisse verrouiller le compte d'un tiers
		// simplement en connaissant son nom d'utilisateur depuis une autre adresse.
		const key = `${getClientAddress()}:${username.trim().toLowerCase()}`;
		const rl = checkRateLimit(key);
		if (rl.locked) {
			const minutes = Math.ceil((rl.retryAfterSec ?? 0) / 60);
			return fail(429, {
				error: `Trop de tentatives échouées. Réessaie dans ${minutes} min.`,
				username
			});
		}

		const user = authenticate(username, password);
		if (!user) {
			recordFailure(key);
			return fail(400, { error: 'Identifiant ou mot de passe incorrect.', username });
		}
		recordSuccess(key);

		setSessionCookie(cookies, user.id, url.protocol === 'https:');
		throw redirect(303, '/');
	}
};
