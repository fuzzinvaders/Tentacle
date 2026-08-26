import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Proxy vers l'API Lidarr de l'utilisateur. Nécessaire car Lidarr n'envoie pas
 * d'en-têtes CORS : le navigateur ne peut pas l'appeler directement, alors que
 * ce serveur Node le peut. La connexion (URL + clé API) reste stockée côté
 * client, comme pour les autres sources — elle transite avec chaque requête.
 *
 * Note sécurité : ce relais sortant n'est accessible qu'aux utilisateurs
 * authentifiés (hooks.server.ts renvoie 401 sur /api/* sinon) et n'accepte que
 * des chemins /api/v1/ — acceptable pour une app personnelle auto-hébergée.
 */

const TIMEOUT_MS = 20000;
const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT']);

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Non authentifié.');

	const req = await request.json().catch(() => null);
	const baseUrl = String(req?.baseUrl ?? '').replace(/\/+$/, '');
	const path = String(req?.path ?? '');
	const method = String(req?.method ?? 'GET').toUpperCase();
	const apiKey = String(req?.apiKey ?? '');

	let host: string;
	try {
		const parsed = new URL(baseUrl);
		if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('protocole');
		host = parsed.hostname;
	} catch {
		throw error(400, 'URL Lidarr invalide.');
	}
	// On n'interdit PAS les IP privées de LAN (Lidarr y est souvent auto-hébergé),
	// mais on bloque le lien-local 169.254.0.0/16 — notamment l'endpoint de
	// métadonnées cloud 169.254.169.254, cible classique d'un SSRF, qu'aucun
	// Lidarr légitime n'utilise.
	if (/^169\.254\./.test(host) || host === '[fd00:ec2::254]' || host === 'metadata.google.internal') {
		throw error(400, 'Hôte non autorisé.');
	}
	if (!path.startsWith('/api/v1/')) throw error(400, 'Chemin API non autorisé.');
	if (!ALLOWED_METHODS.has(method)) throw error(400, 'Méthode non autorisée.');
	if (!apiKey) throw error(400, 'Clé API Lidarr manquante.');

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
	try {
		const res = await fetch(baseUrl + path, {
			method,
			headers: {
				'X-Api-Key': apiKey,
				...(req?.body !== undefined ? { 'Content-Type': 'application/json' } : {})
			},
			body: req?.body !== undefined ? JSON.stringify(req.body) : undefined,
			signal: controller.signal
		});
		const text = await res.text();
		let data: unknown = null;
		try {
			data = text ? JSON.parse(text) : null;
		} catch {
			data = text;
		}
		return json({ status: res.status, data });
	} catch (err) {
		throw error(502, `Lidarr injoignable : ${err instanceof Error ? err.message : err}`);
	} finally {
		clearTimeout(timer);
	}
};
