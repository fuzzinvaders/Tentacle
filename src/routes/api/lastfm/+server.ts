import { error, json } from '@sveltejs/kit';
import { createHash } from 'node:crypto';
import type { RequestHandler } from './$types';

/**
 * Proxy signé vers l'API Last.fm (ws.audioscrobbler.com). Nécessaire car TOUTE requête
 * authentifiée Last.fm doit porter un `api_sig` = md5(paramètres triés concaténés + secret
 * partagé) — un secret qui ne doit jamais être exposé à un tiers ; il doit rester connu
 * uniquement de l'utilisateur et de ce serveur. Le client envoie sa clé API + son secret
 * (comme pour Lidarr : stockés côté client, transmis à chaque requête — même modèle de
 * confiance déjà en place dans cette app auto-hébergée), on signe ici et on relaie.
 *
 * Couvre tout le mini-flux d'autorisation + le scrobbling :
 *  - auth.getToken    : jeton temporaire avant autorisation utilisateur.
 *  - auth.getSession  : échange le jeton autorisé contre une clé de session durable.
 *  - track.updateNowPlaying / track.scrobble : nécessitent la clé de session (`sk`).
 *
 * Sécurité : réservé aux utilisateurs authentifiés (locals.user) ; liste blanche de méthodes
 * (pas de relais arbitraire vers l'API Last.fm) ; hôte fixe (pas de paramètre d'URL libre,
 * donc pas de surface SSRF comme pour /api/podcast-feed).
 */

const BASE = 'https://ws.audioscrobbler.com/2.0/';
const TIMEOUT_MS = 15000;
const ALLOWED_METHODS = new Set(['auth.getToken', 'auth.getSession', 'track.updateNowPlaying', 'track.scrobble']);

/** Signature Last.fm : tri alphabétique des clés (hors format/callback), concaténation
 * clé+valeur, secret ajouté à la fin, hash MD5 hexadécimal. */
function sign(params: Record<string, string>, secret: string): string {
	const keys = Object.keys(params)
		.filter((k) => k !== 'format' && k !== 'callback')
		.sort();
	const concatenated = keys.map((k) => `${k}${params[k]}`).join('');
	return createHash('md5').update(concatenated + secret, 'utf-8').digest('hex');
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Non authentifié.');

	const body = await request.json().catch(() => null);
	const apiKey = String(body?.apiKey ?? '');
	const secret = String(body?.secret ?? '');
	const sessionKey = body?.sessionKey ? String(body.sessionKey) : undefined;
	const method = String(body?.method ?? '');
	const extraParams: Record<string, string> =
		body?.params && typeof body.params === 'object' ? body.params : {};

	if (!apiKey || !secret) throw error(400, 'Clé API / secret Last.fm manquants.');
	if (!ALLOWED_METHODS.has(method)) throw error(400, 'Méthode Last.fm non autorisée.');

	const allParams: Record<string, string> = { ...extraParams, method, api_key: apiKey };
	if (sessionKey) allParams.sk = sessionKey;
	const api_sig = sign(allParams, secret);
	const form = new URLSearchParams({ ...allParams, api_sig, format: 'json' });

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
	try {
		const res = await fetch(BASE, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: form.toString(),
			signal: controller.signal
		});
		const data = await res.json().catch(() => null);
		if (!res.ok || (data && typeof data === 'object' && 'error' in data)) {
			const msg = data && typeof data === 'object' && 'message' in data ? String(data.message) : null;
			throw error(502, msg ?? `Last.fm a répondu ${res.status}.`);
		}
		return json(data);
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) throw err; // déjà une erreur SvelteKit
		throw error(502, `Last.fm injoignable : ${err instanceof Error ? err.message : err}`);
	} finally {
		clearTimeout(timer);
	}
};
