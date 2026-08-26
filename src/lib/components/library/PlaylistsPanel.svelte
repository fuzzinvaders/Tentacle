<script lang="ts">
	import { listenbrainz } from '$lib/stores/listenbrainz.svelte';
	import { jellyfin } from '$lib/stores/jellyfin.svelte';
	import { lidarr } from '$lib/stores/lidarr.svelte';
	import { player } from '$lib/stores/player.svelte';
	import { ui } from '$lib/stores/ui.svelte';
	import { songToTrack } from '$lib/jellyfinTrack';
	import { mapLimit } from '$lib/concurrency';
	import {
		findAudioMatch,
		getUserPlaylists as getJellyfinPlaylists,
		getPlaylistItems
	} from '$lib/api/jellyfin';
	import { formatTime } from '$lib/format';
	import { ensureAlbum } from '$lib/api/lidarr';
	import { resolveRecordingToAlbum, searchRecordingMbid } from '$lib/api/musicbrainz';
	import {
		getUserPlaylists,
		getCreatedForPlaylists,
		getPlaylistTracks,
		ListenBrainzApiError
	} from '$lib/api/listenbrainz';
	import type { JellyfinItem, LBPlaylist, LBTrack } from '$lib/types';

	type MatchedTrack = { lb: LBTrack; jf: JellyfinItem | null };
	type LidarrTrackState = 'pending' | 'added' | 'exists' | 'notfound' | 'error';

	let createdFor = $state<LBPlaylist[]>([]);
	let userPlaylists = $state<LBPlaylist[]>([]);
	let listsLoaded = false;

	let loading = $state(false);
	let error = $state('');

	let selected = $state<LBPlaylist | null>(null);
	let matched = $state<MatchedTrack[]>([]);
	let loadingTracks = $state(false);

	// Statut Lidarr par piste (clé = index dans matched), remis à zéro à chaque ouverture.
	let lidarrStatus = $state<Record<number, LidarrTrackState>>({});
	let bulkRunning = $state(false);

	const matchedCount = $derived(matched.filter((m) => m.jf !== null).length);
	const missingCount = $derived(matched.length - matchedCount);

	async function loadLists() {
		const conn = listenbrainz.connection;
		if (!conn || listsLoaded) return;
		error = '';
		loading = true;
		try {
			[createdFor, userPlaylists] = await Promise.all([
				getCreatedForPlaylists(conn),
				getUserPlaylists(conn)
			]);
			listsLoaded = true;
		} catch (err) {
			error = err instanceof ListenBrainzApiError ? err.message : 'Chargement des playlists impossible.';
		} finally {
			loading = false;
		}
	}

	async function openPlaylist(pl: LBPlaylist) {
		const lbConn = listenbrainz.connection;
		if (!lbConn) return;
		selected = pl;
		matched = [];
		lidarrStatus = {};
		error = '';
		loadingTracks = true;
		try {
			const tracks = await getPlaylistTracks(pl.mbid);
			const jfConn = jellyfin.connection;
			if (jfConn) {
				// Au plus 6 recherches Jellyfin en parallèle : une grosse playlist ne
				// doit pas ouvrir des dizaines de requêtes simultanées vers le serveur.
				matched = await mapLimit(tracks, 6, async (lb) => ({
					lb,
					jf: await findAudioMatch(jfConn, { title: lb.title, artist: lb.artist }).catch(() => null)
				}));
			} else {
				matched = tracks.map((lb) => ({ lb, jf: null }));
			}
		} catch (err) {
			error = err instanceof ListenBrainzApiError ? err.message : 'Chargement de la playlist impossible.';
		} finally {
			loadingTracks = false;
		}
	}

	function closePlaylist() {
		selected = null;
		matched = [];
	}

	function playTrack(m: MatchedTrack) {
		const jfConn = jellyfin.connection;
		if (!jfConn || !m.jf) return;
		player.playNow(songToTrack(jfConn, m.jf));
	}

	function playPlaylist() {
		const jfConn = jellyfin.connection;
		if (!jfConn) return;
		const playable = matched.filter((m) => m.jf !== null);
		if (playable.length === 0) return;
		player.playNow(songToTrack(jfConn, playable[0].jf!));
		for (let i = 1; i < playable.length; i++) player.enqueue(songToTrack(jfConn, playable[i].jf!));
	}

	/**
	 * Demande à Lidarr l'album contenant ce morceau manquant :
	 * MBID de l'enregistrement (fourni par ListenBrainz, sinon recherche texte
	 * MusicBrainz) → album (release group) via MusicBrainz → ajout/monitoring +
	 * recherche dans Lidarr. MusicBrainz est throttlé à ~1 req/s par son module.
	 */
	async function requestViaLidarr(i: number, m: MatchedTrack) {
		const conn = lidarr.connection;
		if (!conn || lidarrStatus[i] === 'pending') return;
		lidarrStatus = { ...lidarrStatus, [i]: 'pending' };
		try {
			const recordingMbid =
				m.lb.recordingMbid ?? (await searchRecordingMbid(m.lb.title, m.lb.artist));
			if (!recordingMbid) {
				lidarrStatus = { ...lidarrStatus, [i]: 'notfound' };
				return;
			}
			const album = await resolveRecordingToAlbum(recordingMbid);
			if (!album) {
				lidarrStatus = { ...lidarrStatus, [i]: 'notfound' };
				return;
			}
			const result = await ensureAlbum(conn, album.releaseGroupMbid);
			lidarrStatus = { ...lidarrStatus, [i]: result.status };
		} catch {
			lidarrStatus = { ...lidarrStatus, [i]: 'error' };
		}
	}

	/** Tous les manquants, séquentiellement (le throttle MusicBrainz impose le rythme). */
	async function requestAllMissing() {
		if (bulkRunning) return;
		bulkRunning = true;
		try {
			for (let i = 0; i < matched.length; i++) {
				if (!matched[i].jf && !lidarrStatus[i]) await requestViaLidarr(i, matched[i]);
			}
		} finally {
			bulkRunning = false;
		}
	}

	const LIDARR_LABELS: Record<LidarrTrackState, string> = {
		pending: '…',
		added: 'Ajouté à Lidarr ✓',
		exists: 'Déjà dans Lidarr',
		notfound: 'Album introuvable',
		error: 'Échec Lidarr'
	};

	function goToConfig() {
		ui.activeSpace = 'config';
	}

	$effect(() => {
		if (listenbrainz.connected) {
			if (!listsLoaded) loadLists();
		} else {
			createdFor = [];
			userPlaylists = [];
			listsLoaded = false;
			selected = null;
			matched = [];
		}
	});

	// ---- Playlists Jellyfin ----
	// Elles étaient inaccessibles : on pouvait créer une playlist Jellyfin et y ajouter des
	// titres (menu contextuel, bouton « Playlist » de la file), mais jamais la ROUVRIR.
	// Pas de rapprochement à faire ici, contrairement aux playlists ListenBrainz : les titres
	// sont déjà des éléments Jellyfin, donc directement jouables.
	let jfPlaylists = $state<JellyfinItem[]>([]);
	let jfLoaded = false;
	let selectedJf = $state<JellyfinItem | null>(null);
	let jfTracks = $state<JellyfinItem[]>([]);
	let loadingJf = $state(false);

	async function loadJellyfinPlaylists() {
		const conn = jellyfin.connection;
		if (!conn || jfLoaded) return;
		try {
			jfPlaylists = await getJellyfinPlaylists(conn);
			jfLoaded = true;
		} catch {
			/* silencieux : l'absence de playlists Jellyfin ne doit pas masquer les listes ListenBrainz */
		}
	}

	async function openJfPlaylist(pl: JellyfinItem) {
		const conn = jellyfin.connection;
		if (!conn) return;
		selectedJf = pl;
		jfTracks = [];
		error = '';
		loadingJf = true;
		try {
			jfTracks = await getPlaylistItems(conn, pl.Id);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Chargement de la playlist impossible.';
		} finally {
			loadingJf = false;
		}
	}

	function playJfPlaylist() {
		const conn = jellyfin.connection;
		if (!conn || jfTracks.length === 0) return;
		player.playCollection(jfTracks.map((t) => songToTrack(conn, t)));
	}

	function playJfTrack(item: JellyfinItem) {
		const conn = jellyfin.connection;
		if (conn) player.playNow(songToTrack(conn, item));
	}

	$effect(() => {
		if (jellyfin.connected) {
			if (!jfLoaded) loadJellyfinPlaylists();
		} else {
			jfPlaylists = [];
			jfLoaded = false;
			selectedJf = null;
			jfTracks = [];
		}
	});
</script>

{#if !listenbrainz.connected && !jellyfin.connected}
	<div class="connect-prompt">
		<span class="label-tag">Playlists</span>
		<h3>Aucune source de playlists</h3>
		<p>
			Connecte <strong>Jellyfin</strong> pour retrouver tes playlists du serveur, et/ou
			<strong>ListenBrainz</strong> pour ses mixes de recommandation (Weekly Jams, Daily Jams…).
		</p>
		<button type="button" class="pixel-btn" onclick={goToConfig}>Aller à la configuration</button>
	</div>
{:else if selectedJf}
	<div class="nav-row">
		<button type="button" class="pixel-btn pixel-btn--ghost" onclick={() => (selectedJf = null)}>
			← Toutes les playlists
		</button>
		<button
			type="button"
			class="pixel-btn pixel-btn--ghost"
			onclick={() => openJfPlaylist(selectedJf!)}
			disabled={loadingJf}
			title="Recharger"
		>↻ Recharger</button>
	</div>
	<div class="detail-head">
		<div>
			<h3>{selectedJf.Name}</h3>
			<p class="desc">Playlist Jellyfin · {jfTracks.length} titre{jfTracks.length > 1 ? 's' : ''}</p>
		</div>
		<div class="detail-head__actions">
			<button type="button" class="pixel-btn" disabled={loadingJf || jfTracks.length === 0} onclick={playJfPlaylist}>
				▶ Lire la playlist
			</button>
		</div>
	</div>
	{#if loadingJf}
		<p class="loading">Chargement des titres…</p>
	{:else if jfTracks.length === 0}
		<p class="loading">Cette playlist est vide.</p>
	{:else}
		<ul class="jf-tracks">
			{#each jfTracks as t, i (t.Id + i)}
				<li>
					<button type="button" class="jf-track" onclick={() => playJfTrack(t)}>
						<span class="jf-track__num">{i + 1}</span>
						<span class="jf-track__title">{t.Name}</span>
						<span class="jf-track__artist">{(t.Artists ?? []).join(', ') || t.AlbumArtist || ''}</span>
						<span class="jf-track__dur">
							{t.RunTimeTicks ? formatTime(t.RunTimeTicks / 10_000_000) : ''}
						</span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
{:else if selected}
	<div class="nav-row">
		<button type="button" class="pixel-btn pixel-btn--ghost" onclick={closePlaylist}>← Toutes les playlists</button>
		<button type="button" class="pixel-btn pixel-btn--ghost" onclick={() => openPlaylist(selected!)} disabled={loadingTracks} title="Recharger">↻ Recharger</button>
	</div>
	<div class="detail-head">
		<div>
			<h3>{selected.title}</h3>
			{#if selected.description}<p class="desc">{selected.description}</p>{/if}
		</div>
		<div class="detail-head__actions">
			<button type="button" class="pixel-btn" disabled={loadingTracks || matchedCount === 0} onclick={playPlaylist}>
				▶ Lire la playlist
			</button>
			{#if lidarr.connected && missingCount > 0}
				<button
					type="button"
					class="pixel-btn pixel-btn--ghost"
					disabled={loadingTracks || bulkRunning}
					title="Demande à Lidarr les albums des morceaux manquants (~1 s par morceau, limite MusicBrainz)"
					onclick={requestAllMissing}
				>
					{bulkRunning ? 'Recherche Lidarr…' : `⤓ Compléter via Lidarr (${missingCount})`}
				</button>
			{/if}
		</div>
	</div>

	{#if error}
		<p class="error">{error}</p>
	{:else if !jellyfin.connected}
		<p class="warn">Connecte aussi Jellyfin pour lire ces morceaux (correspondance dans ta bibliothèque).</p>
	{/if}

	{#if loadingTracks}
		<p class="loading">Recherche des morceaux dans Jellyfin…</p>
	{:else if matched.length > 0}
		<p class="match-info">{matchedCount} / {matched.length} morceaux disponibles dans ta bibliothèque.</p>
		<ol class="tracks">
			{#each matched as m, i (i)}
				{@const isCurrent = m.jf && player.current?.id === `jellyfin-${m.jf.Id}`}
				<li class="track" class:is-current={isCurrent} class:is-unavailable={!m.jf}>
					<button type="button" class="track__row" disabled={!m.jf} onclick={() => playTrack(m)} aria-label={m.jf ? `Lire ${m.lb.title}` : `${m.lb.title} — indisponible`}>
						<span class="track__num">{isCurrent && player.playing ? '♪' : i + 1}</span>
						<span class="track__meta">
							<span class="track__title">{m.lb.title}</span>
							<span class="track__artist">{m.lb.artist}</span>
						</span>
						<span class="track__tag">{m.jf ? '▶' : 'indispo.'}</span>
					</button>
					{#if !m.jf && lidarr.connected}
						<button
							type="button"
							class="pixel-btn pixel-btn--ghost track__lidarr"
							disabled={lidarrStatus[i] === 'pending' || bulkRunning}
							title="Demander l'album à Lidarr"
							onclick={() => requestViaLidarr(i, m)}
						>
							{lidarrStatus[i] ? LIDARR_LABELS[lidarrStatus[i]] : '⤓ Lidarr'}
						</button>
					{/if}
				</li>
			{/each}
		</ol>
	{:else if !error}
		<p class="loading">Cette playlist est vide.</p>
	{/if}
{:else if loading}
	<p class="loading">Chargement des playlists…</p>
{:else if error}
	<p class="error">{error}</p>
	<button type="button" class="pixel-btn pixel-btn--ghost" onclick={() => { listsLoaded = false; loadLists(); }}>
		↻ Réessayer
	</button>
{:else}
	{#if jfPlaylists.length > 0}
		<section class="pl-section">
			<h3 class="section-title">Playlists Jellyfin</h3>
			<ul class="pl-list">
				{#each jfPlaylists as pl (pl.Id)}
					<li>
						<button type="button" class="pl-card" onclick={() => openJfPlaylist(pl)}>
							<span class="pl-card__title">{pl.Name}</span>
							{#if pl.ChildCount}
								<span class="pl-card__desc">{pl.ChildCount} titre{pl.ChildCount > 1 ? 's' : ''}</span>
							{/if}
						</button>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
	{#if listenbrainz.connected && createdFor.length === 0 && userPlaylists.length === 0}
		<p class="loading">Aucune playlist trouvée sur ton compte ListenBrainz.</p>
	{:else if !listenbrainz.connected && jfPlaylists.length === 0}
		<p class="loading">Aucune playlist Jellyfin. Crée-en une depuis un album ou la file d'attente.</p>
	{/if}
	{#if createdFor.length > 0}
		<section class="pl-section">
			<h3 class="section-title">Créées pour vous</h3>
			<ul class="pl-list">
				{#each createdFor as pl (pl.mbid)}
					<li>
						<button type="button" class="pl-card" onclick={() => openPlaylist(pl)}>
							<span class="pl-card__title">{pl.title}</span>
							{#if pl.description}<span class="pl-card__desc">{pl.description}</span>{/if}
						</button>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
	{#if userPlaylists.length > 0}
		<section class="pl-section">
			<h3 class="section-title">Mes playlists</h3>
			<ul class="pl-list">
				{#each userPlaylists as pl (pl.mbid)}
					<li>
						<button type="button" class="pl-card" onclick={() => openPlaylist(pl)}>
							<span class="pl-card__title">{pl.title}</span>
							{#if pl.description}<span class="pl-card__desc">{pl.description}</span>{/if}
						</button>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
{/if}

<style>
	.connect-prompt {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.connect-prompt h3 {
		font-size: 1.1rem;
		margin-top: 0.4rem;
	}

	.connect-prompt p {
		color: var(--muted);
		font-size: 0.85rem;
		margin: 0 0 0.35rem;
		max-width: 34rem;
	}

	.error {
		color: var(--coral);
		margin: 0 0 0.75rem;
	}

	.warn {
		color: var(--gold-bright);
		font-size: 0.85rem;
		margin: 0 0 0.75rem;
	}

	.loading {
		color: var(--muted);
	}

	.nav-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 0.85rem;
	}

	.detail-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
		margin-bottom: 0.75rem;
	}

	.detail-head h3 {
		font-size: 1.3rem;
		margin: 0;
	}

	.desc {
		color: var(--muted);
		font-size: 0.85rem;
		margin: 0.25rem 0 0;
		max-width: 40rem;
	}

	.match-info {
		color: var(--muted);
		font-size: 0.8rem;
		margin: 0 0 0.6rem;
	}

	.pl-section {
		margin-bottom: 1.5rem;
	}

	.section-title {
		margin-bottom: 0.75rem;
	}

	/* Titres d'une playlist Jellyfin : colonnes fixes, comme la liste d'un album, pour que les
	   durées restent alignées quelle que soit la longueur des noms. */
	.jf-tracks {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.jf-track {
		font-family: var(--font-pixel);
		width: 100%;
		display: grid;
		grid-template-columns: 2rem 1fr auto 3rem;
		align-items: center;
		gap: 0.6rem;
		background: var(--plum-deep);
		border: 2px solid var(--bezel);
		border-radius: var(--radius-control, 0);
		color: var(--cream);
		padding: 0.45rem 0.6rem;
		cursor: pointer;
		text-align: left;
	}
	.jf-track:hover {
		background: var(--plum);
		color: var(--cream-bright);
	}
	.jf-track__num {
		color: var(--muted);
		font-size: 0.78rem;
		text-align: center;
	}
	.jf-track__title,
	.jf-track__artist {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.jf-track__artist {
		color: var(--muted);
		font-size: 0.76rem;
		max-width: 12rem;
	}
	.jf-track__dur {
		color: var(--muted);
		font-size: 0.76rem;
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	.pl-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.pl-card {
		font-family: var(--font-pixel);
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		background: var(--plum-deep);
		border: var(--border-w, 3px) solid var(--bezel);
		border-radius: var(--radius-control, 0);
		color: var(--cream);
		padding: 0.7rem 0.85rem;
		cursor: pointer;
		text-align: left;
		box-shadow: var(--card-shadow, 0 -4px 0 0 inset var(--shadow));
	}

	.pl-card:hover {
		color: var(--cream-bright);
		box-shadow: var(--card-shadow-hover, 0 -4px 0 0 inset var(--shadow), 0 0 12px 0 var(--glow-faint));
	}

	.pl-card__title {
		color: var(--cream-bright);
		font-size: 0.95rem;
	}

	.pl-card__desc {
		color: var(--muted);
		font-size: 0.78rem;
		overflow: hidden;
		text-overflow: ellipsis;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
	}

	.detail-head__actions {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.tracks {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.track {
		display: flex;
		align-items: stretch;
		gap: 0.35rem;
	}

	.track__lidarr {
		font-size: 0.62rem;
		padding: 0.3rem 0.55rem;
		flex-shrink: 0;
		white-space: nowrap;
	}

	.track__row {
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
		padding: 0.45rem 0.7rem;
		cursor: pointer;
		text-align: left;
	}

	.track__row:hover:not(:disabled) {
		background: var(--plum);
		color: var(--cream-bright);
	}

	.track.is-current .track__row {
		outline: 2px solid var(--gold-bright);
		outline-offset: -2px;
		color: var(--gold-bright);
	}

	.track.is-unavailable .track__row {
		cursor: not-allowed;
		opacity: 0.5;
	}

	.track__num {
		width: 1.6rem;
		text-align: center;
		color: var(--muted);
		font-size: 0.8rem;
		flex-shrink: 0;
	}

	.track__meta {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	.track__title {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.track__artist {
		font-size: 0.75rem;
		color: var(--muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.track__tag {
		font-size: 0.7rem;
		color: var(--gold-bright);
		flex-shrink: 0;
	}

	.track.is-unavailable .track__tag {
		color: var(--muted);
	}
</style>
