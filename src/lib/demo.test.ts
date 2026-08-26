import { describe, it, expect } from 'vitest';
import {
	DEMO_BASE_URL,
	isDemo,
	demoAlbums,
	demoArtists,
	demoTracks,
	demoGenres,
	demoAlbumTracks,
	demoArtistTracks,
	demoImageFor,
	demoSearch,
	demoArtwork
} from './demo';

describe('isDemo', () => {
	it('ne reconnaît que la connexion sentinelle', () => {
		expect(isDemo({ baseUrl: DEMO_BASE_URL })).toBe(true);
		expect(isDemo({ baseUrl: 'https://jellyfin.exemple.fr' })).toBe(false);
		expect(isDemo(null)).toBe(false);
		expect(isDemo(undefined)).toBe(false);
	});
});

describe('catalogue de démonstration', () => {
	it('expose plusieurs albums, plusieurs artistes et des genres', () => {
		expect(demoAlbums().length).toBeGreaterThanOrEqual(3);
		expect(demoArtists().length).toBeGreaterThanOrEqual(2);
		expect(demoGenres().length).toBeGreaterThanOrEqual(2);
	});

	it('donne des identifiants uniques à chaque titre', () => {
		const ids = demoTracks().map((t) => t.Id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('rattache chaque titre à un album existant', () => {
		const albumIds = new Set(demoAlbums().map((a) => a.Id));
		for (const t of demoTracks()) expect(albumIds.has(t.AlbumId!)).toBe(true);
	});

	it('renseigne une durée sur chaque titre (sinon la barre de progression reste inerte)', () => {
		for (const t of demoTracks()) expect(t.RunTimeTicks).toBeGreaterThan(0);
	});

	it('propose au moins un favori, pour que l’écran Favoris ne soit pas vide', () => {
		expect(demoTracks().some((t) => t.UserData?.IsFavorite)).toBe(true);
	});

	it('retrouve les titres d’un album, dans l’ordre', () => {
		const album = demoAlbums()[0];
		const tracks = demoAlbumTracks(album.Id);
		expect(tracks.length).toBeGreaterThan(1);
		expect(tracks.map((t) => t.IndexNumber)).toEqual([...tracks.map((t) => t.IndexNumber)].sort((a, b) => a! - b!));
	});

	it('retrouve les titres d’un artiste', () => {
		const artist = demoArtists()[0];
		const tracks = demoArtistTracks(artist.Id);
		expect(tracks.length).toBeGreaterThan(0);
		expect(tracks.every((t) => t.AlbumArtist === artist.Name)).toBe(true);
	});

	it('renvoie une liste vide pour un artiste inconnu', () => {
		expect(demoArtistTracks('demo-artist-inexistant')).toEqual([]);
	});
});

describe('demoSearch', () => {
	it('trouve un album par son nom, sans tenir compte de la casse ni des accents', () => {
		const name = demoAlbums()[0].Name;
		expect(demoSearch(name.toUpperCase(), 'album').length).toBeGreaterThan(0);
		// « cephalopodes » doit retrouver « Les Céphalopodes ».
		expect(demoSearch('cephalopodes', 'artist').length).toBeGreaterThan(0);
	});

	it('trouve un titre par son nom', () => {
		const title = demoTracks()[0].Name;
		expect(demoSearch(title, 'audio').some((t) => t.Name === title)).toBe(true);
	});

	it('renvoie une liste vide sur une recherche vide ou sans correspondance', () => {
		expect(demoSearch('', 'audio')).toEqual([]);
		expect(demoSearch('   ', 'album')).toEqual([]);
		expect(demoSearch('zzzzzzzz', 'artist')).toEqual([]);
	});
});

describe('pochettes', () => {
	it('produit une image SVG en data URI', () => {
		const url = demoArtwork(180, 'Mon Album');
		expect(url.startsWith('data:image/svg+xml')).toBe(true);
		expect(decodeURIComponent(url)).toContain('<svg');
	});

	it('donne une pochette pour un album ET pour un de ses titres', () => {
		const album = demoAlbums()[0];
		const track = demoAlbumTracks(album.Id)[0];
		// Même album → même pochette : la cohérence visuelle compte dans les grilles.
		expect(demoImageFor(track.Id)).toBe(demoImageFor(album.Id));
	});

	it('reste robuste sur un identifiant inconnu', () => {
		expect(demoImageFor('rien-du-tout').startsWith('data:image/svg+xml')).toBe(true);
	});
});
