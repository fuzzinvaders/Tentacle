import { describe, it, expect } from 'vitest';
import { parseTopRecordings } from './listenbrainzPopularity';

describe('parseTopRecordings', () => {
	it('parse un tableau de recordings (forme normale de l’API)', () => {
		const data = [
			{
				recording_name: 'Wish You Were Here',
				artist_name: 'Pink Floyd',
				recording_mbid: 'abc',
				total_listen_count: 1000
			},
			{
				recording_name: 'Money',
				artist_name: 'Pink Floyd',
				total_listen_count: 800
			}
		];
		const out = parseTopRecordings(data);
		expect(out).toHaveLength(2);
		expect(out[0]).toEqual({
			title: 'Wish You Were Here',
			artist: 'Pink Floyd',
			recordingMbid: 'abc',
			listenCount: 1000
		});
		// Ordre (popularité) préservé
		expect(out[1].title).toBe('Money');
	});

	it('accepte un enrobage {payload:{recordings}}', () => {
		const data = { payload: { recordings: [{ recording_name: 'Time', artist_name: 'Pink Floyd' }] } };
		expect(parseTopRecordings(data)).toEqual([
			{ title: 'Time', artist: 'Pink Floyd', recordingMbid: undefined, listenCount: undefined }
		]);
	});

	it('ignore les entrées sans titre et les valeurs non-objets', () => {
		const data = [null, 42, { artist_name: 'X' }, { recording_name: '   ' }, { recording_name: 'OK' }];
		const out = parseTopRecordings(data);
		expect(out).toHaveLength(1);
		expect(out[0].title).toBe('OK');
	});

	it('renvoie un tableau vide pour une entrée inattendue', () => {
		expect(parseTopRecordings(null)).toEqual([]);
		expect(parseTopRecordings({})).toEqual([]);
		expect(parseTopRecordings('nope')).toEqual([]);
	});
});
