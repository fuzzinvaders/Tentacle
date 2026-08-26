import { describe, it, expect } from 'vitest';
import { parseChaptersJson, currentChapterIndex } from './chapters';

const SAMPLE = JSON.stringify({
	version: '1.2.0',
	chapters: [
		{ startTime: 0, title: 'Intro' },
		{ startTime: 120.5, title: 'Sujet principal', img: 'https://ex.com/a.png' },
		{ startTime: 900, title: 'Pub', url: 'https://ex.com/sponsor' },
		{ startTime: 60, title: 'Sans ordre (avant Sujet principal)' }
	]
});

describe('parseChaptersJson', () => {
	it('extrait et trie les chapitres par startTime', () => {
		const chapters = parseChaptersJson(SAMPLE);
		expect(chapters.map((c) => c.title)).toEqual([
			'Intro',
			'Sans ordre (avant Sujet principal)',
			'Sujet principal',
			'Pub'
		]);
	});

	it('conserve img/url quand présents', () => {
		const chapters = parseChaptersJson(SAMPLE);
		expect(chapters.find((c) => c.title === 'Pub')?.url).toBe('https://ex.com/sponsor');
		expect(chapters.find((c) => c.title === 'Sujet principal')?.img).toBe('https://ex.com/a.png');
	});

	it('ignore les entrées malformées sans tout rejeter', () => {
		const raw = JSON.stringify({
			chapters: [
				{ startTime: 0, title: 'Bon' },
				{ startTime: -5, title: 'Négatif (ignoré)' },
				{ startTime: 10 }, // sans titre
				{ title: 'Sans startTime' }
			]
		});
		expect(parseChaptersJson(raw)).toEqual([{ startTime: 0, title: 'Bon' }]);
	});

	it('renvoie un tableau vide sur du JSON invalide ou sans champ chapters', () => {
		expect(parseChaptersJson('pas du json')).toEqual([]);
		expect(parseChaptersJson('{}')).toEqual([]);
		expect(parseChaptersJson('{"chapters": "pas un tableau"}')).toEqual([]);
	});
});

describe('currentChapterIndex', () => {
	const chapters = parseChaptersJson(SAMPLE); // [0, 60, 120.5, 900]

	it('-1 avant le premier chapitre', () => {
		expect(currentChapterIndex(chapters, -1)).toBe(-1);
	});
	it('trouve le dernier chapitre dont startTime <= position', () => {
		expect(currentChapterIndex(chapters, 0)).toBe(0);
		expect(currentChapterIndex(chapters, 59)).toBe(0);
		expect(currentChapterIndex(chapters, 60)).toBe(1);
		expect(currentChapterIndex(chapters, 500)).toBe(2);
		expect(currentChapterIndex(chapters, 10_000)).toBe(3);
	});
});
