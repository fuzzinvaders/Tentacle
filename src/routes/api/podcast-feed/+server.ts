import { error, text } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Proxy vers une ressource de podcast arbitraire — flux RSS OU document JSON de chapitres
 * Podcasting 2.0 (abonnements « locaux », sans PinePods — voir [[../../../lib/rss.ts]] et
 * [[../../../lib/chapters.ts]]). Nécessaire car ces serveurs n'envoient généralement pas
 * d'en-têtes CORS : le navigateur ne peut pas les lire directement.
 *
 * Sur mobile (Capacitor), ce proxy n'est PAS utilisé : la requête part nativement via
 * CapacitorHttp (pas de CORS côté natif) — voir src/lib/api/localPodcasts.ts.
 *
 * Note sécurité : même posture que le proxy Lidarr (/api/lidarr) — app personnelle
 * auto-hébergée, réservée aux utilisateurs authentifiés. Contrairement à Lidarr (URL fixée
 * par l'utilisateur dans sa config), l'URL ici est un paramètre libre à CHAQUE requête
 * (n'importe quel flux public) : on borne donc plus strictement — méthode GET uniquement,
 * taille de réponse plafonnée, et on ne bloque que la cible SSRF classique (métadonnées
 * cloud 169.254.169.254) plutôt que tout le LAN, beaucoup de flux personnels y étant hébergés.
 */

const TIMEOUT_MS = 20000;
const MAX_BYTES = 15 * 1024 * 1024; // 15 Mo : largement suffisant pour un flux RSS, même long

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) throw error(401, 'Non authentifié.');

	const target = url.searchParams.get('url');
	if (!target) throw error(400, 'Paramètre « url » requis.');

	let host: string;
	try {
		const parsed = new URL(target);
		if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('protocole');
		host = parsed.hostname;
	} catch {
		throw error(400, 'URL de flux invalide.');
	}
	if (/^169\.254\./.test(host) || host === '[fd00:ec2::254]' || host === 'metadata.google.internal') {
		throw error(400, 'Hôte non autorisé.');
	}

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
	try {
		const res = await fetch(target, {
			headers: { Accept: 'application/rss+xml, application/xml, text/xml, application/json, */*' },
			signal: controller.signal
		});
		if (!res.ok) throw error(502, `Flux injoignable (HTTP ${res.status}).`);

		// Lecture bornée (évite qu'un flux gigantesque n'épuise la mémoire du serveur).
		const reader = res.body?.getReader();
		if (!reader) throw error(502, 'Réponse vide.');
		const chunks: Uint8Array[] = [];
		let total = 0;
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			total += value.byteLength;
			if (total > MAX_BYTES) {
				await reader.cancel().catch(() => {});
				throw error(502, 'Flux trop volumineux.');
			}
			chunks.push(value);
		}
		const body = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf-8');
		// Reflète le type de contenu d'origine (XML pour un flux, JSON pour des chapitres) plutôt
		// que d'en forcer un : le client ne fait que .text() dessus de toute façon, mais autant
		// rester honnête pour tout outil/cache intermédiaire qui regarderait l'en-tête.
		const contentType = res.headers.get('content-type') ?? 'text/plain; charset=utf-8';
		return text(body, { headers: { 'Content-Type': contentType } });
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) throw err; // déjà une erreur SvelteKit (throw error(...))
		throw error(502, `Flux injoignable : ${err instanceof Error ? err.message : err}`);
	} finally {
		clearTimeout(timer);
	}
};
