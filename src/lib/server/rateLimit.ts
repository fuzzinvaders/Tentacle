/**
 * Limiteur de tentatives en mémoire (process unique — suffisant pour un serveur
 * personnel non distribué). Clé recommandée : `${ip}:${identifiant}` pour éviter
 * qu'un tiers ne verrouille le compte d'un autre juste en connaissant son nom.
 */

type Entry = { failures: number; firstFailureAt: number; lockedUntil: number };

const entries = new Map<string, Entry>();

const MAX_FAILURES = 5;
const WINDOW_MS = 10 * 60 * 1000; // fenêtre de comptage des échecs
const LOCKOUT_MS = 5 * 60 * 1000; // durée du verrouillage une fois le seuil atteint

export type RateLimitStatus = { locked: boolean; retryAfterSec?: number };

export function checkRateLimit(key: string): RateLimitStatus {
	const e = entries.get(key);
	if (!e) return { locked: false };
	if (e.lockedUntil > Date.now()) {
		return { locked: true, retryAfterSec: Math.ceil((e.lockedUntil - Date.now()) / 1000) };
	}
	return { locked: false };
}

export function recordFailure(key: string): void {
	const now = Date.now();
	const e = entries.get(key);
	if (!e || now - e.firstFailureAt > WINDOW_MS) {
		entries.set(key, { failures: 1, firstFailureAt: now, lockedUntil: 0 });
		return;
	}
	e.failures += 1;
	if (e.failures >= MAX_FAILURES) {
		e.lockedUntil = now + LOCKOUT_MS;
	}
}

export function recordSuccess(key: string): void {
	entries.delete(key);
}
