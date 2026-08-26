import { describe, it, expect } from 'vitest';
import { pickBestAlbum, tierOf } from './musicbrainzSelect';

describe('tierOf', () => {
	it('classe album studio < EP < single < album secondaire < autre', () => {
		expect(tierOf({ id: '1', 'primary-type': 'Album' })).toBe(0);
		expect(tierOf({ id: '2', 'primary-type': 'EP' })).toBe(1);
		expect(tierOf({ id: '3', 'primary-type': 'Single' })).toBe(2);
		expect(tierOf({ id: '4', 'primary-type': 'Album', 'secondary-types': ['Compilation'] })).toBe(3);
		expect(tierOf({ id: '5', 'primary-type': 'Broadcast' })).toBe(4);
	});
});

describe('pickBestAlbum', () => {
	it('renvoie null sans parution', () => {
		expect(pickBestAlbum({ releases: [] })).toBeNull();
		expect(pickBestAlbum({})).toBeNull();
	});

	it('préfère l’album studio officiel à une compilation', () => {
		const res = pickBestAlbum({
			title: 'Ma chanson',
			'artist-credit': [{ name: 'Le groupe' }],
			releases: [
				{ status: 'Official', 'release-group': { id: 'comp', 'primary-type': 'Album', 'secondary-types': ['Compilation'], 'first-release-date': '1999' } },
				{ status: 'Official', 'release-group': { id: 'studio', 'primary-type': 'Album', 'first-release-date': '2005' } }
			]
		});
		expect(res?.releaseGroupMbid).toBe('studio');
		expect(res?.artistName).toBe('Le groupe');
	});

	it('à type égal, choisit la parution la plus ancienne', () => {
		const res = pickBestAlbum({
			releases: [
				{ status: 'Official', 'release-group': { id: 'recent', 'primary-type': 'Album', title: 'Réédition', 'first-release-date': '2015' } },
				{ status: 'Official', 'release-group': { id: 'original', 'primary-type': 'Album', title: 'Original', 'first-release-date': '2001' } }
			]
		});
		expect(res?.releaseGroupMbid).toBe('original');
		expect(res?.albumTitle).toBe('Original');
	});

	it('préfère une parution officielle à une non officielle', () => {
		const res = pickBestAlbum({
			releases: [
				{ status: 'Bootleg', 'release-group': { id: 'boot', 'primary-type': 'Album', 'first-release-date': '1990' } },
				{ status: 'Official', 'release-group': { id: 'off', 'primary-type': 'Album', 'first-release-date': '2010' } }
			]
		});
		expect(res?.releaseGroupMbid).toBe('off');
	});

	it('déduplique un même release group vu sur plusieurs parutions', () => {
		const res = pickBestAlbum({
			releases: [
				{ status: 'Bootleg', 'release-group': { id: 'same', 'primary-type': 'Album' } },
				{ status: 'Official', 'release-group': { id: 'same', 'primary-type': 'Album' } }
			]
		});
		expect(res?.releaseGroupMbid).toBe('same');
	});
});
