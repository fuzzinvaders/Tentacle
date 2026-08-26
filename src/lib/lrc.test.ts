import { describe, it, expect } from 'vitest';
import { parseLrc, currentLineIndex } from './lrc';

describe('parseLrc', () => {
	it('parse des lignes horodatées et ignore les métadonnées', () => {
		const lrc = ['[ar:Artist]', '[ti:Title]', '[00:12.50]Première ligne', '[01:05.00]Deuxième'].join(
			'\n'
		);
		const lines = parseLrc(lrc);
		expect(lines).toEqual([
			{ time: 12.5, text: 'Première ligne' },
			{ time: 65, text: 'Deuxième' }
		]);
	});

	it('gère plusieurs tags de temps sur une même ligne (refrain) et trie', () => {
		const lines = parseLrc('[00:30.00][01:30.00]Refrain\n[00:10.00]Intro');
		expect(lines.map((l) => l.time)).toEqual([10, 30, 90]);
		expect(lines.filter((l) => l.text === 'Refrain')).toHaveLength(2);
	});

	it('accepte les fractions à 2 ou 3 chiffres et le texte vide', () => {
		const lines = parseLrc('[00:01.5]a\n[00:02.250]b\n[00:03.00]');
		expect(lines[0].time).toBeCloseTo(1.5);
		expect(lines[1].time).toBeCloseTo(2.25);
		expect(lines[2]).toEqual({ time: 3, text: '' });
	});
});

describe('currentLineIndex', () => {
	const lines = parseLrc('[00:00.00]a\n[00:10.00]b\n[00:20.00]c');
	it('renvoie -1 avant la première ligne', () => {
		expect(currentLineIndex(lines, -1)).toBe(-1);
	});
	it('renvoie la dernière ligne dont le temps ≤ position', () => {
		expect(currentLineIndex(lines, 0)).toBe(0);
		expect(currentLineIndex(lines, 9.9)).toBe(0);
		expect(currentLineIndex(lines, 10)).toBe(1);
		expect(currentLineIndex(lines, 25)).toBe(2);
	});
	it('gère une liste vide', () => {
		expect(currentLineIndex([], 5)).toBe(-1);
	});
});
