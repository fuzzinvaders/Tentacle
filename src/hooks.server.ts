// SPDX-License-Identifier: AGPL-3.0-or-later
import { redirect, type Handle } from '@sveltejs/kit';
import { userFromCookies } from '$lib/server/auth';
import { userCount } from '$lib/server/users';

export const handle: Handle = async ({ event, resolve }) => {
	// Sonde de santé, jamais gardée (HEALTHCHECK Docker).
	if (event.url.pathname === '/healthz') return new Response('ok');

	const user = userFromCookies(event.cookies);
	event.locals.user = user;

	const path = event.url.pathname;
	const isApi = path.startsWith('/api/');
	const hasUsers = userCount() > 0;

	if (!hasUsers) {
		// Aucun compte : forcer la création de l'admin (sauf /setup et ses ressources).
		if (path !== '/setup') {
			if (isApi) return new Response('Configuration requise', { status: 503 });
			throw redirect(303, '/setup');
		}
	} else if (!user) {
		// Comptes existants mais visiteur non authentifié : seule /login est permise.
		if (path !== '/login') {
			if (isApi) return new Response('Non authentifié', { status: 401 });
			throw redirect(303, '/login');
		}
	} else {
		// Authentifié : les pages d'accueil de l'auth redirigent vers l'app.
		if (path === '/login' || path === '/setup') throw redirect(303, '/');
	}

	return resolve(event);
};
