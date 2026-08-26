import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('password (scrypt)', () => {
	it('vérifie le bon mot de passe', () => {
		const stored = hashPassword('motdepasse123');
		expect(verifyPassword('motdepasse123', stored)).toBe(true);
	});

	it('rejette un mauvais mot de passe', () => {
		const stored = hashPassword('motdepasse123');
		expect(verifyPassword('motdepasse124', stored)).toBe(false);
	});

	it('utilise un sel aléatoire : deux hachages du même mot de passe diffèrent', () => {
		expect(hashPassword('x'.repeat(8))).not.toBe(hashPassword('x'.repeat(8)));
	});

	it('rejette un format stocké invalide sans lever', () => {
		expect(verifyPassword('x', 'pas-de-deux-points')).toBe(false);
		expect(verifyPassword('x', '')).toBe(false);
		expect(verifyPassword('x', 'sel:')).toBe(false);
	});

	it('distingue deux mots de passe différents', () => {
		const a = hashPassword('alpha1');
		expect(verifyPassword('beta22', a)).toBe(false);
	});
});
