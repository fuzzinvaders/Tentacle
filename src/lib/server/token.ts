import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Jeton de session sans état : `<payload base64url>.<hmac>`. Le secret est
 * injecté (pas de dépendance à l'environnement), ce qui rend ces fonctions
 * pures et testables. Utilisé par auth.ts avec le secret de session résolu.
 */

function base64url(input: string): string {
	return Buffer.from(input, 'utf-8').toString('base64url');
}

function fromBase64url(input: string): string {
	return Buffer.from(input, 'base64url').toString('utf-8');
}

function sign(value: string, secret: string): string {
	return createHmac('sha256', secret).update(value).digest('hex');
}

/** Signe un jeton pour `userId`, valable `maxAgeSec` secondes. */
export function signSession(userId: string, secret: string, maxAgeSec: number): string {
	const payload = base64url(JSON.stringify({ uid: userId, exp: Date.now() + maxAgeSec * 1000 }));
	return `${payload}.${sign(payload, secret)}`;
}

/** Vérifie signature + expiration ; renvoie l'identifiant utilisateur ou null. */
export function verifySession(token: string, secret: string): string | null {
	const [payload, mac] = token.split('.');
	if (!payload || !mac) return null;
	const expected = sign(payload, secret);
	const a = Buffer.from(mac);
	const b = Buffer.from(expected);
	if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
	try {
		const { uid, exp } = JSON.parse(fromBase64url(payload));
		if (typeof uid !== 'string' || typeof exp !== 'number' || Date.now() > exp) return null;
		return uid;
	} catch {
		return null;
	}
}
