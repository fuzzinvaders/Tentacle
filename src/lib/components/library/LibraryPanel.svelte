<script lang="ts">
	import PixelPanel from '$lib/components/shared/PixelPanel.svelte';
	import SourceCard from '$lib/components/shared/SourceCard.svelte';
	import LibraryGrid from '$lib/components/library/LibraryGrid.svelte';
	import AlbumDetail from '$lib/components/library/AlbumDetail.svelte';
	import PlaylistsPanel from '$lib/components/library/PlaylistsPanel.svelte';
	import StatsPanel from '$lib/components/library/StatsPanel.svelte';
	import { jellyfin } from '$lib/stores/jellyfin.svelte';
	import { player } from '$lib/stores/player.svelte';
	import { ui } from '$lib/stores/ui.svelte';
	import { toasts } from '$lib/stores/toasts.svelte';
	import { songToTrack } from '$lib/jellyfinTrack';
	import {
		getMusicViewId,
		getAlbumsPage,
		getArtistsPage,
		getAlbumsByArtist,
		getAlbumTracks,
		getArtistTracks,
		getArtistTopPlayed,
		getRecentlyAddedAlbums,
		getRecentlyPlayedSongs,
		getFrequentlyPlayedSongs,
		getFavoriteSongs,
		setFavorite,
		getInstantMix,
		getSimilarArtists,
		getRandomSongs,
		getMusicGenres,
		getUserPlaylists,
		createPlaylist,
		addToPlaylist,
		searchAlbums,
		searchArtists,
		findAudioMatch,
		primaryImageUrl,
		JellyfinApiError,
		type AlbumSort
	} from '$lib/api/jellyfin';
	import { getTopRecordingsForArtist } from '$lib/api/listenbrainz';
	import { fetchPopularTracks } from '$lib/api/popular';
	import { searchArtistMbid } from '$lib/api/musicbrainz';
	import { mapLimit } from '$lib/concurrency';
	import type { JellyfinItem } from '$lib/types';
	import { contextMenu, type ContextMenuItem } from '$lib/stores/contextMenu.svelte';
	import { contextTrigger } from '$lib/actions/contextTrigger';
	import { tablist } from '$lib/actions/tablist';
	import { downloads } from '$lib/stores/downloads.svelte';
	import { downloadTrack, removeDownload, offlineSupported, repairDownloads } from '$lib/downloads';

	type Category =
		| 'suggestions'
		| 'artistes'
		| 'albums'
		| 'favoris'
		| 'playlists'
		| 'stats'
		| 'downloads';
	let category = $state<Category>('suggestions');
	let query = $state('');

	/**
	 * Catégories principales, celles où l'on va tous les jours. « Téléchargés » n'apparaît que
	 * sur mobile (hors-ligne natif).
	 *
	 * Playlists et Écoutes sont des destinations occasionnelles : les garder dans la même rangée
	 * gonflait la barre à sept boutons, ce qui la faisait déborder et occuper trop de place sur
	 * téléphone. Elles passent derrière un bouton de débordement « ⋯ » (voir `secondary`), qui
	 * affiche le libellé de la catégorie active quand on s'y trouve — l'endroit où l'on est reste
	 * donc toujours lisible.
	 */
	const categories = $derived<{ id: Category; label: string; accent: string }[]>([
		{ id: 'suggestions', label: 'Suggestions', accent: 'var(--coral)' },
		{ id: 'artistes', label: 'Artistes', accent: 'var(--teal)' },
		{ id: 'albums', label: 'Albums', accent: 'var(--gold)' },
		{ id: 'favoris', label: '♥ Favoris', accent: 'var(--coral)' },
		...(offlineSupported()
			? [{ id: 'downloads' as Category, label: '⭳ Téléchargés', accent: 'var(--teal)' }]
			: [])
	]);

	const secondary: { id: Category; label: string; accent: string }[] = [
		{ id: 'playlists', label: 'Playlists', accent: 'var(--rust)' },
		{ id: 'stats', label: '📊 Écoutes', accent: 'var(--teal)' }
	];

	const activeSecondary = $derived(secondary.find((s) => s.id === category) ?? null);

	function openSecondaryMenu(e: MouseEvent) {
		const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
		contextMenu.open(
			r.left,
			r.bottom + 4,
			secondary.map((s) => ({ label: s.label, run: () => switchCategory(s.id) })),
			'Aussi dans la bibliothèque'
		);
	}

	const searchPlaceholder: Record<Category, string> = {
		suggestions: 'Rechercher dans les suggestions…',
		artistes: 'Rechercher un artiste…',
		albums: 'Rechercher un album…',
		favoris: 'Rechercher un favori…',
		playlists: 'Rechercher une playlist…',
		stats: '',
		downloads: ''
	};

	// Data caches (per category), loaded lazily.
	let viewId: string | null | undefined = undefined; // undefined = not yet resolved
	let albums = $state<JellyfinItem[]>([]);
	let artists = $state<JellyfinItem[]>([]);
	let recentlyAdded = $state<JellyfinItem[]>([]);
	let recentlyPlayed = $state<JellyfinItem[]>([]);
	let frequentlyPlayed = $state<JellyfinItem[]>([]);
	let favoriteSongs = $state<JellyfinItem[]>([]);
	let loadedCats = new Set<Category>();

	// Tri & filtre des albums.
	let albumSort = $state<AlbumSort>('SortName');
	let albumGenre = $state('');
	let genres = $state<string[]>([]);
	let showDownloadedOnly = $state(false);
	// Badge « hors-ligne » sur les cartes d'album (téléchargements natifs).
	const albumBadge = (id: string) => downloads.albumHasDownloads(id);
	const albumSortOptions: { id: AlbumSort; label: string }[] = [
		{ id: 'SortName', label: 'Nom' },
		{ id: 'ProductionYear', label: 'Année' },
		{ id: 'DateCreated', label: 'Ajout récent' }
	];

	// Résultats de recherche serveur (albums/artistes), au-delà du cache local plafonné.
	let searchAlbumsRes = $state<JellyfinItem[]>([]);
	let searchArtistsRes = $state<JellyfinItem[]>([]);
	let searchLoading = $state(false);

	// Drill-down state.
	let selectedArtist = $state<JellyfinItem | null>(null);
	let artistAlbums = $state<JellyfinItem[]>([]);
	let similarArtists = $state<JellyfinItem[]>([]);
	let selectedAlbum = $state<JellyfinItem | null>(null);
	let albumTracks = $state<JellyfinItem[]>([]);
	let albumOrigin: 'category' | 'artist' = 'category';
	// Actions sur la vue artiste (« Tout lire » / « Titres populaires »).
	let playAllLoading = $state(false);
	let popularLoading = $state(false);
	let mixLoading = $state(false);

	let loading = $state(false);
	let loadingTracks = $state(false);
	let error = $state('');

	/** Collapse a list of played songs into distinct albums (dedup by AlbumId), preserving the
	 * incoming order (recent-first / most-played-first) so the derived album row keeps that rank. */
	function albumsFromSongs(songs: JellyfinItem[], limit: number): JellyfinItem[] {
		const seen = new Set<string>();
		const out: JellyfinItem[] = [];
		for (const s of songs) {
			const id = s.AlbumId;
			if (!id || seen.has(id)) continue;
			seen.add(id);
			out.push({
				Id: id,
				Name: s.Album ?? 'Album inconnu',
				Type: 'MusicAlbum',
				AlbumArtist: s.AlbumArtist ?? s.Artists?.[0],
				ImageTags: s.AlbumPrimaryImageTag ? { Primary: s.AlbumPrimaryImageTag } : undefined
			});
			if (out.length >= limit) break;
		}
		return out;
	}

	function imageOf(item: JellyfinItem, round = false) {
		const conn = jellyfin.connection;
		const tag = item.ImageTags?.Primary;
		return {
			id: item.Id,
			title: item.Name,
			subtitle: item.AlbumArtist || undefined,
			imageUrl: conn && tag ? primaryImageUrl(conn, item.Id, tag) : undefined,
			round
		};
	}

	const albumItems = $derived(albums.map((a) => imageOf(a)));
	const artistItems = $derived(artists.map((a) => ({ ...imageOf(a, true), subtitle: undefined })));
	const artistAlbumItems = $derived(artistAlbums.map((a) => imageOf(a)));
	const similarArtistItems = $derived(
		similarArtists.map((a) => ({ ...imageOf(a, true), subtitle: undefined }))
	);

	// Graine pour « Mix surprise » : un album récemment/souvent écouté (sinon récemment ajouté).
	const mixSeed = $derived(recentlyPlayed[0] ?? frequentlyPlayed[0] ?? recentlyAdded[0] ?? null);

	function resumePlayback() {
		if (player.current) player.playing = true;
	}

	// Recharge la liste d'albums selon le tri/genre courant (hors recherche), première tranche.
	async function reloadAlbums() {
		const conn = jellyfin.connection;
		if (!conn) return;
		error = '';
		loading = true;
		try {
			const parent = await ensureView();
			const page = await getAlbumsPage(conn, parent, {
				sortBy: albumSort,
				genre: albumGenre || undefined
			});
			albums = page.items;
			albumsTotal = page.total;
		} catch (err) {
			error = err instanceof JellyfinApiError ? err.message : 'Chargement des albums impossible.';
		} finally {
			loading = false;
		}
	}

	/**
	 * Chargement progressif. Avant, la bibliothèque demandait 500 éléments d'un coup et
	 * s'arrêtait là : au-delà, des albums étaient absents SANS que rien ne l'indique, et 500
	 * cartes avec pochettes rendues d'un bloc alourdissaient le défilement. On charge désormais
	 * par tranches, en affichant toujours « chargés / total » — donc plus de troncature muette.
	 */
	let albumsTotal = $state(0);
	let artistsTotal = $state(0);
	let loadingMore = $state(false);

	async function loadMoreAlbums() {
		const conn = jellyfin.connection;
		if (!conn || loadingMore) return;
		loadingMore = true;
		try {
			const parent = await ensureView();
			const page = await getAlbumsPage(
				conn,
				parent,
				{ sortBy: albumSort, genre: albumGenre || undefined },
				albums.length
			);
			albums = [...albums, ...page.items];
			albumsTotal = page.total;
		} catch (err) {
			error = err instanceof JellyfinApiError ? err.message : 'Chargement des albums impossible.';
		} finally {
			loadingMore = false;
		}
	}

	async function loadMoreArtists() {
		const conn = jellyfin.connection;
		if (!conn || loadingMore) return;
		loadingMore = true;
		try {
			const parent = await ensureView();
			const page = await getArtistsPage(conn, parent, artists.length);
			artists = [...artists, ...page.items];
			artistsTotal = page.total;
		} catch (err) {
			error = err instanceof JellyfinApiError ? err.message : 'Chargement des artistes impossible.';
		} finally {
			loadingMore = false;
		}
	}

	let shuffleLoading = $state(false);
	async function shuffleAll() {
		const conn = jellyfin.connection;
		if (!conn || shuffleLoading) return;
		shuffleLoading = true;
		try {
			const parent = await ensureView();
			const songs = await getRandomSongs(conn, 100, parent);
			if (songs.length === 0) {
				toasts.info('Aucun titre à lire.');
				return;
			}
			player.playCollection(songs.map((t) => songToTrack(conn, t)));
			toasts.info('Lecture aléatoire de la bibliothèque');
		} catch (err) {
			toasts.error(err instanceof JellyfinApiError ? err.message : 'Lecture aléatoire impossible.');
		} finally {
			shuffleLoading = false;
		}
	}

	// Sections de l'onglet Suggestions (albums), à l'image de la page Suggestions de Jellyfin.
	const suggestionSections = $derived([
		{ title: 'Récemment ajoutés', items: recentlyAdded.map((a) => imageOf(a)) },
		{ title: 'Lus récemment', items: recentlyPlayed.map((a) => imageOf(a)) },
		{ title: 'Fréquemment lus', items: frequentlyPlayed.map((a) => imageOf(a)) }
	].filter((s) => s.items.length > 0));

	// Recherche client-side dans la catégorie active (par titre et sous-titre).
	type GridItem = { id: string; title: string; subtitle?: string };
	const normalizedQuery = $derived(query.trim().toLowerCase());
	function matches(item: GridItem): boolean {
		if (!normalizedQuery) return true;
		return (
			item.title.toLowerCase().includes(normalizedQuery) ||
			(item.subtitle ?? '').toLowerCase().includes(normalizedQuery)
		);
	}

	// Avec une requête, on affiche les résultats serveur (toute la collection) ; sans requête,
	// la liste locale (lot alphabétique). Les suggestions restent filtrées côté client (ensemble
	// restreint et déjà chargé).
	const searchAlbumItems = $derived(searchAlbumsRes.map((a) => imageOf(a)));
	const searchArtistItems = $derived(
		searchArtistsRes.map((a) => ({ ...imageOf(a, true), subtitle: undefined }))
	);
	const filteredAlbumItems = $derived(
		(() => {
			const list = normalizedQuery ? searchAlbumItems : albumItems;
			return showDownloadedOnly ? list.filter((a) => downloads.albumHasDownloads(a.id)) : list;
		})()
	);
	const filteredArtistItems = $derived(normalizedQuery ? searchArtistItems : artistItems);
	// Favoris filtrés côté client (ensemble déjà chargé en entier).
	const filteredFavoriteSongs = $derived(
		normalizedQuery
			? favoriteSongs.filter(
					(s) =>
						s.Name.toLowerCase().includes(normalizedQuery) ||
						(s.Artists ?? []).join(', ').toLowerCase().includes(normalizedQuery)
				)
			: favoriteSongs
	);
	const filteredSuggestionSections = $derived(
		suggestionSections
			.map((s) => ({ ...s, items: s.items.filter(matches) }))
			.filter((s) => s.items.length > 0)
	);

	async function ensureView(): Promise<string | undefined> {
		const conn = jellyfin.connection;
		if (!conn) return undefined;
		if (viewId === undefined) {
			try {
				viewId = await getMusicViewId(conn);
			} catch {
				viewId = null;
			}
		}
		return viewId ?? undefined;
	}

	async function loadCategory(cat: Category) {
		// Stats/Playlists chargent leurs propres données (ListenBrainz) : rien à précharger ici.
		if (cat === 'stats' || cat === 'playlists' || cat === 'downloads') {
			loadedCats.add(cat);
			return;
		}
		const conn = jellyfin.connection;
		if (!conn || loadedCats.has(cat)) return;
		error = '';
		loading = true;
		try {
			const parent = await ensureView();
			if (cat === 'albums') {
				const page = await getAlbumsPage(conn, parent, {
					sortBy: albumSort,
					genre: albumGenre || undefined
				});
				albums = page.items;
				albumsTotal = page.total;
				if (genres.length === 0) getMusicGenres(conn, parent).then((g) => (genres = g)).catch(() => {});
			} else if (cat === 'artistes') {
				const page = await getArtistsPage(conn, parent);
				artists = page.items;
				artistsTotal = page.total;
			} else if (cat === 'favoris') favoriteSongs = await getFavoriteSongs(conn);
			else if (cat === 'suggestions') {
				const [added, recentSongs, freqSongs] = await Promise.all([
					getRecentlyAddedAlbums(conn, parent),
					getRecentlyPlayedSongs(conn, parent),
					getFrequentlyPlayedSongs(conn, parent)
				]);
				recentlyAdded = added;
				recentlyPlayed = albumsFromSongs(recentSongs, 12);
				frequentlyPlayed = albumsFromSongs(freqSongs, 12);
			}
			loadedCats.add(cat);
		} catch (err) {
			error = err instanceof JellyfinApiError ? err.message : 'Chargement de la bibliothèque impossible.';
		} finally {
			loading = false;
		}
	}

	function switchCategory(cat: Category) {
		category = cat;
		query = '';
		selectedArtist = null;
		selectedAlbum = null;
		similarArtists = [];
		searchAlbumsRes = [];
		searchArtistsRes = [];
	}

	// Recherche serveur anti-rebond : dès qu'une requête est saisie dans Albums/Artistes, on
	// interroge Jellyfin (toute la collection) plutôt que de filtrer le lot local plafonné.
	let searchTimer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		const term = query.trim();
		const cat = category;
		const conn = jellyfin.connection;
		if (!conn || (cat !== 'albums' && cat !== 'artistes') || term.length === 0) {
			clearTimeout(searchTimer);
			searchLoading = false;
			return;
		}
		clearTimeout(searchTimer);
		searchLoading = true;
		searchTimer = setTimeout(async () => {
			try {
				const parent = await ensureView();
				if (cat === 'albums') searchAlbumsRes = await searchAlbums(conn, term, parent);
				else searchArtistsRes = await searchArtists(conn, term, parent);
			} catch (err) {
				error = err instanceof JellyfinApiError ? err.message : 'Recherche impossible.';
			} finally {
				searchLoading = false;
			}
		}, 300);
		return () => clearTimeout(searchTimer);
	});

	function findAlbum(albumId: string): JellyfinItem | undefined {
		return (
			albums.find((a) => a.Id === albumId) ??
			searchAlbumsRes.find((a) => a.Id === albumId) ??
			artistAlbums.find((a) => a.Id === albumId) ??
			recentlyAdded.find((a) => a.Id === albumId) ??
			recentlyPlayed.find((a) => a.Id === albumId) ??
			frequentlyPlayed.find((a) => a.Id === albumId)
		);
	}

	async function openAlbum(albumId: string, origin: 'category' | 'artist') {
		const conn = jellyfin.connection;
		if (!conn) return;
		const album = findAlbum(albumId);
		if (!album) return;
		selectedAlbum = album;
		albumOrigin = origin;
		albumTracks = [];
		error = '';
		loadingTracks = true;
		try {
			albumTracks = await getAlbumTracks(conn, albumId);
		} catch (err) {
			error = err instanceof JellyfinApiError ? err.message : 'Chargement des titres impossible.';
		} finally {
			loadingTracks = false;
		}
	}

	async function openArtist(artistId: string) {
		const conn = jellyfin.connection;
		if (!conn) return;
		const artist =
			artists.find((a) => a.Id === artistId) ??
			searchArtistsRes.find((a) => a.Id === artistId) ??
			similarArtists.find((a) => a.Id === artistId);
		if (!artist) return;
		selectedArtist = artist;
		artistAlbums = [];
		similarArtists = [];
		error = '';
		loading = true;
		try {
			artistAlbums = await getAlbumsByArtist(conn, artistId);
		} catch (err) {
			error = err instanceof JellyfinApiError ? err.message : 'Chargement des albums impossible.';
		} finally {
			loading = false;
		}
		// Artistes similaires : hors du bloc principal (échec non bloquant, souvent vide si la
		// bibliothèque n'a pas de métadonnées de genre).
		try {
			similarArtists = await getSimilarArtists(conn, artistId);
		} catch {
			similarArtists = [];
		}
	}

	/** « Tout lire » : enchaîne tous les titres de l'artiste (ordre d'album). */
	async function playAllArtist() {
		const conn = jellyfin.connection;
		if (!conn || !selectedArtist || playAllLoading) return;
		playAllLoading = true;
		try {
			const tracks = await getArtistTracks(conn, selectedArtist.Id);
			if (tracks.length === 0) {
				toasts.info('Aucun titre pour cet artiste.');
				return;
			}
			player.playCollection(tracks.map((t) => songToTrack(conn, t)));
			toasts.info(`${tracks.length} titre(s) en lecture`);
		} catch (err) {
			toasts.error(err instanceof JellyfinApiError ? err.message : 'Lecture impossible.');
		} finally {
			playAllLoading = false;
		}
	}

	/**
	 * « Titres populaires » : titres globalement les plus écoutés de l'artiste (ListenBrainz),
	 * limités à ceux réellement présents dans ta bibliothèque Jellyfin (seuls jouables).
	 * MBID de l'artiste = tag Jellyfin si présent, sinon recherche MusicBrainz.
	 */
	async function playPopular() {
		const conn = jellyfin.connection;
		if (!conn || !selectedArtist || popularLoading) return;
		popularLoading = true;
		try {
			const artistName = selectedArtist.Name;
			let found: JellyfinItem[] = [];
			let viaGlobal = false;

			// 1. Popularité globale : Deezer (via proxy serveur), puis ListenBrainz en secours.
			//    Deezer est gratuit/sans clé ; LB sert de repli (mobile sans serveur), mais son
			//    endpoint de popularité est souvent désactivé → on isole les échecs.
			let popular = await fetchPopularTracks(artistName);
			if (popular.length === 0) {
				try {
					const ids = selectedArtist.ProviderIds ?? {};
					let mbid = ids.MusicBrainzArtist ?? ids.MusicBrainzArtistId ?? '';
					if (!mbid) mbid = (await searchArtistMbid(artistName)) ?? '';
					if (mbid) popular = await getTopRecordingsForArtist(mbid);
				} catch {
					/* Popularité ListenBrainz indisponible. */
				}
			}
			if (popular.length > 0) {
				// Matche les titres populaires à la bibliothèque (au plus 30, 6 recherches en //).
				const matched = await mapLimit(popular.slice(0, 30), 6, (p) =>
					findAudioMatch(conn, { title: p.title, artist: p.artist || artistName }).catch(() => null)
				);
				const seen = new Set<string>();
				for (const m of matched) {
					if (m && !seen.has(m.Id)) {
						seen.add(m.Id);
						found.push(m);
					}
				}
				viaGlobal = found.length > 0;
			}

			// 2. Repli local : les titres de l'artiste les plus écoutés dans la bibliothèque.
			if (found.length === 0) {
				found = await getArtistTopPlayed(conn, selectedArtist.Id);
			}

			if (found.length === 0) {
				toasts.info('Aucun titre trouvé pour cet artiste.');
				return;
			}
			player.playCollection(found.map((t) => songToTrack(conn, t)));
			toasts.info(
				viaGlobal
					? `${found.length} titre(s) populaire(s) en lecture`
					: `${found.length} titre(s) les plus écoutés en lecture`
			);
		} catch (err) {
			toasts.error(err instanceof JellyfinApiError ? err.message : 'Titres populaires indisponibles.');
		} finally {
			popularLoading = false;
		}
	}

	/** « Mix sans fin » : Jellyfin construit une file de titres similaires à partir d'un item. */
	async function startMix(itemId: string, label: string) {
		const conn = jellyfin.connection;
		if (!conn || mixLoading) return;
		mixLoading = true;
		try {
			const tracks = await getInstantMix(conn, itemId);
			if (tracks.length === 0) {
				toasts.info('Aucun mix disponible pour cet élément.');
				return;
			}
			player.playCollection(tracks.map((t) => songToTrack(conn, t)));
			toasts.info(`Mix « ${label} » — ${tracks.length} titres`);
		} catch (err) {
			toasts.error(err instanceof JellyfinApiError ? err.message : 'Mix indisponible.');
		} finally {
			mixLoading = false;
		}
	}

	/** Bascule l'état favori ♥ d'un titre côté Jellyfin, et met à jour l'affichage local. */
	async function toggleFavorite(track: JellyfinItem) {
		const conn = jellyfin.connection;
		if (!conn) return;
		const next = !(track.UserData?.IsFavorite ?? false);
		// Optimiste : on met à jour tout de suite les vues qui référencent ce titre.
		const apply = (value: boolean) => {
			for (const list of [albumTracks, favoriteSongs]) {
				for (const t of list) {
					if (t.Id === track.Id) t.UserData = { ...(t.UserData ?? {}), IsFavorite: value };
				}
			}
			albumTracks = [...albumTracks];
		};
		apply(next);
		// Retiré : on l'enlève tout de suite de la liste Favoris ; ajouté : il y apparaîtra au
		// prochain chargement de la vue.
		if (!next) favoriteSongs = favoriteSongs.filter((t) => t.Id !== track.Id);
		loadedCats.delete('favoris');
		try {
			await setFavorite(conn, track.Id, next);
			toasts.info(next ? '♥ Ajouté aux favoris' : 'Retiré des favoris');
		} catch (err) {
			apply(!next); // revert l'état des titres visibles
			toasts.error(err instanceof JellyfinApiError ? err.message : 'Favori impossible.');
		}
	}

	function closeAlbum() {
		selectedAlbum = null;
		albumTracks = [];
	}

	function playTrack(item: JellyfinItem) {
		const conn = jellyfin.connection;
		if (!conn) return;
		player.playNow(songToTrack(conn, item));
	}

	function playAlbum() {
		const conn = jellyfin.connection;
		if (!conn || albumTracks.length === 0) return;
		player.playCollection(albumTracks.map((t) => songToTrack(conn, t)));
	}

	function queueAlbum() {
		const conn = jellyfin.connection;
		if (!conn || albumTracks.length === 0) return;
		for (const t of albumTracks) player.enqueue(songToTrack(conn, t));
		toasts.info(`${albumTracks.length} titre${albumTracks.length > 1 ? 's' : ''} ajouté${albumTracks.length > 1 ? 's' : ''} à la file`);
	}

	function playNextTrack(item: JellyfinItem) {
		const conn = jellyfin.connection;
		if (!conn) return;
		player.playNext(songToTrack(conn, item));
		toasts.info(`« ${item.Name} » sera lu ensuite`);
	}

	function enqueueTrack(item: JellyfinItem) {
		const conn = jellyfin.connection;
		if (!conn) return;
		player.enqueue(songToTrack(conn, item));
		toasts.info(`« ${item.Name} » ajouté à la file`);
	}

	async function toggleDownload(item: JellyfinItem) {
		const conn = jellyfin.connection;
		if (!conn) return;
		if (downloads.has(item.Id)) {
			if (!confirm(`Supprimer le téléchargement de « ${item.Name} » ?`)) return;
			await removeDownload(item.Id);
			toasts.info('Téléchargement supprimé');
			return;
		}
		toasts.info(`Téléchargement de « ${item.Name} »…`);
		try {
			await downloadTrack(conn, item);
			toasts.info(`« ${item.Name} » disponible hors-ligne`);
		} catch {
			toasts.error('Téléchargement impossible.');
		}
	}

	// Catégorie « Téléchargés » : grille d'albums hors-ligne (depuis les manifestes), hors réseau.
	const downloadedAlbumItems = $derived(
		downloads.albums.map((m) => ({
			id: m.albumId,
			title: m.name,
			subtitle: m.artist || undefined,
			imageUrl: m.artworkUrl
		}))
	);
	const downloadsTotalSize = $derived(downloads.totalSize);

	// Réconciliation registre ↔ fichiers présents (voir repairDownloads).
	let repairing = $state(false);
	async function repair() {
		if (repairing) return;
		repairing = true;
		try {
			const r = await repairDownloads(jellyfin.connection);
			const parts: string[] = [];
			if (r.adoptes > 0) parts.push(`${r.adoptes} retrouvé(s)`);
			if (r.retires > 0) parts.push(`${r.retires} entrée(s) morte(s) retirée(s)`);
			if (r.sansMetadonnees > 0) {
				parts.push(
					`${r.sansMetadonnees} fichier(s) non identifiable(s)${jellyfin.connected ? '' : ' — reconnecte Jellyfin'}`
				);
			}
			toasts.info(parts.length ? parts.join(' · ') : 'Tout est déjà cohérent.');
		} catch (err) {
			toasts.error(
				`Réanalyse impossible : ${err instanceof Error ? err.message : 'erreur inconnue'}`
			);
		} finally {
			repairing = false;
		}
	}
	function formatSize(bytes: number): string {
		if (bytes <= 0) return '';
		const mb = bytes / (1024 * 1024);
		return mb >= 1024 ? `${(mb / 1024).toFixed(1)} Go` : `${Math.round(mb)} Mo`;
	}
	/** Ouvre un album téléchargé depuis son manifeste (sans réseau) : titres locaux jouables,
	 * titres non téléchargés grisés par AlbumDetail. */
	function openOfflineAlbum(albumId: string) {
		const m = downloads.getAlbum(albumId);
		if (!m) return;
		selectedAlbum = {
			Id: m.albumId,
			Name: m.name,
			Type: 'MusicAlbum',
			AlbumArtist: m.artist
		};
		albumOrigin = 'category';
		albumTracks = m.tracks;
		error = '';
	}

	let albumDlBusy = $state(false);
	let albumDlProgress = $state<{ done: number; total: number } | null>(null);
	async function toggleAlbumDownload() {
		const conn = jellyfin.connection;
		if (!conn || albumTracks.length === 0 || albumDlBusy) return;
		albumDlBusy = true;
		try {
			const allDownloaded = albumTracks.every((t) => downloads.has(t.Id));
			if (allDownloaded) {
				if (!confirm(`Supprimer le téléchargement de « ${selectedAlbum?.Name ?? 'cet album'} » ?`))
					return;
				for (const t of albumTracks) await removeDownload(t.Id);
				if (selectedAlbum) downloads.dropManifest(selectedAlbum.Id);
				toasts.info("Téléchargements de l'album supprimés");
				return;
			}
			const total = albumTracks.length;
			let processed = 0;
			let ok = 0;
			albumDlProgress = { done: 0, total };
			await mapLimit(albumTracks, 2, async (t) => {
				try {
					await downloadTrack(conn, t);
					ok++;
				} catch {
					/* titre en échec ignoré ; le compteur reflète les réussites */
				}
				processed++;
				albumDlProgress = { done: processed, total };
			});
			// Manifeste (liste complète) pour la catégorie « Téléchargés » hors-ligne.
			if (selectedAlbum) {
				const tag = selectedAlbum.ImageTags?.Primary;
				downloads.setManifest({
					albumId: selectedAlbum.Id,
					name: selectedAlbum.Name,
					artist: selectedAlbum.AlbumArtist ?? '',
					artworkUrl: tag ? primaryImageUrl(conn, selectedAlbum.Id, tag) : undefined,
					tracks: albumTracks
				});
			}
			toasts.info(`Album téléchargé (${ok}/${total})`);
		} finally {
			albumDlBusy = false;
			albumDlProgress = null;
		}
	}

	// ---- Favori générique (album/artiste) + menus contextuels des cartes ----
	function toggleFavoriteItem(item: JellyfinItem) {
		const conn = jellyfin.connection;
		if (!conn) return;
		const next = !(item.UserData?.IsFavorite ?? false);
		item.UserData = { ...(item.UserData ?? {}), IsFavorite: next }; // maj optimiste (label)
		setFavorite(conn, item.Id, next)
			.then(() => toasts.info(next ? '♥ Ajouté aux favoris' : 'Retiré des favoris'))
			.catch(() => toasts.error('Favori impossible.'));
	}

	async function playAlbumById(id: string) {
		const conn = jellyfin.connection;
		if (!conn) return;
		const tracks = await getAlbumTracks(conn, id);
		if (tracks.length) player.playCollection(tracks.map((t) => songToTrack(conn, t)));
	}
	async function albumTracksAction(id: string, action: 'next' | 'queue') {
		const conn = jellyfin.connection;
		if (!conn) return;
		const tracks = await getAlbumTracks(conn, id);
		if (tracks.length === 0) return;
		const mapped = tracks.map((t) => songToTrack(conn, t));
		if (action === 'next') player.queueNext(mapped);
		else for (const t of mapped) player.enqueue(t);
		toasts.info(action === 'next' ? 'Album inséré à la suite' : 'Album ajouté à la file');
	}
	async function playAllArtistById(id: string) {
		const conn = jellyfin.connection;
		if (!conn) return;
		const tracks = await getArtistTracks(conn, id);
		if (tracks.length) player.playCollection(tracks.map((t) => songToTrack(conn, t)));
	}

	function albumMenu(id: string): { items: ContextMenuItem[]; title?: string } {
		const album = findAlbum(id);
		if (!album) return { items: [] };
		const fav = album.UserData?.IsFavorite ?? false;
		return {
			title: album.Name,
			items: [
				{ label: "Lire l'album", icon: '▶', run: () => playAlbumById(id) },
				{ label: 'Lire ensuite', icon: '⏭', run: () => albumTracksAction(id, 'next') },
				{ label: 'Ajouter à la file', icon: '＋', run: () => albumTracksAction(id, 'queue') },
				{ label: 'Mix sans fin', icon: '∞', run: () => startMix(id, album.Name) },
				{
					label: fav ? 'Retirer des favoris' : 'Ajouter aux favoris',
					icon: fav ? '♥' : '♡',
					run: () => toggleFavoriteItem(album)
				}
			]
		};
	}

	// « Ajouter à une playlist » : rouvre le menu contextuel avec les playlists de l'utilisateur
	// (au même endroit) + création d'une nouvelle playlist.
	async function addToPlaylistFlow(item: JellyfinItem) {
		const conn = jellyfin.connection;
		if (!conn) return;
		const x = contextMenu.x;
		const y = contextMenu.y;
		try {
			const playlists = await getUserPlaylists(conn);
			const items: ContextMenuItem[] = [
				{
					label: 'Nouvelle playlist…',
					icon: '＋',
					run: async () => {
						const name = window.prompt('Nom de la playlist :')?.trim();
						if (!name) return;
						try {
							await createPlaylist(conn, name, [item.Id]);
							toasts.info(`Playlist « ${name} » créée`);
						} catch {
							toasts.error('Création de la playlist impossible.');
						}
					}
				},
				...playlists.map((p) => ({
					label: p.Name,
					icon: '≡',
					run: async () => {
						try {
							await addToPlaylist(conn, p.Id, [item.Id]);
							toasts.info(`Ajouté à « ${p.Name} »`);
						} catch {
							toasts.error('Ajout à la playlist impossible.');
						}
					}
				}))
			];
			contextMenu.open(x, y, items, 'Ajouter à une playlist');
		} catch {
			toasts.error('Playlists indisponibles.');
		}
	}

	function favSongMenu(song: JellyfinItem): { items: ContextMenuItem[]; title?: string } {
		return {
			title: song.Name,
			items: [
				{ label: 'Lire', icon: '▶', run: () => playTrack(song) },
				{ label: 'Lire ensuite', icon: '⏭', run: () => playNextTrack(song) },
				{ label: 'Ajouter à la file', icon: '＋', run: () => enqueueTrack(song) },
				{ label: 'Ajouter à une playlist…', icon: '≡', run: () => addToPlaylistFlow(song) },
				{ label: 'Retirer des favoris', icon: '♥', danger: true, run: () => toggleFavorite(song) }
			]
		};
	}

	function findArtist(id: string): JellyfinItem | undefined {
		return (
			artists.find((a) => a.Id === id) ??
			searchArtistsRes.find((a) => a.Id === id) ??
			similarArtists.find((a) => a.Id === id)
		);
	}
	function artistMenu(id: string): { items: ContextMenuItem[]; title?: string } {
		const artist = findArtist(id);
		if (!artist) return { items: [] };
		const fav = artist.UserData?.IsFavorite ?? false;
		return {
			title: artist.Name,
			items: [
				{ label: 'Tout lire', icon: '▶', run: () => playAllArtistById(id) },
				{ label: 'Mix sans fin', icon: '∞', run: () => startMix(id, artist.Name) },
				{
					label: fav ? 'Retirer des favoris' : 'Ajouter aux favoris',
					icon: fav ? '♥' : '♡',
					run: () => toggleFavoriteItem(artist)
				}
			]
		};
	}

	function playNextAlbum() {
		const conn = jellyfin.connection;
		if (!conn || albumTracks.length === 0) return;
		player.queueNext(albumTracks.map((t) => songToTrack(conn, t)));
		toasts.info(`Album inséré à la suite (${albumTracks.length} titres)`);
	}

	function goToConfig() {
		ui.activeSpace = 'config';
	}

	// La recherche n'a de sens que sur les vues-listes (pas dans le détail album,
	// la sous-vue d'un artiste, ni la catégorie Playlists encore vide).
	const showSearch = $derived(
		!selectedAlbum &&
			category !== 'playlists' &&
			category !== 'stats' &&
			category !== 'downloads' &&
			!(category === 'artistes' && selectedArtist)
	);
	const noResults = $derived(normalizedQuery.length > 0);
	function emptyMessage(base: string): string {
		return noResults ? `Aucun résultat pour « ${query.trim()} ».` : base;
	}

	// Lazily load the active category whenever we're connected; reset caches on disconnect.
	$effect(() => {
		if (jellyfin.connected) {
			if (!loadedCats.has(category)) loadCategory(category);
		} else {
			viewId = undefined;
			albums = [];
			artists = [];
			recentlyAdded = [];
			recentlyPlayed = [];
			frequentlyPlayed = [];
			favoriteSongs = [];
			loadedCats = new Set();
			selectedArtist = null;
			selectedAlbum = null;
			similarArtists = [];
			searchAlbumsRes = [];
			searchArtistsRes = [];
		}
	});
</script>

{#if !jellyfin.connected}
	<PixelPanel>
		<SourceCard index={1} name="Jellyfin" accent="var(--gold-bright)" />
		<div class="connect-prompt">
			<h3>Relier la collection</h3>
			<p>Connecte Jellyfin depuis Configuration pour ouvrir la bibliothèque.</p>
			<button type="button" class="pixel-btn" onclick={goToConfig}>Aller à la configuration</button>
		</div>
	</PixelPanel>
{:else}
	<PixelPanel>
		<div class="library-categories" role="tablist" aria-label="Catégories de la bibliothèque" use:tablist>
			{#each categories as cat (cat.id)}
				<button
					type="button"
					class="category-btn"
					style:--accent={cat.accent}
					role="tab"
					aria-selected={category === cat.id}
					tabindex={category === cat.id ? 0 : -1}
					class:is-active={category === cat.id}
					onclick={() => switchCategory(cat.id)}
				>
					{cat.label}
				</button>
			{/each}
			<button
				type="button"
				class="category-btn"
				style:--accent={activeSecondary?.accent ?? 'var(--rust)'}
				role="tab"
				aria-selected={activeSecondary !== null}
				tabindex={activeSecondary !== null ? 0 : -1}
				aria-haspopup="menu"
				class:is-active={activeSecondary !== null}
				title="Playlists et statistiques d'écoute"
				onclick={openSecondaryMenu}
			>
				{activeSecondary ? activeSecondary.label : '⋯'}
			</button>
		</div>

		{#if showSearch}
			<div class="library-search">
				<input
					type="search"
					class="pixel-input"
					placeholder={searchPlaceholder[category]}
					bind:value={query}
					aria-label={searchPlaceholder[category]}
				/>
			</div>
		{/if}

		{#if error}
			<p class="error">{error}</p>
		{/if}

		{#if selectedAlbum}
			<AlbumDetail
				conn={jellyfin.connection!}
				album={selectedAlbum}
				tracks={albumTracks}
				loading={loadingTracks}
				currentTrackId={player.current?.id}
				playing={player.playing}
				onBack={closeAlbum}
				onPlayTrack={playTrack}
				onPlayAlbum={playAlbum}
				onQueueAlbum={queueAlbum}
				onMixAlbum={() => startMix(selectedAlbum!.Id, selectedAlbum!.Name)}
				onToggleFavorite={toggleFavorite}
				onPlayNext={playNextTrack}
				onPlayNextAlbum={playNextAlbum}
				onEnqueue={enqueueTrack}
				onToggleAlbumFavorite={() => selectedAlbum && toggleFavoriteItem(selectedAlbum)}
				onAddToPlaylist={addToPlaylistFlow}
				onToggleDownload={toggleDownload}
				onToggleAlbumDownload={toggleAlbumDownload}
				albumDownloadProgress={albumDlProgress}
			/>
		{:else if category === 'artistes' && selectedArtist}
			<button type="button" class="pixel-btn pixel-btn--ghost back-btn" onclick={() => (selectedArtist = null)}>
				← Tous les artistes
			</button>
			<h3 class="section-title">{selectedArtist.Name}</h3>
			<div class="artist-actions">
				<button type="button" class="pixel-btn" disabled={playAllLoading} onclick={playAllArtist}>
					{playAllLoading ? 'Chargement…' : '▶ Tout lire'}
				</button>
				<button
					type="button"
					class="pixel-btn pixel-btn--ghost"
					disabled={popularLoading}
					title="Titres les plus écoutés de l'artiste (ListenBrainz), présents dans ta bibliothèque"
					onclick={playPopular}
				>
					{popularLoading ? 'Recherche…' : '★ Titres populaires'}
				</button>
				<button
					type="button"
					class="pixel-btn pixel-btn--ghost"
					disabled={mixLoading}
					title="Mix sans fin de titres similaires à cet artiste"
					onclick={() => selectedArtist && startMix(selectedArtist.Id, selectedArtist.Name)}
				>
					{mixLoading ? 'Mix…' : '∞ Mix'}
				</button>
			</div>
			{#if loading}
				<p class="loading">Chargement des albums…</p>
			{:else}
				<LibraryGrid items={artistAlbumItems} onSelect={(id) => openAlbum(id, 'artist')} menuFor={albumMenu} badgeFor={albumBadge} emptyMessage="Aucun album pour cet artiste." />
			{/if}
			{#if similarArtistItems.length > 0}
				<section class="suggestion-section similar-section">
					<h3 class="section-title">Artistes similaires</h3>
					<LibraryGrid items={similarArtistItems} onSelect={openArtist} menuFor={artistMenu} />
				</section>
			{/if}
		{:else if loading}
			<p class="loading">Chargement…</p>
		{:else if category === 'albums'}
			{#if !normalizedQuery}
				<div class="library-filters">
					<label>
						Trier
						<select
							class="pixel-input"
							value={albumSort}
							onchange={(e) => {
								albumSort = e.currentTarget.value as AlbumSort;
								reloadAlbums();
							}}
						>
							{#each albumSortOptions as o (o.id)}
								<option value={o.id}>{o.label}</option>
							{/each}
						</select>
					</label>
					{#if offlineSupported()}
						<label class="filter-check">
							<input type="checkbox" bind:checked={showDownloadedOnly} />
							Téléchargés
						</label>
					{/if}
					{#if genres.length > 0}
						<label>
							Genre
							<select
								class="pixel-input"
								value={albumGenre}
								onchange={(e) => {
									albumGenre = e.currentTarget.value;
									reloadAlbums();
								}}
							>
								<option value="">Tous</option>
								{#each genres as g (g)}
									<option value={g}>{g}</option>
								{/each}
							</select>
						</label>
					{/if}
				</div>
			{/if}
			{#if searchLoading}
				<p class="loading">Recherche…</p>
			{:else}
				<LibraryGrid items={filteredAlbumItems} onSelect={(id) => openAlbum(id, 'category')} menuFor={albumMenu} badgeFor={albumBadge} emptyMessage={showDownloadedOnly ? 'Aucun album téléchargé ici.' : emptyMessage('Aucun album dans la bibliothèque.')} />
				{#if !normalizedQuery && !showDownloadedOnly && albums.length > 0}
					<div class="load-more">
						<span class="load-more__count">{albums.length} sur {albumsTotal}</span>
						{#if albums.length < albumsTotal}
							<button type="button" class="pixel-btn pixel-btn--ghost" disabled={loadingMore} onclick={loadMoreAlbums}>
								{loadingMore ? 'Chargement…' : 'Afficher plus'}
							</button>
						{/if}
					</div>
				{/if}
			{/if}
		{:else if category === 'artistes'}
			{#if searchLoading}
				<p class="loading">Recherche…</p>
			{:else}
				<LibraryGrid items={filteredArtistItems} onSelect={openArtist} menuFor={artistMenu} emptyMessage={emptyMessage('Aucun artiste dans la bibliothèque.')} />
				{#if !normalizedQuery && artists.length > 0}
					<div class="load-more">
						<span class="load-more__count">{artists.length} sur {artistsTotal}</span>
						{#if artists.length < artistsTotal}
							<button type="button" class="pixel-btn pixel-btn--ghost" disabled={loadingMore} onclick={loadMoreArtists}>
								{loadingMore ? 'Chargement…' : 'Afficher plus'}
							</button>
						{/if}
					</div>
				{/if}
			{/if}
		{:else if category === 'favoris'}
			{#if favoriteSongs.length === 0}
				<p class="loading">Aucun favori pour l'instant. Touche le ♥ sur un titre pour l'ajouter.</p>
			{:else}
				<div class="fav-actions">
					<button
						type="button"
						class="pixel-btn"
						onclick={() => {
							const conn = jellyfin.connection;
							if (conn) player.playCollection(filteredFavoriteSongs.map((t) => songToTrack(conn, t)));
						}}
					>
						▶ Tout lire
					</button>
				</div>
				{#if filteredFavoriteSongs.length === 0}
					<p class="loading">Aucun favori pour « {query.trim()} ».</p>
				{:else}
					<ol class="fav-list">
						{#each filteredFavoriteSongs as song (song.Id)}
							{@const isCurrent = player.current?.id === `jellyfin-${song.Id}`}
							<li class="fav" class:is-current={isCurrent} use:contextTrigger={() => favSongMenu(song)}>
								<button type="button" class="fav__play" onclick={() => playTrack(song)} aria-label={`Lire ${song.Name}`}>
									<span class="fav__icon">{isCurrent && player.playing ? '♪' : '♥'}</span>
									<span class="fav__title">{song.Name}</span>
									<span class="fav__artist">{(song.Artists ?? []).join(', ') || song.AlbumArtist || ''}</span>
								</button>
								<button
									type="button"
									class="fav__remove"
									title="Retirer des favoris"
									aria-label={`Retirer ${song.Name} des favoris`}
									onclick={() => toggleFavorite(song)}
								>
									♥
								</button>
							</li>
						{/each}
					</ol>
				{/if}
			{/if}
		{:else if category === 'downloads'}
			<div class="downloads-tools">
				<button type="button" class="pixel-btn pixel-btn--ghost" disabled={repairing} onclick={repair}>
					{repairing ? 'Analyse…' : '↻ Réanalyser les téléchargements'}
				</button>
				<span class="downloads-hint">
					Retrouve les fichiers présents sur l'appareil mais absents de la liste (après une
					réinstallation, par exemple) et retire les entrées dont le fichier a disparu.
				</span>
			</div>
			{#if downloadedAlbumItems.length === 0}
				<p class="loading">
					Aucun album téléchargé. Ouvre un album et touche « ⭳ Télécharger ».
				</p>
			{:else}
				<p class="downloads-info">
					{downloadedAlbumItems.length} album{downloadedAlbumItems.length > 1 ? 's' : ''} hors-ligne{#if downloadsTotalSize > 0}
						· {formatSize(downloadsTotalSize)}{/if}
				</p>
				<LibraryGrid items={downloadedAlbumItems} onSelect={openOfflineAlbum} />
			{/if}
		{:else if category === 'stats'}
			<StatsPanel />
		{:else if category === 'playlists'}
			<PlaylistsPanel />
		{:else}
			<!-- Reprise & découverte : accès rapide en tête (façon « Jump back in »). -->
			{#if !normalizedQuery && (player.current || mixSeed)}
				<div class="quick-row">
					{#if player.current}
						<button type="button" class="quick-card" onclick={resumePlayback}>
							<span class="quick-card__tag">Reprendre</span>
							<span class="quick-card__title">{player.playing ? '❚❚ ' : '▶ '}{player.current.title}</span>
						</button>
					{/if}
					{#if mixSeed}
						<button
							type="button"
							class="quick-card quick-card--mix"
							disabled={mixLoading}
							onclick={() => mixSeed && startMix(mixSeed.Id, 'Surprise')}
						>
							<span class="quick-card__tag">Découvrir</span>
							<span class="quick-card__title">{mixLoading ? 'Mix…' : '∞ Mix surprise'}</span>
						</button>
					{/if}
					<button
						type="button"
						class="quick-card quick-card--mix"
						disabled={shuffleLoading}
						onclick={shuffleAll}
					>
						<span class="quick-card__tag">Découvrir</span>
						<span class="quick-card__title">{shuffleLoading ? 'Aléatoire…' : '🔀 Lecture aléatoire'}</span>
					</button>
				</div>
			{/if}
			<!-- Suggestions : sections d'albums (ajoutés / écoutés récemment, les plus écoutés) -->
			{#if filteredSuggestionSections.length === 0}
				<p class="loading">
					{#if noResults}
						Aucun résultat pour « {query.trim()} ».
					{:else}
						Aucune suggestion pour l'instant. Écoute ou ajoute des albums dans Jellyfin pour peupler cette section.
					{/if}
				</p>
			{:else}
				{#each filteredSuggestionSections as section (section.title)}
					<section class="suggestion-section">
						<h3 class="section-title">{section.title}</h3>
						<LibraryGrid items={section.items} onSelect={(id) => openAlbum(id, 'category')} menuFor={albumMenu} badgeFor={albumBadge} />
					</section>
				{/each}
			{/if}
		{/if}
	</PixelPanel>
{/if}

<style>
	.library-categories {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-bottom: 1rem;
	}

	.library-search {
		margin-bottom: 1.25rem;
	}

	.library-filters {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	/* Chargement progressif : le compteur est affiché même quand tout est chargé, pour que
	   « combien y en a-t-il vraiment » soit toujours une information visible. */
	.load-more {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.8rem;
		margin-top: 1rem;
	}

	.load-more__count {
		font-size: 0.78rem;
		color: var(--muted);
		font-variant-numeric: tabular-nums;
	}

	.library-filters label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8rem;
		color: var(--muted);
	}

	.library-filters select {
		width: auto;
		min-width: 8rem;
	}

	.filter-check {
		gap: 0.4rem;
		color: var(--cream);
	}

	.downloads-tools {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem;
		margin-bottom: 0.9rem;
	}

	.downloads-hint {
		flex: 1 1 16rem;
		min-width: 0;
		font-size: 0.76rem;
		color: var(--muted);
	}

	.downloads-info {
		color: var(--muted);
		font-size: 0.82rem;
		margin: 0 0 0.75rem;
	}

	.filter-check input[type='checkbox'] {
		width: 1.1rem;
		height: 1.1rem;
		accent-color: var(--teal);
	}

	.connect-prompt {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-top: 0.75rem;
	}

	.connect-prompt h3 {
		font-size: 1.1rem;
	}

	.connect-prompt p {
		color: var(--muted);
		font-size: 0.85rem;
		margin: 0 0 0.35rem;
	}

	.error {
		color: var(--coral);
		margin: 0 0 0.75rem;
	}

	.loading {
		color: var(--muted);
	}

	.back-btn {
		margin-bottom: 0.75rem;
	}

	.artist-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
		margin-bottom: 1rem;
	}

	.section-title {
		margin-bottom: 0.75rem;
	}

	.quick-row {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
		gap: 0.75rem;
		margin-bottom: 1.5rem;
	}

	.quick-card {
		font-family: var(--font-pixel);
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		text-align: left;
		background: var(--plum-deep);
		border: 3px solid var(--bezel);
		border-radius: var(--radius-control, 0);
		box-shadow: 3px 4px 0 0 var(--shadow);
		color: var(--cream);
		padding: 0.7rem 0.85rem;
		cursor: pointer;
	}

	.quick-card:hover:not(:disabled) {
		background: var(--plum);
		color: var(--cream-bright);
	}

	.quick-card--mix {
		border-color: var(--teal);
	}

	.quick-card__tag {
		font-size: 0.65rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--gold-bright);
	}

	.quick-card--mix .quick-card__tag {
		color: var(--teal);
	}

	.quick-card__title {
		font-size: 0.9rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.suggestion-section {
		margin-bottom: 1.5rem;
	}

	.suggestion-section:last-child {
		margin-bottom: 0;
	}

	.similar-section {
		margin-top: 1.5rem;
	}

	.fav-actions {
		margin-bottom: 1rem;
	}

	.fav-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.fav {
		display: flex;
		align-items: stretch;
		gap: 2px;
	}

	.fav__play {
		font-family: var(--font-pixel);
		width: 100%;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		background: var(--plum-deep);
		border: 2px solid var(--bezel);
		border-radius: var(--radius-control, 0);
		color: var(--cream);
		padding: 0.5rem 0.75rem;
		cursor: pointer;
		text-align: left;
	}

	.fav__play:hover {
		background: var(--plum);
		color: var(--cream-bright);
	}

	.fav.is-current .fav__play {
		outline: 2px solid var(--gold-bright);
		outline-offset: -2px;
		color: var(--gold-bright);
	}

	.fav__icon {
		width: 1.4rem;
		text-align: center;
		color: var(--coral);
		flex-shrink: 0;
	}

	.fav__title {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.fav__artist {
		color: var(--muted);
		font-size: 0.75rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 40%;
	}

	.fav__remove {
		flex-shrink: 0;
		width: 2.4rem;
		display: grid;
		place-items: center;
		background: var(--plum-deep);
		border: 2px solid var(--bezel);
		border-radius: var(--radius-control, 0);
		color: var(--coral);
		font-size: 1rem;
		cursor: pointer;
	}

	.fav__remove:hover {
		background: var(--plum);
	}
</style>
