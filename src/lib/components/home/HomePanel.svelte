<script lang="ts">
	import PixelPanel from '$lib/components/shared/PixelPanel.svelte';
	import LibraryGrid from '$lib/components/library/LibraryGrid.svelte';
	import { jellyfin } from '$lib/stores/jellyfin.svelte';
	import { pinepods } from '$lib/stores/pinepods.svelte';
	import { localPodcasts } from '$lib/stores/localPodcasts.svelte';
	import { radios } from '$lib/stores/radios.svelte';
	import { player } from '$lib/stores/player.svelte';
	import { ui } from '$lib/stores/ui.svelte';
	import { settings } from '$lib/stores/settings.svelte';
	import { toasts } from '$lib/stores/toasts.svelte';
	import { songToTrack } from '$lib/jellyfinTrack';
	import { episodeToTrack } from '$lib/podcastTrack';
	import { stationToTrack } from '$lib/radioTrack';
	import {
		getMusicViewId,
		getFavoriteSongs,
		getRecentlyAddedAlbums,
		getAlbumTracks,
		getInstantMix,
		getRandomSongs,
		primaryImageUrl
	} from '$lib/api/jellyfin';
	import { listPodcasts, listInProgressEpisodes } from '$lib/api/pinepods';
	import { listInProgressEpisodes as listLocalInProgress } from '$lib/api/localPodcasts';
	import type { JellyfinItem, PinePodsEpisode } from '$lib/types';

	// Source active des podcasts (PinePods ou intégrée, sans serveur) — même réglage que
	// PodcastsPanel : l'accueil doit refléter la même source, pas seulement PinePods.
	const isLocalPodcasts = $derived(settings.values.podcastSource === 'local');

	let favorites = $state<JellyfinItem[]>([]);
	let recentAlbums = $state<JellyfinItem[]>([]);
	let inProgress = $state<PinePodsEpisode[]>([]);
	let busy = $state(false);
	let loaded = false;

	// Cartes pour LibraryGrid.
	function albumCard(a: JellyfinItem) {
		const conn = jellyfin.connection;
		const tag = a.ImageTags?.Primary;
		return {
			id: a.Id,
			title: a.Name,
			subtitle: a.AlbumArtist || undefined,
			imageUrl: conn && tag ? primaryImageUrl(conn, a.Id, tag) : undefined
		};
	}
	function songCard(s: JellyfinItem) {
		const conn = jellyfin.connection;
		const tag = s.AlbumPrimaryImageTag;
		const imgId = s.AlbumId ?? s.Id;
		return {
			id: s.Id,
			title: s.Name,
			subtitle: (s.Artists ?? []).join(', ') || s.AlbumArtist || undefined,
			imageUrl: conn && tag ? primaryImageUrl(conn, imgId, tag) : undefined
		};
	}

	const favoriteCards = $derived(favorites.map(songCard));
	const recentCards = $derived(recentAlbums.map(albumCard));

	async function loadJellyfin() {
		const conn = jellyfin.connection;
		if (!conn) return;
		try {
			const parent = (await getMusicViewId(conn).catch(() => null)) ?? undefined;
			const [favs, recent] = await Promise.all([
				getFavoriteSongs(conn).catch(() => []),
				getRecentlyAddedAlbums(conn, parent).catch(() => [])
			]);
			favorites = favs.slice(0, 12);
			recentAlbums = recent.slice(0, 12);
		} catch {
			/* section masquée si vide */
		}
	}
	async function loadPodcasts() {
		if (isLocalPodcasts) {
			try {
				inProgress = (await listLocalInProgress()).slice(0, 8);
			} catch {
				/* section masquée si vide */
			}
			return;
		}
		const conn = pinepods.connection;
		if (!conn) return;
		try {
			const pods = await listPodcasts(conn);
			const eps = await listInProgressEpisodes(conn, pods.map((p) => p.podcastid));
			inProgress = eps.slice(0, 8);
		} catch {
			/* section masquée si vide */
		}
	}

	$effect(() => {
		if (loaded) return;
		if (jellyfin.connected || pinepods.connected || isLocalPodcasts) {
			loaded = true;
			loadJellyfin();
			loadPodcasts();
		}
	});

	// ---- Actions ----
	function playFavorite(id: string) {
		const conn = jellyfin.connection;
		const song = favorites.find((s) => s.Id === id);
		if (conn && song) player.playNow(songToTrack(conn, song));
	}
	async function playAlbum(id: string) {
		const conn = jellyfin.connection;
		if (!conn) return;
		const tracks = await getAlbumTracks(conn, id);
		if (tracks.length) player.playCollection(tracks.map((t) => songToTrack(conn, t)));
	}
	function resumeEpisode(ep: PinePodsEpisode) {
		player.playNow(episodeToTrack(ep, isLocalPodcasts));
	}
	function resumePlayback() {
		if (player.current) player.playing = true;
	}
	async function mixSurprise() {
		const conn = jellyfin.connection;
		const seed = recentAlbums[0];
		if (!conn || !seed || busy) return;
		busy = true;
		try {
			const mix = await getInstantMix(conn, seed.Id);
			if (mix.length) player.playCollection(mix.map((t) => songToTrack(conn, t)));
			else toasts.info('Aucun mix disponible.');
		} catch {
			toasts.error('Mix indisponible.');
		} finally {
			busy = false;
		}
	}
	async function shuffleAll() {
		const conn = jellyfin.connection;
		if (!conn || busy) return;
		busy = true;
		try {
			const parent = (await getMusicViewId(conn).catch(() => null)) ?? undefined;
			const songs = await getRandomSongs(conn, 100, parent);
			if (songs.length) player.playCollection(songs.map((t) => songToTrack(conn, t)));
			else toasts.info('Aucun titre.');
		} catch {
			toasts.error('Lecture aléatoire impossible.');
		} finally {
			busy = false;
		}
	}
	function randomRadio() {
		const list = radios.stations;
		if (list.length === 0) return;
		const s = list[Math.floor(Math.random() * list.length)] ?? list[0];
		player.playNow(stationToTrack(s));
	}

	const hasLocalPodcasts = $derived(isLocalPodcasts && localPodcasts.list().length > 0);
	const nothingConnected = $derived(!jellyfin.connected && !pinepods.connected && !hasLocalPodcasts);
</script>

{#if nothingConnected}
	<PixelPanel>
		<p class="hint">
			Connecte une source dans <button type="button" class="link" onclick={() => (ui.activeSpace = 'config')}>Configuration</button>
			pour peupler ton accueil.
		</p>
	</PixelPanel>
{:else}
	{#if player.current}
		<PixelPanel>
			<div class="resume">
				<div class="resume__art" aria-hidden="true">
					{#if player.current.artworkUrl}<img src={player.current.artworkUrl} alt="" />{/if}
				</div>
				<div class="resume__info">
					<span class="label-tag">Reprendre</span>
					<strong>{player.current.title}</strong>
					<small>{player.current.subtitle}</small>
				</div>
				<button type="button" class="pixel-btn pixel-btn--play" onclick={resumePlayback} aria-label="Reprendre la lecture">
					{player.playing ? '⏸' : '▶'}
				</button>
			</div>
		</PixelPanel>
	{/if}

	<PixelPanel sunken>
		<span class="label-tag">Découvrir</span>
		<div class="discover">
			{#if jellyfin.connected}
				<button type="button" class="pixel-btn pixel-btn--ghost" title="Mix surprise : des titres similaires à ce que tu écoutes" disabled={busy || recentAlbums.length === 0} onclick={mixSurprise}>∞ Mix surprise</button>
				<button type="button" class="pixel-btn pixel-btn--ghost" title="Lecture aléatoire dans toute la bibliothèque" disabled={busy} onclick={shuffleAll}>🔀 Lecture aléatoire</button>
			{/if}
			{#if radios.stations.length > 0}
				<button type="button" class="pixel-btn pixel-btn--ghost" title="Une de tes stations radio au hasard" onclick={randomRadio}>⌁ Radio au hasard</button>
			{/if}
		</div>
	</PixelPanel>

	{#if inProgress.length > 0}
		<PixelPanel>
			<div class="row-head">
				<h3>Reprendre les podcasts</h3>
				<button type="button" class="link" onclick={() => (ui.activeSpace = 'podcasts')}>Voir tout</button>
			</div>
			<ul class="ep-row">
				{#each inProgress as ep (ep.episodeid)}
					<li>
						<button type="button" class="ep" onclick={() => resumeEpisode(ep)}>
							<div class="ep__art" aria-hidden="true">
								{#if ep.episodeartwork}<img src={ep.episodeartwork} alt="" loading="lazy" />{/if}
							</div>
							<span class="ep__title">{ep.episodetitle}</span>
							<span class="ep__pod">{ep.podcastname}</span>
						</button>
					</li>
				{/each}
			</ul>
		</PixelPanel>
	{/if}

	{#if favoriteCards.length > 0}
		<PixelPanel>
			<div class="row-head">
				<h3>♥ Favoris</h3>
				<button type="button" class="link" onclick={() => (ui.activeSpace = 'library')}>Voir tout</button>
			</div>
			<LibraryGrid items={favoriteCards} onSelect={playFavorite} />
		</PixelPanel>
	{/if}

	{#if recentCards.length > 0}
		<PixelPanel>
			<div class="row-head">
				<h3>Récemment ajoutés</h3>
				<button type="button" class="link" onclick={() => (ui.activeSpace = 'library')}>Voir tout</button>
			</div>
			<LibraryGrid items={recentCards} onSelect={playAlbum} />
		</PixelPanel>
	{/if}
{/if}

<style>
	.hint {
		color: var(--muted);
	}
	.link {
		background: none;
		border: none;
		color: var(--gold-bright);
		cursor: pointer;
		font-family: var(--font-pixel);
		padding: 0;
		text-decoration: underline;
	}

	.resume {
		display: flex;
		align-items: center;
		gap: 1rem;
	}
	.resume__art {
		width: 3.5rem;
		height: 3.5rem;
		flex-shrink: 0;
		background: var(--metal-dark);
		border: 2px solid var(--bezel);
		overflow: hidden;
	}
	.resume__art img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.resume__info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}
	.resume__info strong,
	.resume__info small {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.resume__info small {
		color: var(--muted);
	}

	/* Une seule ligne : en `flex-wrap: wrap`, les trois boutons passaient l'un sous l'autre sur
	   téléphone et mangeaient beaucoup de hauteur. Ils partagent donc la largeur (`flex: 1`), et
	   leur libellé se tronque plutôt que de forcer un retour à la ligne — le glyphe reste visible
	   et l'intitulé complet est dans l'infobulle. */
	.discover {
		display: flex;
		flex-wrap: nowrap;
		gap: 0.6rem;
		margin-top: 0.6rem;
	}

	.discover :global(.pixel-btn) {
		flex: 1 1 0;
		min-width: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		text-align: center;
	}

	@media (max-width: 600px) {
		.discover {
			gap: 0.4rem;
		}
		/* Moins de rembourrage horizontal : c'est lui qui empêchait les trois de tenir. */
		.discover :global(.pixel-btn) {
			padding-left: 0.45rem;
			padding-right: 0.45rem;
			font-size: 0.68rem;
		}
	}

	.row-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 0.75rem;
	}
	.row-head h3 {
		font-size: 1.05rem;
	}

	.ep-row {
		list-style: none;
		margin: 0;
		padding: 0 0 0.25rem;
		display: flex;
		gap: 0.75rem;
		overflow-x: auto;
	}
	.ep {
		width: 9rem;
		flex-shrink: 0;
		background: var(--plum-deep);
		border: 3px solid var(--bezel);
		border-radius: var(--radius-control, 0);
		color: var(--cream);
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		padding: 0.5rem;
		cursor: pointer;
		font-family: var(--font-pixel);
		text-align: left;
	}
	.ep:hover {
		color: var(--cream-bright);
	}
	.ep__art {
		width: 100%;
		aspect-ratio: 1 / 1;
		background: var(--metal-dark);
		border: 2px solid var(--bezel);
		overflow: hidden;
	}
	.ep__art img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.ep__title {
		font-size: 0.75rem;
		overflow: hidden;
		text-overflow: ellipsis;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
	}
	.ep__pod {
		font-size: 0.68rem;
		color: var(--muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
