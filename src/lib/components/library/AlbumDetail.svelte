<script lang="ts">
	import type { JellyfinItem } from '$lib/types';
	import type { JellyfinConnection } from '$lib/stores/jellyfin.svelte';
	import { primaryImageUrl } from '$lib/api/jellyfin';
	import { formatTime } from '$lib/format';
	import { contextTrigger } from '$lib/actions/contextTrigger';
	import type { ContextMenuItem } from '$lib/stores/contextMenu.svelte';
	import { downloads } from '$lib/stores/downloads.svelte';
	import { offlineSupported } from '$lib/downloads';

	let {
		conn,
		album,
		tracks,
		loading,
		currentTrackId,
		playing,
		onBack,
		onPlayTrack,
		onPlayAlbum,
		onQueueAlbum,
		onMixAlbum,
		onToggleFavorite,
		onPlayNext,
		onPlayNextAlbum,
		onEnqueue,
		onToggleAlbumFavorite,
		onAddToPlaylist,
		onToggleDownload,
		onToggleAlbumDownload,
		albumDownloadProgress = null
	}: {
		conn: JellyfinConnection;
		album: JellyfinItem;
		tracks: JellyfinItem[];
		loading: boolean;
		currentTrackId?: string;
		playing: boolean;
		onBack: () => void;
		onPlayTrack: (track: JellyfinItem) => void;
		onPlayAlbum: () => void;
		onQueueAlbum: () => void;
		onMixAlbum: () => void;
		onToggleFavorite: (track: JellyfinItem) => void;
		onPlayNext: (track: JellyfinItem) => void;
		onPlayNextAlbum: () => void;
		onEnqueue: (track: JellyfinItem) => void;
		onToggleAlbumFavorite: () => void;
		onAddToPlaylist: (track: JellyfinItem) => void;
		onToggleDownload: (track: JellyfinItem) => void;
		onToggleAlbumDownload: () => void;
		albumDownloadProgress?: { done: number; total: number } | null;
	} = $props();

	const albumFav = $derived(album.UserData?.IsFavorite ?? false);
	// Album entièrement téléchargé hors-ligne ? (réactif au store downloads)
	const albumDownloaded = $derived(
		tracks.length > 0 && tracks.every((t) => downloads.has(t.Id))
	);
	// L'album a-t-il AU MOINS un titre hors-ligne ? Si oui (album partiel), on grise les titres
	// non téléchargés pour montrer ce qui est/n'est pas disponible sans réseau.
	const hasOfflineTracks = $derived(
		offlineSupported() && tracks.some((t) => downloads.has(t.Id))
	);

	// Actions du menu contextuel (clic droit / appui long) d'un titre.
	function trackMenu(track: JellyfinItem): { items: ContextMenuItem[]; title: string } {
		const fav = track.UserData?.IsFavorite ?? false;
		const items: ContextMenuItem[] = [
			{ label: 'Lire', icon: '▶', run: () => onPlayTrack(track) },
			{ label: 'Lire ensuite', icon: '⏭', run: () => onPlayNext(track) },
			{ label: 'Ajouter à la file', icon: '＋', run: () => onEnqueue(track) },
			{ label: 'Ajouter à une playlist…', icon: '≡', run: () => onAddToPlaylist(track) },
			{
				label: fav ? 'Retirer des favoris' : 'Ajouter aux favoris',
				icon: fav ? '♥' : '♡',
				run: () => onToggleFavorite(track)
			}
		];
		if (offlineSupported()) {
			const dl = downloads.has(track.Id);
			items.push({
				label: dl ? 'Supprimer le téléchargement' : 'Télécharger (hors-ligne)',
				icon: dl ? '⤓' : '⭳',
				danger: dl,
				run: () => onToggleDownload(track)
			});
		}
		return { title: track.Name, items };
	}

	const coverUrl = $derived(
		album.ImageTags?.Primary ? primaryImageUrl(conn, album.Id, album.ImageTags.Primary) : undefined
	);
	const totalSec = $derived(
		Math.round(tracks.reduce((sum, t) => sum + (t.RunTimeTicks ?? 0), 0) / 10_000_000)
	);
</script>

<button type="button" class="pixel-btn pixel-btn--ghost back-btn" onclick={onBack}>
	← Retour
</button>

<div class="album-header">
	{#if coverUrl}
		<img class="album-header__art" src={coverUrl} alt="" />
	{:else}
		<div class="album-header__art album-header__art--placeholder" aria-hidden="true">♪</div>
	{/if}
	<div class="album-header__meta">
		<span class="label-tag">Album</span>
		<h3>{album.Name}</h3>
		{#if album.AlbumArtist}<p class="album-header__artist">{album.AlbumArtist}</p>{/if}
		<p class="album-header__sub">
			{#if album.ProductionYear}{album.ProductionYear} · {/if}{tracks.length} titre{tracks.length > 1 ? 's' : ''}{#if totalSec > 0} · {formatTime(totalSec)}{/if}
		</p>
		<div class="album-header__actions">
			<button type="button" class="pixel-btn album-play" disabled={tracks.length === 0} onclick={onPlayAlbum}>
				▶ Lire l'album
			</button>
			<!-- Actions secondaires compactes (icônes + libellé accessible) pour ne pas empiler
			     une pile de gros boutons. -->
			<div class="album-icons">
				<button type="button" class="icon-btn" disabled={tracks.length === 0} title="Mix sans fin de titres similaires" aria-label="Mix" onclick={onMixAlbum}>∞</button>
				<button type="button" class="icon-btn" disabled={tracks.length === 0} title="Lire ensuite (après le titre en cours)" aria-label="Lire ensuite" onclick={onPlayNextAlbum}>⏭</button>
				<button type="button" class="icon-btn" disabled={tracks.length === 0} title="Ajouter à la file d'attente" aria-label="Ajouter à la file" onclick={onQueueAlbum}>＋</button>
				<button
					type="button"
					class="icon-btn"
					class:is-fav={albumFav}
					title={albumFav ? 'Retirer l’album des favoris' : 'Ajouter l’album aux favoris'}
					aria-label={albumFav ? 'Retirer des favoris' : 'Ajouter aux favoris'}
					aria-pressed={albumFav}
					onclick={onToggleAlbumFavorite}
				>{albumFav ? '♥' : '♡'}</button>
				{#if offlineSupported()}
					<button
						type="button"
						class="icon-btn"
						class:is-dl={albumDownloaded}
						disabled={tracks.length === 0 || !!albumDownloadProgress}
						title={albumDownloaded
							? 'Supprimer le téléchargement hors-ligne'
							: 'Télécharger l’album pour l’écoute hors-ligne'}
						aria-label={albumDownloaded ? 'Supprimer le téléchargement' : 'Télécharger'}
						onclick={onToggleAlbumDownload}
					>{#if albumDownloadProgress}{albumDownloadProgress.done}/{albumDownloadProgress.total}{:else if albumDownloaded}⤓{:else}⭳{/if}</button>
				{/if}
			</div>
		</div>
	</div>
</div>

{#if loading}
	<p class="loading">Chargement des titres…</p>
{:else if tracks.length === 0}
	<p class="loading">Aucun titre dans cet album.</p>
{:else}
	<ol class="tracks">
		{#each tracks as track, i (track.Id)}
			{@const isCurrent = currentTrackId === `jellyfin-${track.Id}`}
			{@const fav = track.UserData?.IsFavorite ?? false}
			{@const unavailable = hasOfflineTracks && !downloads.has(track.Id)}
			<li class="track" class:is-current={isCurrent} class:is-unavailable={unavailable} use:contextTrigger={() => trackMenu(track)}>
				<button type="button" class="track__play" onclick={() => onPlayTrack(track)} aria-label={`Lire ${track.Name}`}>
					<span class="track__num">{isCurrent && playing ? '♪' : (track.IndexNumber ?? i + 1)}</span>
					<span class="track__title">{track.Name}</span>
					{#if track.Artists?.length && track.Artists.join(', ') !== album.AlbumArtist}
						<span class="track__artist">{track.Artists.join(', ')}</span>
					{/if}
					{#if unavailable}
						<span class="track__off" title="Pas téléchargé : indisponible sans réseau">hors-ligne&nbsp;: non</span>
					{/if}
					<span class="track__dur">{track.RunTimeTicks ? formatTime(track.RunTimeTicks / 10_000_000) : ''}</span>
				</button>
				<button
					type="button"
					class="track__next"
					title="Lire ensuite"
					aria-label={`Lire ${track.Name} ensuite`}
					onclick={() => onPlayNext(track)}
				>
					⏭
				</button>
				<button
					type="button"
					class="track__fav"
					class:is-on={fav}
					aria-pressed={fav}
					title={fav ? 'Retirer des favoris' : 'Ajouter aux favoris'}
					aria-label={fav ? 'Retirer des favoris' : 'Ajouter aux favoris'}
					onclick={() => onToggleFavorite(track)}
				>
					{fav ? '♥' : '♡'}
				</button>
			</li>
		{/each}
	</ol>
{/if}

<style>
	.back-btn {
		margin-bottom: 1rem;
	}

	.album-header {
		display: flex;
		gap: 1.25rem;
		margin-bottom: 1.25rem;
		flex-wrap: wrap;
	}

	.album-header__art {
		width: 9rem;
		height: 9rem;
		object-fit: cover;
		border: var(--border-w, 3px) solid var(--bezel);
		border-radius: var(--radius-control, 0);
		background: var(--metal-dark);
		box-shadow: var(--art-shadow, 3px 4px 0 0 var(--shadow));
	}

	.album-header__art--placeholder {
		display: grid;
		place-items: center;
		font-size: 3rem;
		color: var(--metal-mid);
	}

	.album-header__meta {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		min-width: 0;
		flex: 1;
	}

	.album-header__meta h3 {
		font-size: 1.4rem;
		margin: 0.2rem 0 0;
	}

	.album-header__artist {
		color: var(--gold-bright);
		margin: 0;
	}

	.album-header__sub {
		color: var(--muted);
		font-size: 0.8rem;
		margin: 0;
	}

	.album-header__actions {
		display: flex;
		gap: 0.6rem;
		flex-wrap: wrap;
		align-items: center;
		margin-top: 0.6rem;
	}

	.album-play {
		flex-shrink: 0;
	}

	/* Rangée d'actions secondaires : boutons carrés compacts. */
	.album-icons {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}

	.icon-btn {
		font-family: var(--font-pixel);
		min-width: 2.6rem;
		height: 2.6rem;
		padding: 0 0.5rem;
		display: grid;
		place-items: center;
		font-size: 1rem;
		color: var(--cream);
		background: var(--plum-deep);
		border: var(--border-w, 3px) solid var(--bezel);
		border-radius: var(--radius-control, 0);
		box-shadow: var(--card-shadow, 0 -3px 0 0 inset var(--shadow));
		cursor: pointer;
	}

	.icon-btn:hover:not(:disabled) {
		color: var(--cream-bright);
		background: var(--plum);
	}

	.icon-btn:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.icon-btn.is-fav {
		color: var(--coral);
		border-color: var(--coral);
	}

	.icon-btn.is-dl {
		color: var(--teal);
		border-color: var(--teal);
	}

	.loading {
		color: var(--muted);
	}

	.tracks {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
		counter-reset: track;
	}

	.track {
		display: flex;
		align-items: stretch;
		gap: 2px;
	}

	/* Titre non téléchargé alors que l'album a du hors-ligne : grisé (indisponible sans
	   réseau). 0,45 tombait à 3,5:1 de contraste — insuffisant pour du texte à lire ;
	   0,6 remonte au-dessus de 4,5:1. L'état n'est de toute façon plus porté par la seule
	   opacité : une étiquette « hors-ligne : non » l'énonce (voir .track__off). */
	.track.is-unavailable {
		opacity: 0.6;
	}

	.track__off {
		flex-shrink: 0;
		font-size: 0.62rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--rust);
		border: 1px solid currentColor;
		border-radius: var(--radius-chip, 0);
		padding: 0 0.25rem;
	}

	.track__play {
		font-family: var(--font-pixel);
		flex: 1;
		min-width: 0;
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

	.track__play:hover {
		background: var(--plum);
		color: var(--cream-bright);
	}

	.track.is-current .track__play {
		outline: 2px solid var(--gold-bright);
		outline-offset: -2px;
		color: var(--gold-bright);
	}

	.track__num {
		width: 1.6rem;
		text-align: center;
		color: var(--muted);
		font-size: 0.8rem;
		flex-shrink: 0;
	}

	.track.is-current .track__num {
		color: var(--gold-bright);
	}

	.track__title {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.track__artist {
		color: var(--muted);
		font-size: 0.75rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 40%;
	}

	.track__dur {
		color: var(--muted);
		font-size: 0.75rem;
		flex-shrink: 0;
		min-width: 3rem;
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	.track__next,
	.track__fav {
		flex-shrink: 0;
		width: 2.4rem;
		display: grid;
		place-items: center;
		background: var(--plum-deep);
		border: 2px solid var(--bezel);
		border-radius: var(--radius-control, 0);
		color: var(--muted);
		font-size: 1rem;
		cursor: pointer;
	}

	.track__next:hover {
		background: var(--plum);
		color: var(--gold-bright);
	}


	.track__fav:hover {
		background: var(--plum);
		color: var(--coral);
	}

	.track__fav.is-on {
		color: var(--coral);
	}

	/* Confort tactile : au doigt, les boutons d'action atteignent ~44 px (2,4rem ≈ 38 px
	   et 2,6rem ≈ 42 px étaient un peu justes). Inchangé à la souris. */
	@media (hover: none) and (pointer: coarse) {
		.track__next,
		.track__fav {
			width: 44px;
			min-height: 44px;
		}

		.icon-btn {
			min-width: 44px;
			height: 44px;
		}
	}
</style>
