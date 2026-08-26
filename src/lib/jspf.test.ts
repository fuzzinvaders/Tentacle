import { describe, it, expect } from 'vitest';
import { extractMbid, stripHtml, parsePlaylistList, parsePlaylistTracks } from './jspf';

describe('extractMbid', () => {
	it('extrait le dernier segment d’une URL', () => {
		expect(extractMbid('https://musicbrainz.org/recording/abc-123')).toBe('abc-123');
	});
	it('gère un tableau (prend le premier)', () => {
		expect(extractMbid(['https://mb.org/recording/xyz', 'autre'])).toBe('xyz');
	});
	it('renvoie une chaîne vide pour une entrée non exploitable', () => {
		expect(extractMbid(undefined)).toBe('');
		expect(extractMbid(42)).toBe('');
	});
});

describe('stripHtml', () => {
	it('retire les balises et trim', () => {
		expect(stripHtml('<p>Bonjour <b>toi</b></p>')).toBe('Bonjour toi');
	});
	it('renvoie undefined pour vide/blanc', () => {
		expect(stripHtml('')).toBeUndefined();
		expect(stripHtml('<p></p>')).toBeUndefined();
		expect(stripHtml(undefined)).toBeUndefined();
	});
});

describe('parsePlaylistList', () => {
	it('parse les résumés et ignore les entrées sans MBID', () => {
		const list = parsePlaylistList({
			playlists: [
				{ playlist: { title: 'Weekly Jams', identifier: 'https://listenbrainz.org/playlist/pl-1', track: [{}, {}] } },
				{ playlist: { title: 'Sans id', identifier: '' } }, // ignorée (pas de MBID)
				{ playlist: { identifier: 'https://listenbrainz.org/playlist/pl-2' } } // titre par défaut
			]
		});
		expect(list).toHaveLength(2);
		expect(list[0]).toMatchObject({ mbid: 'pl-1', title: 'Weekly Jams', trackCount: 2 });
		expect(list[1]).toMatchObject({ mbid: 'pl-2', title: 'Playlist sans titre' });
	});

	it('renvoie [] si playlists absent', () => {
		expect(parsePlaylistList({})).toEqual([]);
	});
});

describe('parsePlaylistTracks', () => {
	it('parse titre/artiste/album + recording MBID, ignore les pistes sans titre', () => {
		const tracks = parsePlaylistTracks({
			playlist: {
				track: [
					{
						title: 'Song A',
						creator: 'Artist A',
						album: 'Album A',
						identifier: ['https://musicbrainz.org/recording/rec-a']
					},
					{ title: '', creator: 'X' }, // ignorée (pas de titre)
					{ title: 'Song B', creator: 'Artist B' } // sans MBID
				]
			}
		});
		expect(tracks).toHaveLength(2);
		expect(tracks[0]).toEqual({
			title: 'Song A',
			artist: 'Artist A',
			album: 'Album A',
			recordingMbid: 'rec-a'
		});
		expect(tracks[1].recordingMbid).toBeUndefined();
	});
});
