import type { JellyfinItem, RadioStation } from '$lib/types';
import type { ParsedEpisode } from '$lib/rss';
import type { LocalFeedMeta } from '$lib/stores/localPodcasts.svelte';

/**
 * Mode démonstration : un faux catalogue jouable, sans aucun serveur.
 *
 * Trois usages, tous réels :
 *  1. **Développement** — le lecteur (enchaînement, file, fondu, reprise, contrôles média) est
 *     enfin exerçable de bout en bout ; jusqu'ici seules des fonctions pures étaient testées, et
 *     les bugs de lecture n'apparaissaient qu'à l'usage.
 *  2. **Revue Google Play** — un examinateur sans serveur Jellyfin voyait une app vide, ce qui est
 *     une cause classique de rejet. Ici il voit une bibliothèque peuplée et peut écouter.
 *  3. **Isoler un bug** — reproduire un souci de lecture sans mettre Jellyfin dans l'équation.
 *
 * Mise en œuvre : une **connexion sentinelle** (`baseUrl === DEMO_BASE_URL`). Les clients d'API
 * détournent vers ce module quand ils la reconnaissent. Aucun drapeau global, donc aucun risque
 * que le mode démo « fuite » dans un usage réel : il suffit de se déconnecter pour en sortir.
 *
 * Les données sont générées ici, sans réseau ni fichier binaire embarqué : pochettes en SVG
 * (data URI) et audio en WAV synthétisé (voir `demoStreamUrl`).
 */

export const DEMO_BASE_URL = 'demo://tentacle';
export const DEMO_USER_ID = 'demo-user';

/** Identifiant de session du compte de connexion `demo`/`demo` (voir server/users.ts). Vit ici,
 * dans un module sans dépendance serveur, pour être importable aussi bien côté client (savoir
 * si l'utilisateur connecté EST ce compte) que côté serveur (l'authentifier) — un module sous
 * `$lib/server/` ne peut jamais être importé depuis du code client. */
export const DEMO_ACCOUNT_ID = 'demo-account';

export function isDemo(conn: { baseUrl: string } | null | undefined): boolean {
	return conn?.baseUrl === DEMO_BASE_URL;
}

const TICKS_PER_SEC = 10_000_000;
/** Marqueur d'image : sa seule présence fait demander la pochette par les composants. */
const DEMO_IMAGE_TAG = 'demo';

// `url` : piste réelle (fichier distant), lue telle quelle sans synthèse — voir demoStreamUrl.
// Absent : piste fictive, synthétisée en WAV à partir de `hz` (voir makeWav plus bas).
type DemoTrackSpec = { title: string; seconds: number; hz: number; url?: string };
type DemoAlbumSpec = {
	id: string;
	name: string;
	artist: string;
	year: number;
	genre: string;
	hue: number;
	tracks: DemoTrackSpec[];
};

/** Catalogue : volontairement petit mais suffisant pour exercer chaque écran (plusieurs albums,
 * plusieurs artistes, des durées courtes pour atteindre vite une fin de piste). */
const ALBUMS: DemoAlbumSpec[] = [
	{
		id: 'demo-album-1',
		name: 'Signaux du port',
		artist: 'Les Céphalopodes',
		year: 2021,
		genre: 'Électronique',
		hue: 178,
		tracks: [
			{ title: 'Phare intermittent', seconds: 42, hz: 220 },
			{ title: 'Marée basse', seconds: 35, hz: 262 },
			{ title: 'Corne de brume', seconds: 51, hz: 196 },
			{ title: 'Quai nº 7', seconds: 38, hz: 294 }
		]
	},
	{
		id: 'demo-album-2',
		name: 'Encre et néons',
		artist: 'Nadja Ors',
		year: 2019,
		genre: 'Ambient',
		hue: 32,
		tracks: [
			{ title: 'Ruelle mouillée', seconds: 44, hz: 330 },
			{ title: 'Enseigne cassée', seconds: 29, hz: 247 },
			{ title: 'Dernier métro', seconds: 47, hz: 175 }
		]
	},
	{
		id: 'demo-album-3',
		name: 'Huit bras',
		artist: 'Les Céphalopodes',
		year: 2024,
		genre: 'Rock',
		hue: 8,
		tracks: [
			{ title: 'Ventouses', seconds: 33, hz: 349 },
			{ title: 'Abysses', seconds: 56, hz: 147 },
			{ title: 'Rejet d’encre', seconds: 40, hz: 392 }
		]
	},
	{
		// Seul album « réel » du catalogue de démo : trois pistes effectivement libres de droits
		// (Kevin MacLeod, incompetech.com, licence Creative Commons BY 3.0 — nécessite crédit,
		// donné ici même dans le champ artiste puisqu'il est affiché partout où l'album l'est).
		// Fichiers distants, pas de synthèse (voir `url` sur DemoTrackSpec) : seul cas de la démo
		// qui dépend du réseau, comme les radios.
		id: 'demo-album-4',
		name: 'Musique libre (CC BY 3.0)',
		artist: 'Kevin MacLeod — incompetech.com',
		year: 2023,
		genre: 'Musique libre',
		hue: 45,
		tracks: [
			{
				title: 'Morning',
				seconds: 153,
				hz: 0,
				url: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Morning.mp3'
			},
			{
				title: 'Evening',
				seconds: 186,
				hz: 0,
				url: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Evening.mp3'
			},
			{
				title: 'Southern Gothic',
				seconds: 147,
				hz: 0,
				url: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Southern%20Gothic.mp3'
			}
		]
	}
];

/** Pochette SVG en data URI : nette à toute taille, aucun binaire à embarquer. */
export function demoArtwork(hue: number, label: string): string {
	const bg = `hsl(${hue} 38% 14%)`;
	const fg = `hsl(${hue} 70% 62%)`;
	const initials = label
		.split(/\s+/)
		.slice(0, 2)
		.map((w) => w[0]?.toUpperCase() ?? '')
		.join('');
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 32 32" shape-rendering="crispEdges">
<rect width="32" height="32" fill="${bg}"/>
<g fill="${fg}">
<rect x="6" y="6" width="20" height="2"/><rect x="4" y="8" width="24" height="2"/>
<rect x="4" y="10" width="6" height="8"/><rect x="22" y="10" width="6" height="8"/>
<rect x="12" y="12" width="8" height="2"/><rect x="12" y="16" width="8" height="2"/>
<rect x="8" y="22" width="4" height="6"/><rect x="14" y="22" width="4" height="6"/><rect x="20" y="22" width="4" height="6"/>
</g>
<text x="16" y="21" font-family="monospace" font-size="4" fill="${bg}" text-anchor="middle">${initials}</text>
</svg>`;
	return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function trackId(albumId: string, index: number): string {
	return `${albumId}-t${index + 1}`;
}

/** Tous les titres du catalogue, à plat, au format JellyfinItem. */
export function demoTracks(): JellyfinItem[] {
	const out: JellyfinItem[] = [];
	for (const album of ALBUMS) {
		album.tracks.forEach((t, i) => {
			out.push({
				Id: trackId(album.id, i),
				Name: t.title,
				Type: 'Audio',
				Album: album.name,
				AlbumId: album.id,
				AlbumArtist: album.artist,
				Artists: [album.artist],
				IndexNumber: i + 1,
				ProductionYear: album.year,
				RunTimeTicks: t.seconds * TICKS_PER_SEC,
				// Les composants ne demandent la pochette que si un tag d'image existe
				// (`AlbumPrimaryImageTag` / `ImageTags.Primary`) : sans ces marqueurs, les cartes
				// resteraient sur leur symbole ♪ et primaryImageUrl ne serait jamais appelé.
				AlbumPrimaryImageTag: DEMO_IMAGE_TAG,
				ImageTags: { Primary: DEMO_IMAGE_TAG },
				// Deux titres en favori, pour que l'écran Favoris ne soit pas vide.
				UserData: { IsFavorite: album.id === 'demo-album-1' && i < 2 }
			});
		});
	}
	return out;
}

export function demoAlbums(): JellyfinItem[] {
	return ALBUMS.map((a) => ({
		Id: a.id,
		Name: a.name,
		Type: 'MusicAlbum',
		AlbumArtist: a.artist,
		ProductionYear: a.year,
		ChildCount: a.tracks.length,
		ImageTags: { Primary: DEMO_IMAGE_TAG },
		RunTimeTicks: a.tracks.reduce((s, t) => s + t.seconds, 0) * TICKS_PER_SEC
	}));
}

export function demoArtists(): JellyfinItem[] {
	const names = [...new Set(ALBUMS.map((a) => a.artist))];
	return names.map((n) => ({
		Id: `demo-artist-${slug(n)}`,
		Name: n,
		Type: 'MusicArtist',
		ImageTags: { Primary: DEMO_IMAGE_TAG }
	}));
}

/** Une playlist de démonstration, pour que la section « Playlists Jellyfin » ne soit pas vide. */
export function demoPlaylists(): JellyfinItem[] {
	return [
		{
			Id: 'demo-playlist-1',
			Name: 'Mélange du port',
			Type: 'Playlist',
			ChildCount: 5,
			ImageTags: { Primary: DEMO_IMAGE_TAG }
		}
	];
}

/** Titres d'une playlist de démonstration (piochés dans plusieurs albums, comme une vraie). */
export function demoPlaylistItems(playlistId: string): JellyfinItem[] {
	if (playlistId !== 'demo-playlist-1') return [];
	const all = demoTracks();
	return [all[0], all[4], all[1], all[7], all[5]].filter(Boolean);
}

export function demoGenres(): string[] {
	return [...new Set(ALBUMS.map((a) => a.genre))].sort();
}

export function demoAlbumTracks(albumId: string): JellyfinItem[] {
	return demoTracks().filter((t) => t.AlbumId === albumId);
}

export function demoArtistTracks(artistId: string): JellyfinItem[] {
	const name = demoArtists().find((a) => a.Id === artistId)?.Name;
	return name ? demoTracks().filter((t) => t.AlbumArtist === name) : [];
}

/** Pochette associée à un identifiant d'album OU de titre. */
export function demoImageFor(itemId: string): string {
	const album = ALBUMS.find((a) => a.id === itemId || itemId.startsWith(`${a.id}-t`));
	if (album) return demoArtwork(album.hue, album.name);
	const artist = demoArtists().find((a) => a.Id === itemId);
	return demoArtwork(280, artist?.Name ?? 'Tentacle');
}

function slug(s: string): string {
	return s
		.toLowerCase()
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

/** Recherche insensible à la casse et aux accents, sur titres/albums/artistes. */
export function demoSearch(term: string, kind: 'audio' | 'album' | 'artist'): JellyfinItem[] {
	const q = slug(term);
	if (!q) return [];
	const match = (s: string | undefined) => (s ? slug(s).includes(q) : false);
	if (kind === 'album') return demoAlbums().filter((a) => match(a.Name) || match(a.AlbumArtist));
	if (kind === 'artist') return demoArtists().filter((a) => match(a.Name));
	return demoTracks().filter((t) => match(t.Name) || match(t.AlbumArtist) || match(t.Album));
}

// ---- Podcasts (abonnements « locaux », voir stores/localPodcasts.svelte.ts) ----

/** Préfixe reconnu comme flux de démonstration par `listEpisodes()` (api/localPodcasts.ts) :
 * court-circuite le téléchargement/analyse réel du flux, jamais atteint pour ces ids. */
export const DEMO_PODCAST_FEED_PREFIX = 'demo://podcast/';

type DemoEpisodeSpec = { title: string; description: string; seconds: number; hz: number; daysAgo: number };
type DemoPodcastSpec = {
	id: number;
	title: string;
	author: string;
	description: string;
	hue: number;
	episodes: DemoEpisodeSpec[];
};

const PODCASTS: DemoPodcastSpec[] = [
	{
		id: 900001,
		title: 'Journal des abysses',
		author: 'Institut Céphalopode',
		description:
			'Chronique (fictive) des grands fonds : bioluminescence, pression, et vie discrète loin de la surface.',
		hue: 200,
		episodes: [
			{
				title: 'Zone crépusculaire',
				description: 'Ce qui reste de lumière entre 200 et 1000 mètres, et qui y vit malgré tout.',
				seconds: 58,
				hz: 164,
				daysAgo: 0
			},
			{
				title: 'Pression et silence',
				description: "Pourquoi le grand large est plus calme qu'on ne l'imagine.",
				seconds: 64,
				hz: 146,
				daysAgo: 6
			},
			{
				title: 'Encre et fuite',
				description: 'Une vieille stratégie de défense, revisitée.',
				seconds: 49,
				hz: 174,
				daysAgo: 13
			}
		]
	},
	{
		id: 900002,
		title: 'Radio Ceph',
		author: 'Les Céphalopodes',
		description: "Les coulisses (fictives) du groupe qui a composé le catalogue de cette démo.",
		hue: 8,
		episodes: [
			{
				title: "Composer avec huit bras",
				description: "Retour sur l'enregistrement du dernier album.",
				seconds: 52,
				hz: 196,
				daysAgo: 1
			},
			{
				title: 'Le studio du port',
				description: "Où et comment le groupe enregistre, entre deux marées.",
				seconds: 61,
				hz: 220,
				daysAgo: 9
			}
		]
	}
];

export function isDemoPodcastFeed(feedUrl: string): boolean {
	return feedUrl.startsWith(DEMO_PODCAST_FEED_PREFIX);
}

/** Abonnements prêts à être injectés dans le store localPodcasts (voir DemoInvite.svelte). */
export function demoPodcastFeeds(): Array<{ podcastId: number; meta: LocalFeedMeta }> {
	return PODCASTS.map((p) => ({
		podcastId: p.id,
		meta: {
			feedUrl: `${DEMO_PODCAST_FEED_PREFIX}${p.id}`,
			title: p.title,
			artworkUrl: demoArtwork(p.hue, p.title),
			author: p.author,
			description: p.description
		}
	}));
}

/** Épisodes d'un flux de démonstration, au même format que parsePodcastFeed (rss.ts) — pour
 * que listEpisodes() les traite ensuite exactement comme un flux réel une fois récupérés. */
export function demoPodcastEpisodes(feedUrl: string): ParsedEpisode[] {
	const podcast = PODCASTS.find((p) => feedUrl === `${DEMO_PODCAST_FEED_PREFIX}${p.id}`);
	if (!podcast) return [];
	const artworkUrl = demoArtwork(podcast.hue, podcast.title);
	return podcast.episodes.map((ep, i) => ({
		id: podcast.id * 1000 + i,
		title: ep.title,
		description: ep.description,
		pubDate: new Date(Date.now() - ep.daysAgo * 86_400_000).toISOString(),
		durationSec: ep.seconds,
		enclosureUrl: demoEpisodeStreamUrl(podcast.id * 1000 + i, ep.seconds, ep.hz),
		artworkUrl
	}));
}

// ---- Radios (voir stores/radios.svelte.ts — pas de notion de connexion, juste une liste) ----

/** Trois flux publics réels, librement diffusables (SomaFM — service communautaire à but non
 * lucratif qui encourage explicitement le lien direct vers ses flux). Contrairement au reste de
 * la démo, une radio est par nature un flux en direct : pas d'équivalent « sans réseau » possible. */
export function demoRadios(): RadioStation[] {
	return [
		{
			id: 'demo-radio-groovesalad',
			name: 'Groove Salad (SomaFM)',
			streamUrl: 'https://ice1.somafm.com/groovesalad-128-mp3',
			faviconUrl: demoArtwork(150, 'Groove Salad'),
			tags: 'ambient, downtempo',
			homepage: 'https://somafm.com/groovesalad/'
		},
		{
			id: 'demo-radio-secretagent',
			name: 'Secret Agent (SomaFM)',
			streamUrl: 'https://ice1.somafm.com/secretagent-128-mp3',
			faviconUrl: demoArtwork(20, 'Secret Agent'),
			tags: 'lounge, spy jazz',
			homepage: 'https://somafm.com/secretagent/'
		},
		{
			id: 'demo-radio-dronezone',
			name: 'Drone Zone (SomaFM)',
			streamUrl: 'https://ice1.somafm.com/dronezone-128-mp3',
			faviconUrl: demoArtwork(260, 'Drone Zone'),
			tags: 'ambient, space music',
			homepage: 'https://somafm.com/dronezone/'
		}
	];
}

// ---- Audio synthétisé ----

const streamCache = new Map<string, string>();

/**
 * URL jouable pour un titre de démo : un WAV synthétisé (note tenue, avec attaque et chute
 * douces pour éviter les clics), fabriqué à la volée et mis en cache.
 *
 * Chaque titre a sa fréquence : on ENTEND donc les changements de piste, les enchaînements et les
 * fondus — ce qui est exactement ce qu'il faut pour vérifier le lecteur.
 */
export function demoStreamUrl(itemId: string): string {
	const spec = findTrackSpec(itemId);
	// Piste réelle : servie telle quelle, jamais mise en cache d'objet (ce n'est pas un blob
	// créé ici, rien à révoquer).
	if (spec.url) return spec.url;

	const cached = streamCache.get(itemId);
	if (cached) return cached;
	const url = URL.createObjectURL(makeWav(spec.seconds, spec.hz));
	streamCache.set(itemId, url);
	return url;
}

const episodeStreamCache = new Map<number, string>();

/** Même principe que demoStreamUrl, pour un épisode de podcast de démonstration. */
function demoEpisodeStreamUrl(episodeId: number, seconds: number, hz: number): string {
	const cached = episodeStreamCache.get(episodeId);
	if (cached) return cached;
	const url = URL.createObjectURL(makeWav(seconds, hz));
	episodeStreamCache.set(episodeId, url);
	return url;
}

/** Une piste de démo lue depuis un fichier distant réel (voir l'album « Musique libre ») :
 * incompatible avec le graphe Web Audio (égaliseur/normalisation), qui exige crossOrigin
 * sur l'élément audio — échoue silencieusement sans en-têtes CORS, que ce fichier n'envoie
 * pas. À utiliser pour exclure ces pistes de l'éligibilité EQ (voir eqEligible, +layout.svelte),
 * exactement comme les radios/podcasts le sont déjà pour la même raison. Sûr à appeler avec
 * n'importe quel id (y compris un vrai item Jellyfin) : ne matche que les pistes de ce module.
 */
export function isDemoExternalTrack(itemId: string): boolean {
	return Boolean(findTrackSpec(itemId).url);
}

function findTrackSpec(itemId: string): DemoTrackSpec {
	for (const album of ALBUMS) {
		const i = album.tracks.findIndex((_, idx) => trackId(album.id, idx) === itemId);
		if (i !== -1) return album.tracks[i];
	}
	return { title: '', seconds: 20, hz: 220 };
}

/** WAV PCM 16 bits mono, 8 kHz : largement suffisant pour une note, et léger. */
function makeWav(seconds: number, hz: number): Blob {
	const rate = 8000;
	const frames = Math.max(1, Math.round(seconds * rate));
	const buffer = new ArrayBuffer(44 + frames * 2);
	const view = new DataView(buffer);

	const ascii = (offset: number, text: string) => {
		for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
	};

	ascii(0, 'RIFF');
	view.setUint32(4, 36 + frames * 2, true);
	ascii(8, 'WAVE');
	ascii(12, 'fmt ');
	view.setUint32(16, 16, true); // taille du bloc fmt
	view.setUint16(20, 1, true); // PCM
	view.setUint16(22, 1, true); // mono
	view.setUint32(24, rate, true);
	view.setUint32(28, rate * 2, true); // octets/seconde
	view.setUint16(32, 2, true); // octets par échantillon
	view.setUint16(34, 16, true); // bits
	ascii(36, 'data');
	view.setUint32(40, frames * 2, true);

	const fade = Math.min(Math.round(rate * 0.05), Math.floor(frames / 2));
	for (let i = 0; i < frames; i++) {
		// Enveloppe : montée puis descente, pour ne pas claquer au début ni à la fin.
		let env = 1;
		if (i < fade) env = i / fade;
		else if (i > frames - fade) env = (frames - i) / fade;
		// Une quinte discrète par-dessus la fondamentale : plus musical qu'un sinus nu.
		const t = i / rate;
		const sample =
			Math.sin(2 * Math.PI * hz * t) * 0.5 + Math.sin(2 * Math.PI * hz * 1.5 * t) * 0.18;
		view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, sample * env)) * 0.3 * 0x7fff, true);
	}
	return new Blob([buffer], { type: 'audio/wav' });
}
