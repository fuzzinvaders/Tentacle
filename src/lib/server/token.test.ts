import { describe, it, expect } from 'vitest';
import { signSession, verifySession } from './token';

const SECRET = 'secret-de-test-0123456789';

describe('token de session', () => {
	it('signe puis vérifie : renvoie l’identifiant', () => {
		const token = signSession('user-42', SECRET, 3600);
		expect(verifySession(token, SECRET)).toBe('user-42');
	});

	it('rejette un jeton signé avec un autre secret', () => {
		const token = signSession('user-42', SECRET, 3600);
		expect(verifySession(token, 'un-autre-secret')).toBeNull();
	});

	it('rejette un jeton dont la charge utile est altérée', () => {
		const token = signSession('user-42', SECRET, 3600);
		const [, mac] = token.split('.');
		const forged = Buffer.from(JSON.stringify({ uid: 'admin', exp: Date.now() + 3600_000 }), 'utf-8').toString(
			'base64url'
		);
		expect(verifySession(`${forged}.${mac}`, SECRET)).toBeNull();
	});

	it('rejette un jeton expiré', () => {
		const token = signSession('user-42', SECRET, -1);
		expect(verifySession(token, SECRET)).toBeNull();
	});

	it('rejette les jetons malformés', () => {
		expect(verifySession('', SECRET)).toBeNull();
		expect(verifySession('sans-point', SECRET)).toBeNull();
		expect(verifySession('a.b.c', SECRET)).toBeNull();
	});
});
