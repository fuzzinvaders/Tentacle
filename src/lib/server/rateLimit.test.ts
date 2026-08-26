import { describe, it, expect, vi, afterEach } from 'vitest';
import { checkRateLimit, recordFailure, recordSuccess } from './rateLimit';

// Chaque test utilise une clé unique : le module garde un Map global partagé.
afterEach(() => vi.useRealTimers());

describe('rateLimit', () => {
	it('ne verrouille pas une clé inconnue', () => {
		expect(checkRateLimit('ip:inconnu').locked).toBe(false);
	});

	it('verrouille après 5 échecs', () => {
		const key = 'ip:brute';
		for (let i = 0; i < 4; i++) {
			recordFailure(key);
			expect(checkRateLimit(key).locked).toBe(false);
		}
		recordFailure(key); // 5e
		const status = checkRateLimit(key);
		expect(status.locked).toBe(true);
		expect(status.retryAfterSec).toBeGreaterThan(0);
	});

	it('une connexion réussie réinitialise le compteur', () => {
		const key = 'ip:reset';
		for (let i = 0; i < 5; i++) recordFailure(key);
		expect(checkRateLimit(key).locked).toBe(true);
		recordSuccess(key);
		expect(checkRateLimit(key).locked).toBe(false);
	});

	it('le verrou expire après le délai de blocage', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
		const key = 'ip:expire';
		for (let i = 0; i < 5; i++) recordFailure(key);
		expect(checkRateLimit(key).locked).toBe(true);
		vi.advanceTimersByTime(6 * 60 * 1000); // > 5 min de blocage
		expect(checkRateLimit(key).locked).toBe(false);
	});
});
