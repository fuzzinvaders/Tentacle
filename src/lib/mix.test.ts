import { describe, it, expect } from 'vitest';
import { scoreCandidates, rankFocusedMix, dominantGenres, normalizeGenre } from './mix';

const c = (name: string, genres: string[], artist = name) => ({ item: name, genres, artist });

describe('normalizeGenre', () => {
	it('ignore casse, accents et ponctuation', () => {
		expect(normalizeGenre('Électro-Pop')).toBe('electro pop');
		expect(normalizeGenre('  ROCK ')).toBe('rock');
	});
});

describe('scoreCandidates', () => {
	it('donne plus de poids à un genre rare qu’à un genre fourre-tout', () => {
		const cands = [
			c('a', ['Rock', 'Shoegaze']),
			c('b', ['Rock']),
			c('c', ['Rock']),
			c('d', ['Rock']),
			c('e', ['Rock'])
		];
		const [shoegaze, ...rock] = scoreCandidates(['Rock', 'Shoegaze'], cands);
		expect(shoegaze).toBeGreaterThan(rock[0]);
	});

	it('renvoie 0 sans genre commun', () => {
		expect(scoreCandidates(['Jazz'], [c('a', ['Metal'])])).toEqual([0]);
	});

	it('pénalise les genres étrangers', () => {
		const [pur, bruite] = scoreCandidates(['Jazz'], [c('a', ['Jazz']), c('b', ['Jazz', 'Metal', 'Pop', 'Rap'])]);
		expect(pur).toBeGreaterThan(bruite);
	});
});

describe('rankFocusedMix', () => {
	const rand = () => 0;
	it('écarte les titres qui ne partagent qu’un genre fourre-tout', () => {
		const cands = [
			...Array.from({ length: 30 }, (_, i) => c(`close${i}`, ['Indie Rock', 'Shoegaze'], `art${i}`)),
			...Array.from({ length: 30 }, (_, i) => c(`far${i}`, ['Indie Rock', 'Metal', 'Punk'], `x${i}`))
		];
		const out = rankFocusedMix(['Indie Rock', 'Shoegaze'], cands, { limit: 25, rand });
		expect(out).toHaveLength(25);
		expect(out.every((n) => n.startsWith('close'))).toBe(true);
	});

	it('relâche le seuil si trop peu de titres proches', () => {
		const cands = [c('a', ['Rock', 'Pop'], 'a'), c('b', ['Rock'], 'b'), c('c', ['Pop'], 'c')];
		const out = rankFocusedMix(['Rock', 'Pop'], cands, { limit: 10, minResults: 3, rand });
		expect(out.sort()).toEqual(['a', 'b', 'c']);
	});

	it('plafonne le nombre de titres par artiste', () => {
		const cands = Array.from({ length: 10 }, (_, i) => c(`t${i}`, ['Jazz'], 'Miles'));
		const out = rankFocusedMix(['Jazz'], cands, { limit: 10, maxPerArtist: 3, minResults: 1, rand });
		expect(out).toHaveLength(3);
	});

	it('garde toujours le titre graine', () => {
		const cands = [{ ...c('seed', ['Zzz'], 's'), isSeed: true }, c('a', ['Jazz'], 'a')];
		expect(rankFocusedMix(['Jazz'], cands, { limit: 5, minResults: 1, rand })).toContain('seed');
	});
});

describe('dominantGenres', () => {
	it('retient les genres portés par une part significative des titres', () => {
		const tracks = [['Rock', 'Pop'], ['Rock'], ['Rock', 'Jazz'], ['Rock', 'Pop'], ['Pop']];
		expect(dominantGenres(tracks, 2, 0.4)).toEqual(['Rock', 'Pop']);
	});
	it('renvoie [] sans genre', () => {
		expect(dominantGenres([[], []])).toEqual([]);
	});
});
