import { describe, it, expect } from 'vitest';
import { formatTime, formatDate } from './format';

describe('formatTime', () => {
	it('formate minutes:secondes', () => {
		expect(formatTime(0)).toBe('0:00');
		expect(formatTime(5)).toBe('0:05');
		expect(formatTime(65)).toBe('1:05');
		expect(formatTime(600)).toBe('10:00');
	});

	it('ajoute les heures au-delà de 60 min', () => {
		expect(formatTime(3661)).toBe('1:01:01');
	});

	it('renvoie 0:00 pour les valeurs invalides', () => {
		expect(formatTime(-10)).toBe('0:00');
		expect(formatTime(Infinity)).toBe('0:00');
		expect(formatTime(NaN)).toBe('0:00');
	});
});

describe('formatDate', () => {
	it('formate une date ISO valide (contient l’année)', () => {
		expect(formatDate('2026-07-20')).toContain('2026');
	});

	it('renvoie l’entrée telle quelle si non parsable', () => {
		expect(formatDate('pas-une-date')).toBe('pas-une-date');
	});
});
