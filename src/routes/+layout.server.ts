// SPDX-License-Identifier: AGPL-3.0-or-later
import { env } from '$env/dynamic/private';
import type { LayoutServerLoad } from './$types';

// Expose l'utilisateur courant au client (badge, déconnexion, section admin), et le drapeau
// du mode démonstration.
//
// `DEMO_MODE=1` sert aux instances vitrines : les visiteurs n'ont aucun serveur Jellyfin à
// connecter, donc l'application propose d'emblée son catalogue de démonstration au lieu d'un
// écran vide. Ce drapeau ne fait qu'INVITER : rien n'est connecté d'autorité, et une vraie
// connexion Jellyfin déjà en place n'est jamais remplacée (voir DemoInvite).
export const load: LayoutServerLoad = async ({ locals }) => {
	return {
		user: locals.user,
		demoMode: env.DEMO_MODE === '1' || env.DEMO_MODE === 'true'
	};
};
