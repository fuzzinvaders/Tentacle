import { describe, it, expect } from 'vitest';
import { scoreCandidates, rankFocusedMix, dominantGenres, normalizeGenre, artistAffinities, spreadArtists } from './mix';

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

describe('artistAffinities', () => {
	it('décroît avec le rang, de 1 vers ~0,3, sans doublon ni accents', () => {
		const m = artistAffinities(['Muse', 'Coldplay', 'muse', 'Måneskin']);
		expect(m.get('muse')).toBe(1);
		expect(m.get('coldplay')!).toBeLessThan(1);
		expect(m.get('maneskin')!).toBeLessThan(m.get('coldplay')!);
		expect(m.get('maneskin')!).toBeGreaterThan(0.29);
		expect(m.size).toBe(3);
	});
});

describe('rankFocusedMix avec affinité d’artiste', () => {
	const rand = () => 0;
	it('retient un artiste proche même sans genre commun, mais pas un artiste éloigné', () => {
		const cands = [
			c('proche', ['Autre'], 'P'),
			{ ...c('proche', ['Autre'], 'P'), affinity: 1 },
			c('eloigne', ['Metal'], 'E')
		];
		const out = rankFocusedMix(['Rock'], cands.slice(1), { limit: 5, minResults: 1, rand });
		expect(out).toEqual(['proche']);
		expect(rankFocusedMix(['Rock'], [cands[2]], { limit: 5, minResults: 1, rand })).toEqual([]);
	});

	it('l’affinité fait passer devant à score de genres égal', () => {
		const cands = [
			c('a', ['Rock'], 'A'),
			{ ...c('b', ['Rock'], 'B'), affinity: 0.8 }
		];
		const out = rankFocusedMix(['Rock'], cands, { limit: 5, minResults: 1, rand, shuffle: false });
		expect(out[0]).toBe('b');
	});
});

describe('mélange du mix', () => {
	it('n’enchaîne jamais deux titres du même artiste quand c’est évitable', () => {
		const cands = [
			...Array.from({ length: 5 }, (_, i) => c(`a${i}`, ['Jazz'], 'A')),
			...Array.from({ length: 5 }, (_, i) => c(`b${i}`, ['Jazz'], 'B')),
			...Array.from({ length: 5 }, (_, i) => c(`c${i}`, ['Jazz'], 'C'))
		];
		for (const seed of [0.1, 0.5, 0.9]) {
			let k = seed;
			const rand = () => (k = (k * 9301 + 49297) % 233280) / 233280;
			const out = rankFocusedMix(['Jazz'], cands, { limit: 15, minResults: 1, maxPerArtist: 5, rand });
			expect(out).toHaveLength(15);
			for (let i = 1; i < out.length; i++) expect(out[i][0]).not.toBe(out[i - 1][0]);
		}
	});

	it('garde le titre graine en premier', () => {
		const cands = [c('x', ['Jazz'], 'X'), { ...c('seed', ['Jazz'], 'S'), isSeed: true }, c('y', ['Jazz'], 'Y')];
		expect(rankFocusedMix(['Jazz'], cands, { limit: 5, minResults: 1 })[0]).toBe('seed');
	});

	it('spreadArtists tolère un seul artiste (pas de boucle infinie)', () => {
		const items = Array.from({ length: 4 }, (_, i) => ({ id: i, artist: 'A' }));
		expect(spreadArtists(items)).toHaveLength(4);
	});
});
