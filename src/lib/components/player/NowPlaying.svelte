<script lang="ts">
	import { player, PLAYBACK_RATES } from '$lib/stores/player.svelte';
	import { sleep } from '$lib/stores/sleep.svelte';
	import { formatTime } from '$lib/format';
	import { getLyrics, type Lyrics } from '$lib/api/lrclib';
	import { currentLineIndex } from '$lib/lrc';
	import { getEpisodeChapters } from '$lib/api/localPodcasts';
	import { currentChapterIndex, type Chapter } from '$lib/chapters';
	import { extractAlbumColors, type AlbumColors } from '$lib/albumColors';

	let {
		open,
		onClose,
		onSeek,
		onTogglePlay,
		remoteSupported = false,
		onCastRemote,
		jellyfinCastable = false,
		onCastJellyfin
	}: {
		open: boolean;
		onClose: () => void;
		onSeek: (sec: number) => void;
		/** Bascule lecture/pause fournie par le layout : elle se fie à l'état réel de l'élément
		 * audio, ce que ce composant ne peut pas faire (il n'y a pas accès). */
		onTogglePlay: () => void;
		remoteSupported?: boolean;
		onCastRemote?: () => void;
		jellyfinCastable?: boolean;
		onCastJellyfin?: (e: MouseEvent) => void;
	} = $props();

	let tab = $state<'paroles' | 'file' | 'chapitres'>('paroles');

	// ---- Thème dynamique : couleurs extraites de la pochette courante ----
	let colors = $state<AlbumColors | null>(null);
	let colorsUrl = '';
	$effect(() => {
		if (!open) return;
		const url = player.current?.artworkUrl;
		if (!url) {
			colors = null;
			colorsUrl = '';
			return;
		}
		if (url === colorsUrl) return;
		colorsUrl = url;
		extractAlbumColors(url).then((c) => {
			if (player.current?.artworkUrl === url) colors = c;
		});
	});

	// ---- Gestes tactiles : swipe bas = fermer, gauche/droite = suivant/précédent ----
	let touchX = 0;
	let touchY = 0;
	function onTouchStart(e: TouchEvent) {
		const t = e.changedTouches[0];
		touchX = t.clientX;
		touchY = t.clientY;
	}
	function onTouchEnd(e: TouchEvent) {
		const t = e.changedTouches[0];
		const dx = t.clientX - touchX;
		const dy = t.clientY - touchY;
		if (dy > 90 && Math.abs(dy) > Math.abs(dx)) {
			onClose();
		} else if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) {
			if (dx < 0) player.next();
			else player.prev();
		}
	}

	// ---- Paroles : chargées à chaque changement de titre (musique uniquement) ----
	let lyrics = $state<Lyrics | null>(null);
	let lyricsLoading = $state(false);
	let lyricsTrackId = '';

	$effect(() => {
		const t = player.current;
		if (!open || !t) return;
		const isMusic = t.source === 'jellyfin' || t.source === 'local';
		if (!isMusic || !t.artist) {
			lyrics = null;
			lyricsTrackId = t.id;
			return;
		}
		if (t.id === lyricsTrackId) return;
		lyricsTrackId = t.id;
		lyrics = null;
		lyricsLoading = true;
		getLyrics({ title: t.title, artist: t.artist, album: t.album, durationSec: t.durationSec })
			.then((res) => {
				if (player.current?.id === lyricsTrackId) lyrics = res;
			})
			.catch(() => {})
			.finally(() => {
				lyricsLoading = false;
			});
	});

	const activeLine = $derived(
		lyrics && lyrics.synced.length ? currentLineIndex(lyrics.synced, player.positionSec) : -1
	);

	// Défilement auto de la ligne active.
	let linesEl = $state<HTMLElement>();
	$effect(() => {
		const i = activeLine;
		if (i < 0 || !linesEl) return;
		const el = linesEl.querySelector<HTMLElement>(`[data-i="${i}"]`);
		el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
	});

	// ---- Chapitres (podcasts locaux, Podcasting 2.0) : chargés à chaque changement de titre. ----
	let chapters = $state<Chapter[]>([]);
	let chaptersLoading = $state(false);
	let chaptersTrackId = '';

	$effect(() => {
		const t = player.current;
		if (!open || !t) return;
		if (!t.chaptersUrl) {
			chapters = [];
			chaptersTrackId = t.id;
			return;
		}
		if (t.id === chaptersTrackId) return;
		chaptersTrackId = t.id;
		chapters = [];
		chaptersLoading = true;
		getEpisodeChapters(t.chaptersUrl)
			.then((res) => {
				if (player.current?.id === chaptersTrackId) chapters = res;
			})
			.catch(() => {})
			.finally(() => {
				chaptersLoading = false;
			});
	});

	const activeChapter = $derived(chapters.length ? currentChapterIndex(chapters, player.positionSec) : -1);

	let chaptersEl = $state<HTMLElement>();
	$effect(() => {
		const i = activeChapter;
		if (i < 0 || !chaptersEl) return;
		const el = chaptersEl.querySelector<HTMLElement>(`[data-i="${i}"]`);
		el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
	});

	function jumpToChapter(c: Chapter) {
		onSeek(c.startTime);
	}

	const isLive = $derived(player.current?.source === 'radio');
	const progressRatio = $derived(
		player.durationSec > 0 ? player.positionSec / player.durationSec : 0
	);
	const speedLabel = $derived(
		player.playbackRate === 1 ? '1×' : `${player.playbackRate.toString().replace('.', ',')}×`
	);

	function onSeekInput(e: Event) {
		onSeek(Number((e.target as HTMLInputElement).value));
	}

	// Double-tap sur la pochette : −10 s (moitié gauche) / +10 s (moitié droite), façon YouTube.
	let lastTapAt = 0;
	let seekFlash = $state<'back' | 'fwd' | null>(null);
	let flashTimer: ReturnType<typeof setTimeout> | undefined;
	function onArtPointerUp(e: PointerEvent) {
		if (isLive || !player.durationSec) return;
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const leftHalf = e.clientX - rect.left < rect.width / 2;
		const now = e.timeStamp;
		if (now - lastTapAt < 300) {
			const delta = leftHalf ? -10 : 10;
			onSeek(Math.max(0, Math.min(player.durationSec, player.positionSec + delta)));
			seekFlash = leftHalf ? 'back' : 'fwd';
			clearTimeout(flashTimer);
			flashTimer = setTimeout(() => (seekFlash = null), 500);
			lastTapAt = 0;
		} else {
			lastTapAt = now;
		}
	}
	function onVol(e: Event) {
		player.volume = Number((e.target as HTMLInputElement).value);
	}
	function onSleepChange(e: Event) {
		const v = (e.target as HTMLSelectElement).value;
		if (v === 'off') sleep.cancel();
		else if (v === 'end') sleep.setEndOfTrack();
		else sleep.setMinutes(Number(v));
	}
	const sleepValue = $derived(
		sleep.endOfTrack ? 'end' : sleep.remainingSec !== null ? 'on' : 'off'
	);
</script>

<svelte:window
	onkeydown={(e) => {
		if (open && e.key === 'Escape') onClose();
	}}
/>

{#if open}
	<div
		class="np scanlines"
		role="dialog"
		aria-label="Lecture en cours"
		aria-modal="true"
		style:--np-top={colors?.top}
		style:--np-bottom={colors?.bottom}
		style:--np-accent={colors?.accent}
	>
		<div class="np__bar">
			<button type="button" class="np__close" onclick={onClose} aria-label="Fermer" title="Fermer">▾</button>
			<span class="np__cap">Lecture en cours</span>
			<div class="np__tools">
				{#if jellyfinCastable}
					<button
						type="button"
						class="np__chip"
						onclick={(e) => onCastJellyfin?.(e)}
						title="Lire sur un autre appareil Jellyfin (réseau)"
						aria-label="Lire sur un autre appareil Jellyfin"
					>📡</button>
				{/if}
				{#if remoteSupported}
					<button
						type="button"
						class="np__chip"
						onclick={() => onCastRemote?.()}
						title="Diffuser (Chromecast / AirPlay)"
						aria-label="Diffuser vers un appareil"
					>⇉</button>
				{/if}
				<button
					type="button"
					class="np__chip"
					class:is-on={player.playbackRate !== 1}
					onclick={() => player.cycleSpeed()}
					title="Vitesse de lecture"
					aria-label="Vitesse de lecture"
				>{speedLabel}</button>
				<label class="np__sleep" class:is-on={sleep.active} title="Minuteur de sommeil">
					<span aria-hidden="true">☾</span>
					<select value={sleepValue} onchange={onSleepChange} aria-label="Minuteur de sommeil">
						{#if sleep.remainingSec !== null}
							<option value="on">{Math.ceil(sleep.remainingSec / 60)} min</option>
						{/if}
						<option value="off">Sommeil : off</option>
						<option value="15">15 min</option>
						<option value="30">30 min</option>
						<option value="45">45 min</option>
						<option value="60">60 min</option>
						<option value="end">Fin du titre</option>
					</select>
				</label>
			</div>
		</div>

		<div class="np__body">
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="np__now" ontouchstart={onTouchStart} ontouchend={onTouchEnd}>
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="np__art"
					class:is-empty={!player.current?.artworkUrl}
					onpointerup={onArtPointerUp}
					title="Double-tap : reculer / avancer de 10 s"
				>
					{#if player.current?.artworkUrl}
						<img src={player.current.artworkUrl} alt="" />
					{:else}
						<span>♪</span>
					{/if}
					{#if seekFlash}
						<span class="np__seekflash" class:back={seekFlash === 'back'}>
							{seekFlash === 'back' ? '« −10s' : '+10s »'}
						</span>
					{/if}
				</div>
				<h2 class="np__title">{player.current?.title ?? 'File vide'}</h2>
				<p class="np__artist">{player.current?.subtitle ?? ''}</p>

				<div class="np__viz" class:is-live={player.playing} aria-hidden="true">
					{#each Array(16) as _, i (i)}
						<span style:animation-delay={`${(i % 7) * 0.09}s`}></span>
					{/each}
				</div>

				<div class="np__seek">
					<span>{formatTime(player.positionSec)}</span>
					<div class="np__track" style:--p={isLive ? '100%' : `${progressRatio * 100}%`}>
						<input
							type="range"
							min="0"
							max={player.durationSec || 0}
							value={player.positionSec}
							disabled={isLive}
							oninput={onSeekInput}
							aria-label="Progression"
						/>
					</div>
					<span>{isLive ? 'DIRECT' : formatTime(player.durationSec)}</span>
				</div>

				<div class="np__controls">
					<button type="button" class="np__btn" class:is-active={player.shuffle} onclick={() => player.toggleShuffle()} aria-label="Aléatoire" title="Aléatoire">⇄</button>
					<button type="button" class="np__btn" onclick={() => player.prev()} aria-label="Précédent">⏮</button>
					<button type="button" class="np__btn np__btn--play" onclick={onTogglePlay} aria-label={player.playing ? 'Pause' : 'Lire'}>{player.playing ? '⏸' : '▶'}</button>
					<button type="button" class="np__btn" onclick={() => player.next()} aria-label="Suivant">⏭</button>
					<button type="button" class="np__btn" class:is-active={player.repeat !== 'off'} onclick={() => player.cycleRepeat()} aria-label="Répéter" title="Répéter">{player.repeat === 'one' ? '↻¹' : '↻'}</button>
				</div>

				<div class="np__vol">
					<span aria-hidden="true">🔈</span>
					<input type="range" min="0" max="1" step="0.01" value={player.volume} oninput={onVol} aria-label="Volume" />
				</div>
			</div>

			<div class="np__side">
				<div class="np__tabs">
					<button type="button" class:is-active={tab === 'paroles'} onclick={() => (tab = 'paroles')}>Paroles</button>
					{#if player.current?.chaptersUrl}
						<button type="button" class:is-active={tab === 'chapitres'} onclick={() => (tab = 'chapitres')}>Chapitres</button>
					{/if}
					<button type="button" class:is-active={tab === 'file'} onclick={() => (tab = 'file')}>File ({player.queue.length})</button>
				</div>

				{#if tab === 'chapitres' && player.current?.chaptersUrl}
					<div class="np__lyrics np__chapters" bind:this={chaptersEl}>
						{#if chaptersLoading}
							<p class="np__muted">Chargement des chapitres…</p>
						{:else if chapters.length > 0}
							{#each chapters as chapter, i (i)}
								<button
									type="button"
									class="np__chapter"
									class:is-active={i === activeChapter}
									data-i={i}
									onclick={() => jumpToChapter(chapter)}
								>
									{#if chapter.img}
										<img src={chapter.img} alt="" width="36" height="36" />
									{/if}
									<span class="np__chapter-time">{formatTime(chapter.startTime)}</span>
									<span class="np__chapter-title">{chapter.title}</span>
								</button>
							{/each}
						{:else}
							<p class="np__muted">Chapitres indisponibles pour cet épisode.</p>
						{/if}
					</div>
				{:else if tab === 'paroles'}
					<div class="np__lyrics" bind:this={linesEl}>
						{#if lyricsLoading}
							<p class="np__muted">Chargement des paroles…</p>
						{:else if lyrics && lyrics.synced.length}
							{#each lyrics.synced as line, i (i)}
								<p class="np__line" class:is-active={i === activeLine} data-i={i}>{line.text || '♪'}</p>
							{/each}
						{:else if lyrics && lyrics.plain}
							<p class="np__plain">{lyrics.plain}</p>
						{:else}
							<p class="np__muted">Paroles indisponibles pour ce titre.</p>
						{/if}
					</div>
				{:else}
					<div class="np__queue">
						{#if player.queue.length > 0}
							<button type="button" class="np__clear" onclick={() => player.clearQueue()}>Vider la file</button>
						{/if}
						<ul>
							{#if player.queue.length === 0}
								<li class="np__muted">File vide</li>
							{:else}
								{#each player.queue as track, i (track.id)}
									<li class:is-current={i === player.currentIndex}>
										<button type="button" class="np__jump" onclick={() => player.jumpTo(i)} title="Lire ce titre">{track.title}</button>
										<button type="button" class="np__rm" onclick={() => player.removeFromQueue(track.id)} aria-label="Retirer">✕</button>
									</li>
								{/each}
							{/if}
						</ul>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.np {
		position: fixed;
		inset: 0;
		z-index: 60;
		/* Fond teinté par la pochette (fallback thème si couleurs indisponibles). */
		background: linear-gradient(180deg, var(--np-top, var(--plum)) 0%, var(--np-bottom, var(--ink)) 100%);
		transition: background 0.5s ease;
		display: flex;
		flex-direction: column;
		padding: 1rem;
		padding-top: calc(1rem + env(safe-area-inset-top));
		padding-bottom: calc(1rem + env(safe-area-inset-bottom));
		font-family: var(--font-pixel);
		color: var(--cream);
	}

	.np__bar {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-shrink: 0;
	}
	.np__cap {
		flex: 1;
		text-transform: uppercase;
		letter-spacing: 0.16em;
		font-size: 0.72rem;
		color: var(--muted);
	}
	.np__close {
		background: var(--panel-hi);
		border: 3px solid var(--bezel);
		color: var(--cream);
		cursor: pointer;
		font-size: 1rem;
		width: 2.2rem;
		height: 2.2rem;
		box-shadow: inset 2px 2px 0 rgba(255, 255, 255, 0.12), inset -2px -2px 0 rgba(0, 0, 0, 0.4);
	}
	.np__tools {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.np__chip {
		background: var(--panel-hi);
		border: 3px solid var(--bezel);
		color: var(--cream);
		cursor: pointer;
		padding: 0.3rem 0.55rem;
		font-size: 0.8rem;
		box-shadow: inset 2px 2px 0 rgba(255, 255, 255, 0.12), inset -2px -2px 0 rgba(0, 0, 0, 0.4);
	}
	.np__chip.is-on {
		background: var(--np-accent, var(--gold-bright));
		color: var(--ink);
	}
	.np__sleep {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		border: 3px solid var(--bezel);
		background: var(--panel-hi);
		padding: 0.1rem 0.35rem;
		color: var(--muted);
	}
	.np__sleep.is-on {
		color: var(--gold-bright);
	}
	.np__sleep select {
		background: transparent;
		border: none;
		color: inherit;
		font-family: var(--font-pixel);
		font-size: 0.72rem;
		cursor: pointer;
	}

	.np__body {
		flex: 1;
		min-height: 0;
		display: flex;
		gap: 1.5rem;
		margin-top: 1rem;
		align-items: stretch;
	}

	.np__now {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.7rem;
	}
	.np__art {
		position: relative;
		width: min(42vh, 340px);
		height: min(42vh, 340px);
		border: 4px solid var(--bezel);
		background: var(--plum-deep);
		overflow: hidden;
		display: grid;
		place-items: center;
		box-shadow: 0 10px 0 0 var(--shadow), 0 0 0 2px var(--panel-hi) inset;
		touch-action: manipulation; /* pas de zoom double-tap natif : on gère le double-tap */
	}
	.np__seekflash {
		position: absolute;
		top: 50%;
		right: 8%;
		transform: translateY(-50%);
		font-size: 1.1rem;
		color: var(--np-accent, var(--gold-bright));
		background: rgba(0, 0, 0, 0.55);
		padding: 0.3rem 0.6rem;
		border: 2px solid var(--bezel);
		pointer-events: none;
	}
	.np__seekflash.back {
		right: auto;
		left: 8%;
	}
	.np__art img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.np__art.is-empty span {
		font-size: 4rem;
		color: var(--metal-mid);
	}
	/* Visualiseur décoratif (réagit à l'état lecture ; spectre réel impossible sans CORS audio). */
	.np__viz {
		display: flex;
		align-items: flex-end;
		gap: 3px;
		height: 2rem;
		width: min(100%, 460px);
		margin-top: 0.3rem;
	}
	.np__viz span {
		flex: 1;
		height: 14%;
		background: var(--np-accent, var(--gold-bright));
		opacity: 0.45;
	}
	.np__viz.is-live span {
		opacity: 1;
		animation: np-viz 0.8s steps(5) infinite alternate;
	}
	@keyframes np-viz {
		from {
			height: 14%;
		}
		to {
			height: 100%;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.np__viz.is-live span {
			animation: none;
		}
	}

	.np__title {
		margin: 0.4rem 0 0;
		font-size: 1.4rem;
		color: var(--cream-bright);
		text-align: center;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.np__artist {
		margin: 0;
		color: var(--muted);
		text-align: center;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.np__seek {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		width: min(100%, 460px);
		font-size: 0.72rem;
		color: var(--teal);
	}
	.np__track {
		position: relative;
		flex: 1;
		height: 12px;
		border: 3px solid var(--bezel);
		background: linear-gradient(
			90deg,
			var(--gold-bright) 0,
			var(--gold) var(--p, 0%),
			var(--plum-deep) var(--p, 0%)
		);
		box-shadow: inset 0 2px 0 rgba(0, 0, 0, 0.5);
	}
	.np__track::after {
		content: '';
		position: absolute;
		top: -3px;
		bottom: -3px;
		left: var(--p, 0%);
		width: 4px;
		transform: translateX(-2px);
		background: var(--cream-bright);
		box-shadow: 0 0 6px var(--np-accent, var(--glow));
		pointer-events: none;
	}
	.np__track input {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		opacity: 0;
		cursor: pointer;
		margin: 0;
	}

	.np__controls {
		display: flex;
		gap: 0.6rem;
		align-items: center;
	}
	.np__btn {
		width: 3rem;
		height: 3rem;
		display: grid;
		place-items: center;
		font-size: 1.1rem;
		color: var(--cream);
		background: var(--panel-hi);
		border: 3px solid var(--bezel);
		cursor: pointer;
		box-shadow: inset 2px 2px 0 rgba(255, 255, 255, 0.14), inset -2px -3px 0 rgba(0, 0, 0, 0.5);
	}
	.np__btn.is-active {
		color: var(--np-accent, var(--gold-bright));
		box-shadow: inset 2px 2px 0 rgba(255, 255, 255, 0.14), inset -2px -3px 0 rgba(0, 0, 0, 0.5), 0 0 10px var(--np-accent, var(--glow));
	}
	.np__btn--play {
		width: 3.8rem;
		color: var(--ink);
		background: var(--np-accent, var(--gold-bright));
	}
	.np__btn:active {
		transform: translateY(2px);
	}

	.np__vol {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: min(100%, 260px);
		color: var(--muted);
	}
	.np__vol input {
		flex: 1;
		accent-color: var(--gold-bright);
	}

	/* ---- Colonne paroles / file ---- */
	.np__side {
		width: 40%;
		max-width: 30rem;
		display: flex;
		flex-direction: column;
		min-height: 0;
		border: 3px solid var(--bezel);
		background: var(--plum-deep);
	}
	.np__tabs {
		display: flex;
		flex-shrink: 0;
		border-bottom: 3px solid var(--bezel);
	}
	.np__tabs button {
		flex: 1;
		background: var(--panel-lo);
		border: none;
		border-right: 3px solid var(--bezel);
		color: var(--muted);
		cursor: pointer;
		padding: 0.6rem;
		font-family: var(--font-pixel);
		font-size: 0.78rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.np__tabs button:last-child {
		border-right: none;
	}
	.np__tabs button.is-active {
		background: var(--panel-hi);
		color: var(--np-accent, var(--gold-bright));
	}

	.np__lyrics {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 1rem 1.2rem;
		text-align: center;
	}
	.np__line {
		margin: 0.55rem 0;
		font-size: 0.95rem;
		color: var(--metal-mid);
		transition: color 0.2s;
	}
	.np__line.is-active {
		color: var(--cream-bright);
		text-shadow: 0 0 12px var(--np-accent, var(--glow));
	}
	.np__plain {
		white-space: pre-wrap;
		text-align: left;
		color: var(--cream);
		font-size: 0.9rem;
		line-height: 1.5;
	}
	.np__muted {
		color: var(--muted);
	}

	.np__chapters {
		text-align: left;
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 0.6rem;
	}
	.np__chapter {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		width: 100%;
		background: none;
		border: none;
		border-radius: var(--radius-control, 0);
		padding: 0.5rem 0.6rem;
		color: var(--cream);
		font-family: var(--font-pixel);
		font-size: 0.85rem;
		text-align: left;
		cursor: pointer;
	}
	.np__chapter:hover {
		background: rgba(255, 255, 255, 0.06);
	}
	.np__chapter.is-active {
		background: var(--panel-hi);
		color: var(--np-accent, var(--gold-bright));
	}
	.np__chapter img {
		width: 36px;
		height: 36px;
		flex-shrink: 0;
		border-radius: var(--radius-control, 0);
		object-fit: cover;
	}
	.np__chapter-time {
		flex-shrink: 0;
		font-variant-numeric: tabular-nums;
		color: var(--muted);
		font-size: 0.75rem;
	}
	.np__chapter.is-active .np__chapter-time {
		color: inherit;
	}
	.np__chapter-title {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.np__queue {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 0.75rem;
	}
	.np__clear {
		background: none;
		border: none;
		color: var(--muted);
		cursor: pointer;
		font-family: var(--font-pixel);
		font-size: 0.66rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		margin-bottom: 0.5rem;
	}
	.np__clear:hover {
		color: var(--coral);
	}
	.np__queue ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.np__queue li {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		color: var(--muted);
		padding: 0.15rem 0;
	}
	.np__queue li.is-current {
		color: var(--gold-bright);
	}
	.np__jump {
		flex: 1;
		min-width: 0;
		background: none;
		border: none;
		color: inherit;
		text-align: left;
		cursor: pointer;
		font-family: var(--font-pixel);
		font-size: 0.8rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.np__jump:hover {
		color: var(--gold-bright);
	}
	.np__rm {
		flex-shrink: 0;
		background: none;
		border: none;
		color: var(--metal-mid);
		cursor: pointer;
		font-size: 0.7rem;
	}
	.np__rm:hover {
		color: var(--coral);
	}

	/* ---- Mobile / étroit : empilé ---- */
	@media (max-width: 760px) {
		.np__body {
			flex-direction: column;
			overflow-y: auto;
		}
		.np__side {
			width: 100%;
			max-width: none;
			min-height: 16rem;
		}
		.np__art {
			width: min(52vw, 220px);
			height: min(52vw, 220px);
		}
	}
</style>
