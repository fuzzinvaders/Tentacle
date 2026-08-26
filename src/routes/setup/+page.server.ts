import { fail, redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { createUser, userCount } from '$lib/server/users';
import { setSessionCookie } from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';

/** Indique au formulaire si un jeton d'installation est exigé (SETUP_TOKEN défini). */
export const load: PageServerLoad = () => ({ tokenRequired: Boolean(env.SETUP_TOKEN) });

export const actions: Actions = {
	default: async ({ request, cookies, url }) => {
		// Sortie rapide : evite de parser le formulaire si un compte existe deja.
		if (userCount() > 0) throw redirect(303, '/login');

		const data = await request.formData();
		const username = String(data.get('username') ?? '');
		const password = String(data.get('password') ?? '');
		const confirm = String(data.get('confirm') ?? '');

		// Si SETUP_TOKEN est défini, la création de l'admin l'exige — ferme la course
		// « le premier visiteur devient admin » quand l'app est exposée avant d'être
		// configurée. Non défini = comportement d'origine (premier lancement ouvert).
		if (env.SETUP_TOKEN && String(data.get('setupToken') ?? '') !== env.SETUP_TOKEN) {
			return fail(400, { error: "Jeton d'installation invalide.", username });
		}

		if (password !== confirm) return fail(400, { error: 'Les mots de passe ne correspondent pas.', username });

		// Re-verification juste avant l'ecriture : le seul point d'attente de cette
		// action est le parsing du formulaire ci-dessus, pendant lequel une autre
		// soumission concurrente aurait pu creer l'admin en premier. Sans ce second
		// controle, les deux passeraient le premier check (userCount()===0) avant
		// que ni l'une ni l'autre n'ait ecrit, et les deux creeraient un compte admin.
		if (userCount() > 0) throw redirect(303, '/login');

		const res = createUser(username, password, true);
		if (!res.ok) return fail(400, { error: res.error, username });

		setSessionCookie(cookies, res.user.id, url.protocol === 'https:');
		throw redirect(303, '/');
	}
};
