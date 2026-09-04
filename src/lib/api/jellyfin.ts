// SPDX-License-Identifier: AGPL-3.0-or-later
import { browser } from '$app/environment';
import { fetchWithTimeout, ApiError } from '$lib/http';
import type { JellyfinConnection } from '$lib/stores/jellyfin.svelte';
import type { JellyfinItem } from '$lib/types';
import {
	isDemo,
	demoAlbums,
	demoArtists,
	demoTracks,
	demoGenres,
	demoAlbumTracks,
	demoArtistTracks,
	demoImageFor,
	demoSearch,
	demoStreamUrl,
	demoPlaylists,
	demoPlaylistItems
} from '$lib/demo';

export { ApiError as JellyfinApiError };

function normalizeBaseUrl(url: string): string {
	return url.replace(/\/+$/, '');
}

const DEVICE_ID_KEY = 'tentacle:jellyfin-device-id';

/** Jellyfin tracks clients by a stable device id; persisted so repeat logins look like the
 * same device instead of registering a new one every time. */
function getDeviceId(): string {
	if (!browser) return 'tentacle-web';
	let id = localStorage.getItem(DEVICE_ID_KEY);
	if (!id) {
		id = crypto.randomUUID();
		localStorage.setItem(DEVICE_ID_KEY, id);
	}
	return id;
}

function authHeader(token?: string): string {
	const base = `MediaBrowser Client="Tentacle", Device="Tentacle Web", DeviceId="${getDeviceId()}", Version="1.0.0"`;
	return token ? `${base}, Token="${token}"` : base;
}

export type JellyfinAuthResult = {
	token: string;
	userId: string;
	serverName?: string;
};

/** Standard Jellyfin username/password login — `POST /Users/AuthenticateByName`. */
export async function authenticateByName(
	baseUrl: string,
	username: string,
	password: string
): Promise<JellyfinAuthResult> {
	const base = normalizeBaseUrl(baseUrl);
	const res = await fetchWithTimeout(`${base}/Users/AuthenticateByName`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'X-Emby-Authorization': authHeader()
		},
		body: JSON.stringify({ Username: username, Pw: password })
	});
	if (!res.ok) {
		throw new ApiError(
			`Échec de connexion à Jellyfin (HTTP ${res.status}). Vérifie l'URL, l'identifiant et le mot de passe.`,
			res.status
		);
	}
	const data = await res.json();
	if (!data.AccessToken || !data.User?.Id) {
		throw new ApiError('Réponse Jellyfin inattendue : token ou identifiant utilisateur manquant.');
	}
	return { token: data.AccessToken, userId: data.User.Id, serverName: data.ServerId };
}

/** Verifies a server URL + token/userId actually work, via `GET /Users/{userId}`. */
export async function testConnection(baseUrl: string, token: string, userId: string): Promise<string> {
	const base = normalizeBaseUrl(baseUrl);
	const res = await fetchWithTimeout(`${base}/Users/${userId}`, {
		headers: { 'X-Emby-Token': token }
	});
	if (!res.ok) {
		throw new ApiError(`Jellyfin a refusé la connexion (HTTP ${res.status}).`, res.status);
	}
	const data = await res.json();
	return data.Name ?? 'Connecté';
}

/** Reachability check with no auth required — `GET /System/Info/Public`. */
export async function pingServer(baseUrl: string): Promise<string> {
	const base = normalizeBaseUrl(baseUrl);
	const res = await fetchWithTimeout(`${base}/System/Info/Public`);
	if (!res.ok) {
		throw new ApiError(`Serveur Jellyfin injoignable (HTTP ${res.status}).`, res.status);
	}
	const data = await res.json();
	return data.ServerName ?? base;
}

// ---- Navigation dans la collection musicale ----

/** Authenticated GET against the Jellyfin API, returning parsed JSON. */
async function jfGet<T>(conn: JellyfinConnection, path: string): Promise<T> {
	const base = normalizeBaseUrl(conn.baseUrl);
	const res = await fetchWithTimeout(`${base}${path}`, {
		headers: { 'X-Emby-Token': conn.token }
	});
	if (!res.ok) {
		throw new ApiError(`Jellyfin a répondu ${res.status} sur ${path}.`, res.status);
	}
	return (await res.json()) as T;
}

function buildQuery(params: Record<string, string | number | undefined>): string {
	return Object.entries(params)
		.filter(([, v]) => v !== undefined && v !== '')
		.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
		.join('&');
}

function itemsPath(userId: string, params: Record<string, string | number | undefined>): string {
	return `/Users/${userId}/Items?${buildQuery(params)}`;
}

/** Common `Fields` set so albums/songs carry artist, album linkage, artwork tags and
 * favorite state (UserData → cœur ♥). */
const ITEM_FIELDS = 'PrimaryImageAspectRatio,Artists,AlbumId,AlbumPrimaryImageTag,UserData';
const MAX_ITEMS = 500;

/** Finds the id of the user's music library (`CollectionType === 'music'`). Returns null if
 * the server has no dedicated music view — callers then browse without a parent filter. */
export async function getMusicViewId(conn: JellyfinConnection): Promise<string | null> {
	if (isDemo(conn)) return null;
	const data = await jfGet<{ Items?: (JellyfinItem & { CollectionType?: string })[] }>(
		conn,
		`/Users/${conn.userId}/Views`
	);
	const music = (data.Items ?? []).find((v) => v.CollectionType === 'music');
	return music?.Id ?? null;
}

/** Critère de tri des albums. */
export type AlbumSort = 'SortName' | 'ProductionYear' | 'DateCreated';

/** Une tranche de résultats + le total côté serveur, pour un chargement progressif honnête :
 * l'appelant sait combien d'éléments existent réellement et peut le dire à l'utilisateur,
 * au lieu de tronquer en silence. */
export type ItemsPage = { items: JellyfinItem[]; total: number };

/** Taille d'une tranche. Assez grande pour un défilement fluide, assez petite pour que le
 * premier affichage soit rapide même sur une très grosse bibliothèque. */
export const PAGE_SIZE = 100;

/**
 * Albums, par tranches. `startIndex` = position de départ (0 pour la première tranche).
 * Le `total` renvoyé vient de `TotalRecordCount` : c'est le nombre d'albums correspondant au
 * filtre sur le serveur, indépendamment de la tranche demandée.
 */
export async function getAlbumsPage(
	conn: JellyfinConnection,
	parentId?: string,
	opts?: { sortBy?: AlbumSort; genre?: string },
	startIndex = 0,
	limit = PAGE_SIZE
): Promise<ItemsPage> {
	if (isDemo(conn)) {
		const all = demoAlbums();
		return { items: all.slice(startIndex, startIndex + limit), total: all.length };
	}
	const sortBy = opts?.sortBy ?? 'SortName';
	// Nom → alphabétique ; année/ajout → plus récent d'abord.
	const sortOrder = sortBy === 'SortName' ? 'Ascending' : 'Descending';
	const data = await jfGet<{ Items?: JellyfinItem[]; TotalRecordCount?: number }>(
		conn,
		itemsPath(conn.userId, {
			ParentId: parentId,
			IncludeItemTypes: 'MusicAlbum',
			Recursive: 'true',
			SortBy: `${sortBy},SortName`,
			SortOrder: sortOrder,
			Genres: opts?.genre || undefined,
			Fields: ITEM_FIELDS,
			StartIndex: startIndex,
			Limit: limit
		})
	);
	const items = data.Items ?? [];
	return { items, total: data.TotalRecordCount ?? startIndex + items.length };
}

/** Genres musicaux de la bibliothèque (pour le filtre). */
export async function getMusicGenres(conn: JellyfinConnection, parentId?: string): Promise<string[]> {
	if (isDemo(conn)) return demoGenres();
	const data = await jfGet<{ Items?: { Name: string }[] }>(
		conn,
		`/MusicGenres?${buildQuery({
			ParentId: parentId,
			userId: conn.userId,
			SortBy: 'SortName',
			SortOrder: 'Ascending',
			Limit: 200
		})}`
	);
	return (data.Items ?? []).map((g) => g.Name).filter(Boolean);
}

/** Artistes d'album, par tranches (même principe que `getAlbumsPage`). */
export async function getArtistsPage(
	conn: JellyfinConnection,
	parentId?: string,
	startIndex = 0,
	limit = PAGE_SIZE
): Promise<ItemsPage> {
	if (isDemo(conn)) {
		const all = demoArtists();
		return { items: all.slice(startIndex, startIndex + limit), total: all.length };
	}
	const data = await jfGet<{ Items?: JellyfinItem[]; TotalRecordCount?: number }>(
		conn,
		`/Artists/AlbumArtists?${buildQuery({
			userId: conn.userId,
			ParentId: parentId,
			Recursive: 'true',
			SortBy: 'SortName',
			SortOrder: 'Ascending',
			// ProviderIds : porte l'identifiant MusicBrainz de l'artiste quand la bibliothèque
			// est taguée → évite une recherche MusicBrainz pour « Titres populaires ».
			Fields: 'ProviderIds',
			StartIndex: startIndex,
			Limit: limit
		})}`
	);
	const items = data.Items ?? [];
	return { items, total: data.TotalRecordCount ?? startIndex + items.length };
}

/** Titres aléatoires de toute la bibliothèque — pour « Lecture aléatoire » globale. */
export async function getRandomSongs(
	conn: JellyfinConnection,
	limit = 100,
	parentId?: string
): Promise<JellyfinItem[]> {
	if (isDemo(conn)) return [...demoTracks()].sort(() => Math.random() - 0.5).slice(0, limit);
	const data = await jfGet<{ Items?: JellyfinItem[] }>(
		conn,
		itemsPath(conn.userId, {
			ParentId: parentId,
			IncludeItemTypes: 'Audio',
			Recursive: 'true',
			SortBy: 'Random',
			Fields: ITEM_FIELDS,
			Limit: limit
		})
	);
	return data.Items ?? [];
}

/** Tous les titres d'un artiste (album-artist), en ordre d'album — pour « Tout lire ». */
export async function getArtistTracks(
	conn: JellyfinConnection,
	artistId: string
): Promise<JellyfinItem[]> {
	if (isDemo(conn)) return demoArtistTracks(artistId);
	const data = await jfGet<{ Items?: JellyfinItem[] }>(
		conn,
		itemsPath(conn.userId, {
			AlbumArtistIds: artistId,
			IncludeItemTypes: 'Audio',
			Recursive: 'true',
			SortBy: 'Album,ParentIndexNumber,IndexNumber',
			SortOrder: 'Ascending',
			Fields: ITEM_FIELDS,
			Limit: MAX_ITEMS
		})
	);
	return data.Items ?? [];
}

/**
 * Titres d'un artiste tries par nombre de lectures (les plus ecoutes d'abord) — repli local
 * pour « Titres populaires » quand la popularite ListenBrainz est indisponible.
 */
export async function getArtistTopPlayed(
	conn: JellyfinConnection,
	artistId: string,
	limit = 25
): Promise<JellyfinItem[]> {
	if (isDemo(conn)) return demoArtistTracks(artistId);
	const data = await jfGet<{ Items?: JellyfinItem[] }>(
		conn,
		itemsPath(conn.userId, {
			AlbumArtistIds: artistId,
			IncludeItemTypes: 'Audio',
			Recursive: 'true',
			SortBy: 'PlayCount,SortName',
			SortOrder: 'Descending',
			Fields: ITEM_FIELDS,
			Limit: limit
		})
	);
	return data.Items ?? [];
}

// ---- Découverte : favoris ♥, mix instantané, artistes similaires ----

/** Authenticated request with an arbitrary method (POST/DELETE), no JSON body expected back. */
async function jfSend(conn: JellyfinConnection, method: 'POST' | 'DELETE', path: string): Promise<void> {
	const base = normalizeBaseUrl(conn.baseUrl);
	const res = await fetchWithTimeout(`${base}${path}`, {
		method,
		headers: { 'X-Emby-Token': conn.token }
	});
	if (!res.ok) {
		throw new ApiError(`Jellyfin a répondu ${res.status} sur ${path}.`, res.status);
	}
}

/** Un client Jellyfin actif sur le réseau, contrôlable à distance (cible de diffusion). */
export type JellyfinSession = {
	id: string;
	deviceName: string;
	client: string;
	nowPlaying?: string;
};

type RawSession = {
	Id: string;
	DeviceId?: string;
	DeviceName?: string;
	Client?: string;
	SupportsRemoteControl?: boolean;
	NowPlayingItem?: { Name?: string };
	PlayableMediaTypes?: string[];
};

/**
 * Sessions Jellyfin que l'utilisateur peut piloter à distance (autres clients ouverts sur le
 * réseau : télé, autre téléphone…), pour « Lire sur… ». Exclut notre propre appareil et ne
 * garde que celles supportant le contrôle distant et la lecture audio.
 */
export async function getRemoteSessions(conn: JellyfinConnection): Promise<JellyfinSession[]> {
	if (isDemo(conn)) return []; // aucun appareil à piloter en démonstration
	const data = await jfGet<RawSession[]>(
		conn,
		`/Sessions?${buildQuery({ ControllableByUserId: conn.userId, ActiveWithinSeconds: 600 })}`
	);
	const myDevice = getDeviceId();
	return (data ?? [])
		.filter(
			(s) =>
				s.SupportsRemoteControl &&
				s.DeviceId !== myDevice &&
				(s.PlayableMediaTypes?.some((t) => t.toLowerCase() === 'audio') ?? true)
		)
		.map((s) => ({
			id: s.Id,
			deviceName: s.DeviceName || s.Client || 'Appareil',
			client: s.Client || '',
			nowPlaying: s.NowPlayingItem?.Name
		}));
}

/** Lance la lecture d'une liste d'items sur une autre session Jellyfin (diffusion réseau). */
export async function playOnSession(
	conn: JellyfinConnection,
	sessionId: string,
	itemIds: string[],
	startIndex = 0
): Promise<void> {
	await jfSend(
		conn,
		'POST',
		`/Sessions/${sessionId}/Playing?${buildQuery({
			playCommand: 'PlayNow',
			itemIds: itemIds.join(','),
			startIndex
		})}`
	);
}

/** Playlists de l'utilisateur (audio) côté Jellyfin. */
export async function getUserPlaylists(conn: JellyfinConnection): Promise<JellyfinItem[]> {
	if (isDemo(conn)) return demoPlaylists();
	const data = await jfGet<{ Items?: JellyfinItem[] }>(
		conn,
		itemsPath(conn.userId, {
			IncludeItemTypes: 'Playlist',
			Recursive: 'true',
			SortBy: 'SortName',
			SortOrder: 'Ascending',
			Limit: MAX_ITEMS
		})
	);
	return data.Items ?? [];
}

/**
 * Titres d'une playlist Jellyfin, **dans l'ordre de la playlist**.
 *
 * Contrairement aux albums, on ne passe volontairement AUCUN `SortBy` : Jellyfin renvoie alors
 * les éléments dans l'ordre voulu par la playlist, ce qui est le seul ordre qui ait un sens ici.
 */
export async function getPlaylistItems(
	conn: JellyfinConnection,
	playlistId: string
): Promise<JellyfinItem[]> {
	if (isDemo(conn)) return demoPlaylistItems(playlistId);
	const data = await jfGet<{ Items?: JellyfinItem[] }>(
		conn,
		itemsPath(conn.userId, {
			ParentId: playlistId,
			IncludeItemTypes: 'Audio',
			Fields: ITEM_FIELDS,
			Limit: MAX_ITEMS
		})
	);
	return data.Items ?? [];
}

/**
 * Métadonnées de titres à partir de leurs identifiants. Sert à la réparation du registre
 * hors-ligne : un fichier retrouvé sur le disque ne porte que son identifiant, il faut donc
 * pouvoir récupérer titre, artiste et durée pour reconstituer une entrée exploitable.
 */
export async function getItemsByIds(
	conn: JellyfinConnection,
	ids: string[]
): Promise<JellyfinItem[]> {
	if (ids.length === 0) return [];
	if (isDemo(conn)) {
		const wanted = new Set(ids);
		return demoTracks().filter((t) => wanted.has(t.Id));
	}
	const data = await jfGet<{ Items?: JellyfinItem[] }>(
		conn,
		itemsPath(conn.userId, { Ids: ids.join(','), Fields: ITEM_FIELDS, Limit: MAX_ITEMS })
	);
	return data.Items ?? [];
}

/** Crée une playlist (audio) avec des titres initiaux. */
export async function createPlaylist(
	conn: JellyfinConnection,
	name: string,
	itemIds: string[]
): Promise<void> {
	await jfSend(
		conn,
		'POST',
		`/Playlists?${buildQuery({
			Name: name,
			Ids: itemIds.join(','),
			UserId: conn.userId,
			MediaType: 'Audio'
		})}`
	);
}

/** Ajoute des titres à une playlist existante. */
export async function addToPlaylist(
	conn: JellyfinConnection,
	playlistId: string,
	itemIds: string[]
): Promise<void> {
	await jfSend(
		conn,
		'POST',
		`/Playlists/${playlistId}/Items?${buildQuery({ Ids: itemIds.join(','), userId: conn.userId })}`
	);
}

/** Marque/démarque un item (titre, album, artiste) comme favori côté Jellyfin. */
export async function setFavorite(
	conn: JellyfinConnection,
	itemId: string,
	favorite: boolean
): Promise<void> {
	// Démo : rien à écrire (l'interface fait déjà une mise à jour optimiste du ♥).
	if (isDemo(conn)) return;
	await jfSend(
		conn,
		favorite ? 'POST' : 'DELETE',
		`/Users/${conn.userId}/FavoriteItems/${itemId}`
	);
}

/** Tous les titres marqués favoris (♥), pour la vue « Favoris ». */
export async function getFavoriteSongs(conn: JellyfinConnection): Promise<JellyfinItem[]> {
	if (isDemo(conn)) return demoTracks().filter((t) => t.UserData?.IsFavorite);
	const data = await jfGet<{ Items?: JellyfinItem[] }>(
		conn,
		itemsPath(conn.userId, {
			IncludeItemTypes: 'Audio',
			Recursive: 'true',
			Filters: 'IsFavorite',
			SortBy: 'SortName',
			SortOrder: 'Ascending',
			Fields: ITEM_FIELDS,
			Limit: MAX_ITEMS
		})
	);
	return data.Items ?? [];
}

/**
 * « Mix sans fin » : à partir d'un titre/album/artiste, Jellyfin construit une file de titres
 * similaires (Instant Mix, comme la radio de Symfonium/Plexamp).
 */
export async function getInstantMix(
	conn: JellyfinConnection,
	itemId: string,
	limit = 100
): Promise<JellyfinItem[]> {
	if (isDemo(conn)) return [...demoTracks()].sort(() => Math.random() - 0.5).slice(0, limit);
	const data = await jfGet<{ Items?: JellyfinItem[] }>(
		conn,
		`/Items/${itemId}/InstantMix?${buildQuery({
			UserId: conn.userId,
			Fields: ITEM_FIELDS,
			Limit: limit
		})}`
	);
	return data.Items ?? [];
}

/** Artistes similaires selon Jellyfin (basé sur les métadonnées/genres). */
export async function getSimilarArtists(
	conn: JellyfinConnection,
	artistId: string,
	limit = 12
): Promise<JellyfinItem[]> {
	if (isDemo(conn)) return demoArtists().slice(0, limit);
	const data = await jfGet<{ Items?: JellyfinItem[] }>(
		conn,
		`/Artists/${artistId}/Similar?${buildQuery({
			userId: conn.userId,
			Fields: 'ProviderIds',
			Limit: limit
		})}`
	);
	return data.Items ?? [];
}

// Recherche côté serveur : indispensable car getAlbums/getArtists ne ramènent que les
// MAX_ITEMS premiers éléments (tri alphabétique) — un filtre client ne verrait jamais un
// artiste/album situé au-delà de ce lot. Jellyfin, lui, cherche dans toute la collection.
const SEARCH_LIMIT = 100;

export async function searchAlbums(
	conn: JellyfinConnection,
	term: string,
	parentId?: string
): Promise<JellyfinItem[]> {
	if (isDemo(conn)) return demoSearch(term, 'album');
	const data = await jfGet<{ Items?: JellyfinItem[] }>(
		conn,
		itemsPath(conn.userId, {
			ParentId: parentId,
			IncludeItemTypes: 'MusicAlbum',
			Recursive: 'true',
			SearchTerm: term,
			SortBy: 'SortName',
			SortOrder: 'Ascending',
			Fields: ITEM_FIELDS,
			Limit: SEARCH_LIMIT
		})
	);
	return data.Items ?? [];
}

export async function searchSongs(
	conn: JellyfinConnection,
	term: string,
	limit = 20
): Promise<JellyfinItem[]> {
	if (isDemo(conn)) return demoSearch(term, 'audio').slice(0, limit);
	const data = await jfGet<{ Items?: JellyfinItem[] }>(
		conn,
		itemsPath(conn.userId, {
			IncludeItemTypes: 'Audio',
			Recursive: 'true',
			SearchTerm: term,
			SortBy: 'SortName',
			SortOrder: 'Ascending',
			Fields: ITEM_FIELDS,
			Limit: limit
		})
	);
	return data.Items ?? [];
}

export async function searchArtists(
	conn: JellyfinConnection,
	term: string,
	parentId?: string
): Promise<JellyfinItem[]> {
	if (isDemo(conn)) return demoSearch(term, 'artist');
	const data = await jfGet<{ Items?: JellyfinItem[] }>(
		conn,
		`/Artists/AlbumArtists?${buildQuery({
			userId: conn.userId,
			ParentId: parentId,
			Recursive: 'true',
			SearchTerm: term,
			SortBy: 'SortName',
			SortOrder: 'Ascending',
			Fields: 'ProviderIds',
			Limit: SEARCH_LIMIT
		})}`
	);
	return data.Items ?? [];
}

export async function getAlbumsByArtist(
	conn: JellyfinConnection,
	artistId: string
): Promise<JellyfinItem[]> {
	if (isDemo(conn)) {
		const ids = new Set(demoArtistTracks(artistId).map((t) => t.AlbumId));
		return demoAlbums().filter((a) => ids.has(a.Id));
	}
	const data = await jfGet<{ Items?: JellyfinItem[] }>(
		conn,
		itemsPath(conn.userId, {
			IncludeItemTypes: 'MusicAlbum',
			Recursive: 'true',
			AlbumArtistIds: artistId,
			SortBy: 'ProductionYear,SortName',
			SortOrder: 'Descending',
			Fields: ITEM_FIELDS,
			Limit: MAX_ITEMS
		})
	);
	return data.Items ?? [];
}

export async function getAlbumTracks(conn: JellyfinConnection, albumId: string): Promise<JellyfinItem[]> {
	if (isDemo(conn)) return demoAlbumTracks(albumId);
	const data = await jfGet<{ Items?: JellyfinItem[] }>(
		conn,
		itemsPath(conn.userId, {
			ParentId: albumId,
			SortBy: 'ParentIndexNumber,IndexNumber,SortName',
			SortOrder: 'Ascending',
			Fields: ITEM_FIELDS
		})
	);
	return data.Items ?? [];
}

const SUGGESTION_LIMIT = 12;
// On récupère un lot large de titres joués, qu'on regroupe ensuite par album côté client.
const PLAYED_SONG_SCAN = 200;

/** Most recently added albums (sorted by date added). */
export async function getRecentlyAddedAlbums(
	conn: JellyfinConnection,
	parentId?: string
): Promise<JellyfinItem[]> {
	if (isDemo(conn)) return demoAlbums();
	const data = await jfGet<{ Items?: JellyfinItem[] }>(
		conn,
		itemsPath(conn.userId, {
			ParentId: parentId,
			IncludeItemTypes: 'MusicAlbum',
			Recursive: 'true',
			SortBy: 'DateCreated',
			SortOrder: 'Descending',
			Fields: ITEM_FIELDS,
			Limit: SUGGESTION_LIMIT
		})
	);
	return data.Items ?? [];
}

/**
 * Recently played songs (most recent first). Jellyfin tracks play history at the song level,
 * so these are grouped into albums client-side — matching how the Jellyfin Suggestions page
 * derives its "recently/frequently played" rows.
 */
export async function getRecentlyPlayedSongs(
	conn: JellyfinConnection,
	parentId?: string
): Promise<JellyfinItem[]> {
	if (isDemo(conn)) return demoTracks().slice(0, 8);
	const data = await jfGet<{ Items?: JellyfinItem[] }>(
		conn,
		itemsPath(conn.userId, {
			ParentId: parentId,
			IncludeItemTypes: 'Audio',
			Recursive: 'true',
			Filters: 'IsPlayed',
			SortBy: 'DatePlayed',
			SortOrder: 'Descending',
			Fields: ITEM_FIELDS,
			Limit: PLAYED_SONG_SCAN
		})
	);
	return data.Items ?? [];
}

/** Most frequently played songs (highest play count first), grouped into albums client-side. */
export async function getFrequentlyPlayedSongs(
	conn: JellyfinConnection,
	parentId?: string
): Promise<JellyfinItem[]> {
	if (isDemo(conn)) return demoTracks().slice(2, 10);
	const data = await jfGet<{ Items?: JellyfinItem[] }>(
		conn,
		itemsPath(conn.userId, {
			ParentId: parentId,
			IncludeItemTypes: 'Audio',
			Recursive: 'true',
			Filters: 'IsPlayed',
			SortBy: 'PlayCount',
			SortOrder: 'Descending',
			Fields: ITEM_FIELDS,
			Limit: PLAYED_SONG_SCAN
		})
	);
	return data.Items ?? [];
}

async function searchAudioByTitle(conn: JellyfinConnection, title: string): Promise<JellyfinItem[]> {
	const data = await jfGet<{ Items?: JellyfinItem[] }>(
		conn,
		itemsPath(conn.userId, {
			IncludeItemTypes: 'Audio',
			Recursive: 'true',
			SearchTerm: title,
			Fields: ITEM_FIELDS,
			Limit: 10
		})
	);
	return data.Items ?? [];
}

/** Retire les qualificatifs de titre qui font souvent diverger la source externe (Deezer,
 * ListenBrainz) du tag Jellyfin local : « (Remastered 2011) », « (feat. X) », « - Radio Edit »… */
function simplifyTrackTitle(title: string): string {
	return title
		.replace(/[([][^)\]]*[)\]]/g, '')
		.replace(/\s*[-–—]\s*(feat\.?|ft\.?|with|remaster(ed)?|live|radio edit|single version).*$/i, '')
		.replace(/\s{2,}/g, ' ')
		.trim();
}

/** Retire toute apostrophe/guillemet simple — droit ' ou courbe ’ (et variantes). Un titre
 * COURT où l'apostrophe est la seule différence (constaté : « Beggin' ») peut suffire à faire
 * échouer SearchTerm si le caractère exact ne correspond pas entre la source externe et le tag
 * local — la recherche Jellyfin ne semble pas les traiter comme équivalents. */
function stripApostrophes(title: string): string {
	return title
		.replace(/['’‘‚‛´`]/g, '')
		.replace(/\s{2,}/g, ' ')
		.trim();
}

/**
 * Best-effort match of an external track (e.g. a ListenBrainz playlist entry) to a playable
 * Audio item in the user's Jellyfin library. Searches by title, then prefers a result whose
 * artist matches; returns null when nothing plausible is found.
 */
export async function findAudioMatch(
	conn: JellyfinConnection,
	opts: { title: string; artist?: string }
): Promise<JellyfinItem | null> {
	if (isDemo(conn)) return demoSearch(opts.title, 'audio')[0] ?? null;
	const title = opts.title.trim();
	if (!title) return null;
	let items = await searchAudioByTitle(conn, title);
	let lastTried = title;
	// Le titre externe (Deezer/LB) porte souvent un qualificatif absent du tag local (ou
	// l'inverse) : « Titre (Remastered 2011) » ne matche pas « Titre » via SearchTerm. Un
	// second essai simplifié rattrape ces cas plutôt que d'abandonner le titre silencieusement.
	if (items.length === 0) {
		const simplified = simplifyTrackTitle(title);
		if (simplified && simplified.toLowerCase() !== title.toLowerCase()) {
			items = await searchAudioByTitle(conn, simplified);
			lastTried = simplified;
		}
	}
	// Troisième essai, apostrophe retirée — cas constaté séparément du précédent (« Beggin' »
	// n'a ni parenthèse ni qualificatif à retirer, donc le second essai ne change rien).
	if (items.length === 0) {
		const stripped = stripApostrophes(lastTried);
		if (stripped && stripped.toLowerCase() !== lastTried.toLowerCase()) {
			items = await searchAudioByTitle(conn, stripped);
		}
	}
	if (items.length === 0) return null;

	const artist = opts.artist?.trim().toLowerCase();
	if (artist) {
		const exact = items.find(
			(it) =>
				(it.Artists ?? []).some((a) => a.toLowerCase() === artist) ||
				(it.AlbumArtist ?? '').toLowerCase() === artist
		);
		if (exact) return exact;
		const loose = items.find((it) =>
			(it.Artists ?? []).some((a) => {
				const al = a.toLowerCase();
				return al.includes(artist) || artist.includes(al);
			})
		);
		if (loose) return loose;
	}

	const t = title.toLowerCase();
	return items.find((it) => it.Name.toLowerCase() === t) ?? items[0];
}

/** Absolute URL for an item's primary artwork (album cover / artist photo). */
export function primaryImageUrl(conn: JellyfinConnection, itemId: string, tag?: string): string {
	if (isDemo(conn)) return demoImageFor(itemId);
	const base = normalizeBaseUrl(conn.baseUrl);
	const q = buildQuery({ fillHeight: 300, fillWidth: 300, quality: 90, tag });
	return `${base}/Items/${itemId}/Images/Primary?${q}`;
}

/**
 * Playable audio URL for the shared `<audio>` element. Uses Jellyfin's `universal` endpoint:
 * broadly browser-native containers (mp3/aac) direct-play, everything else is transcoded to
 * progressive mp3 over plain HTTP so the native player can consume it without hls.js.
 */
export function songStreamUrl(
	conn: JellyfinConnection,
	itemId: string,
	maxBitrate = 320_000
): string {
	if (isDemo(conn)) return demoStreamUrl(itemId);
	const base = normalizeBaseUrl(conn.baseUrl);
	const q = buildQuery({
		UserId: conn.userId,
		DeviceId: getDeviceId(),
		api_key: conn.token,
		Container: 'mp3,aac,m4a',
		TranscodingContainer: 'mp3',
		TranscodingProtocol: 'http',
		AudioCodec: 'mp3',
		// Plafond de débit : au max, direct-play des conteneurs natifs ; plus bas, Jellyfin
		// transcode en mp3 à ce débit (économie de données sur mobile).
		MaxStreamingBitrate: maxBitrate
	});
	return `${base}/Audio/${itemId}/universal?${q}`;
}
