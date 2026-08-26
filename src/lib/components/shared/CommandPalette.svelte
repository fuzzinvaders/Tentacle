<script lang="ts">
	import { ui } from '$lib/stores/ui.svelte';
	import { player } from '$lib/stores/player.svelte';
	import { sleep } from '$lib/stores/sleep.svelte';
	import { jellyfin } from '$lib/stores/jellyfin.svelte';
	import { radios } from '$lib/stores/radios.svelte';
	import { pinepods } from '$lib/stores/pinepods.svelte';
	import { listPodcasts, homeOverview } from '$lib/api/pinepods';
	import {
		listSubscriptions as listLocalSubscriptions,
		listRecentEpisodes as listLocalRecent
	} from '$lib/api/localPodcasts';
	import { settings } from '$lib/stores/settings.svelte';
	import type { PinePodsPodcast, PinePodsEpisode } from '$lib/types';
	import { toasts } from '$lib/stores/toasts.svelte';
	import { songToTrack } from '$lib/jellyfinTrack';
	import { stationToTrack } from '$lib/radioTrack';
	import { episodeToTrack } from '$lib/podcastTrack';
	import {
		searchSongs,
		searchAlbums,
		searchArtists,
		getAlbumTracks,
		getArtistTracks
	} from '$lib/api/jellyfin';
	import type { JellyfinItem } from '$lib/types';

	let { open, onClose, onOpenNowPlaying }: {
		open: boolean;
		onClose: () => void;
		onOpenNowPlaying: () => void;
	} = $props();

	type Command = { id: string; label: string; hint?: string; run: () => void };
	type SearchHit = {
		id: string;
		label: string;
		hint: string;
		run: () => void | Promise<void>;
	};

	// Liste des commandes. Reconstruite à la volée (les libellés dépendent de l'état courant :
	// Lecture/Pause, Aléatoire on/off…).
	const commands = $derived<Command[]>([
		{ id: 'go-home', label: 'Aller à l’Accueil', hint: 'Espace', run: () => (ui.activeSpace = 'home') },
		{ id: 'go-library', label: 'Aller à la Bibliothèque', hint: 'Espace', run: () => (ui.activeSpace = 'library') },
		{ id: 'go-radios', label: 'Aller aux Radios', hint: 'Espace', run: () => (ui.activeSpace = 'radios') },
		{ id: 'go-podcasts', label: 'Aller aux Podcasts', hint: 'Espace', run: () => (ui.activeSpace = 'podcasts') },
		{ id: 'go-config', label: 'Aller à la Configuration', hint: 'Espace', run: () => (ui.activeSpace = 'config') },
		{ id: 'nowplaying', label: 'Ouvrir « Lecture en cours »', hint: 'Lecteur', run: onOpenNowPlaying },
		{ id: 'playpause', label: player.playing ? 'Pause' : 'Lecture', hint: 'Lecteur', run: () => player.togglePlay() },
		{ id: 'next', label: 'Titre suivant', hint: 'Lecteur', run: () => player.next() },
		{ id: 'prev', label: 'Titre précédent', hint: 'Lecteur', run: () => player.prev() },
		{ id: 'shuffle', label: player.shuffle ? 'Désactiver l’aléatoire' : 'Activer l’aléatoire', hint: 'Lecteur', run: () => player.toggleShuffle() },
		{ id: 'repeat', label: `Répétition : ${player.repeat === 'off' ? 'aucune' : player.repeat === 'all' ? 'toute la file' : 'ce titre'} → suivante`, hint: 'Lecteur', run: () => player.cycleRepeat() },
		{ id: 'clear', label: 'Vider la file d’attente', hint: 'Lecteur', run: () => player.clearQueue() },
		{ id: 'sleep-15', label: 'Minuteur de sommeil : 15 min', hint: 'Sommeil', run: () => sleep.setMinutes(15) },
		{ id: 'sleep-30', label: 'Minuteur de sommeil : 30 min', hint: 'Sommeil', run: () => sleep.setMinutes(30) },
		{ id: 'sleep-60', label: 'Minuteur de sommeil : 60 min', hint: 'Sommeil', run: () => sleep.setMinutes(60) },
		{ id: 'sleep-off', label: 'Annuler le minuteur de sommeil', hint: 'Sommeil', run: () => sleep.cancel() }
	]);

	let query = $state('');
	let selected = $state(0);
	let inputEl = $state<HTMLInputElement>();
	let searchHits = $state<SearchHit[]>([]);
	let searching = $state(false);
	let podcasts = $state<PinePodsPodcast[]>([]); // abonnements de la source active
	let episodes = $state<PinePodsEpisode[]>([]); // épisodes récents, pour la recherche par titre
	const isLocalPodcasts = $derived(settings.values.podcastSource === 'local');

	const filteredCommands = $derived(
		(() => {
			const q = query.trim().toLowerCase();
			if (!q) return commands;
			return commands.filter(
				(c) => c.label.toLowerCase().includes(q) || (c.hint ?? '').toLowerCase().includes(q)
			);
		})()
	);

	// Résultats locaux (en mémoire, synchrones) : radios enregistrées + podcasts abonnés.
	const localHits = $derived<SearchHit[]>(
		(() => {
			const q = query.trim().toLowerCase();
			if (q.length < 2) return [];
			const hits: SearchHit[] = [];
			for (const s of radios.stations) {
				if (s.name.toLowerCase().includes(q) || (s.tags ?? '').toLowerCase().includes(q)) {
					hits.push({
						id: `radio-${s.id}`,
						label: s.name,
						hint: 'Radio',
						run: () => player.playNow(stationToTrack(s))
					});
				}
			}
			for (const p of podcasts) {
				if (p.podcastname.toLowerCase().includes(q)) {
					hits.push({
						id: `pod-${p.podcastid}`,
						label: p.podcastname,
						hint: 'Podcast',
						run: () => {
							ui.activeSpace = 'podcasts';
						}
					});
				}
			}
			// Épisodes : c'est souvent l'épisode qu'on cherche, pas l'émission. Portée volontairement
			// limitée aux épisodes RÉCENTS (une seule requête, déjà mise en cache par la source) —
			// fouiller tous les flux de tous les abonnements serait beaucoup trop lent pour une
			// palette qui doit répondre à la frappe.
			for (const ep of episodes) {
				if (ep.episodetitle.toLowerCase().includes(q)) {
					hits.push({
						id: `ep-${ep.episodeid}`,
						label: ep.episodetitle,
						hint: `Épisode · ${ep.podcastname}`,
						run: () => player.playNow(episodeToTrack(ep, isLocalPodcasts))
					});
				}
			}
			return hits.slice(0, 8);
		})()
	);

	// Entrées combinées : commandes filtrées, résultats locaux (radios/podcasts), puis Jellyfin.
	const entries = $derived<(Command | SearchHit)[]>([
		...filteredCommands,
		...localHits,
		...searchHits
	]);

	function playAlbumHit(album: JellyfinItem): SearchHit {
		return {
			id: `al-${album.Id}`,
			label: album.Name,
			hint: 'Album',
			run: async () => {
				const conn = jellyfin.connection;
				if (!conn) return;
				const tracks = await getAlbumTracks(conn, album.Id);
				if (tracks.length === 0) return toasts.info('Album vide.');
				player.playCollection(tracks.map((t) => songToTrack(conn, t)));
				toasts.info(`Lecture de « ${album.Name} »`);
			}
		};
	}

	function playArtistHit(artist: JellyfinItem): SearchHit {
		return {
			id: `ar-${artist.Id}`,
			label: artist.Name,
			hint: 'Artiste',
			run: async () => {
				const conn = jellyfin.connection;
				if (!conn) return;
				const tracks = await getArtistTracks(conn, artist.Id);
				if (tracks.length === 0) return toasts.info('Aucun titre.');
				player.playCollection(tracks.map((t) => songToTrack(conn, t)));
				toasts.info(`Lecture de ${artist.Name}`);
			}
		};
	}

	function playSongHit(song: JellyfinItem): SearchHit {
		return {
			id: `so-${song.Id}`,
			label: song.Name,
			hint: (song.Artists ?? []).join(', ') || 'Titre',
			run: () => {
				const conn = jellyfin.connection;
				if (conn) player.playNow(songToTrack(conn, song));
			}
		};
	}

	// Recherche Jellyfin anti-rebond (uniquement si connecté et requête ≥ 2 caractères).
	let searchTimer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		const term = query.trim();
		const conn = jellyfin.connection;
		clearTimeout(searchTimer);
		if (!open || !conn || term.length < 2) {
			searchHits = [];
			searching = false;
			return;
		}
		searching = true;
		searchTimer = setTimeout(async () => {
			try {
				const [songs, albums, artists] = await Promise.all([
					searchSongs(conn, term, 8),
					searchAlbums(conn, term).then((r) => r.slice(0, 5)),
					searchArtists(conn, term).then((r) => r.slice(0, 4))
				]);
				searchHits = [
					...songs.map(playSongHit),
					...albums.map(playAlbumHit),
					...artists.map(playArtistHit)
				];
			} catch {
				searchHits = [];
			} finally {
				searching = false;
			}
		}, 280);
		return () => clearTimeout(searchTimer);
	});

	// À l'ouverture : réinitialise et donne le focus au champ.
	$effect(() => {
		if (open) {
			query = '';
			selected = 0;
			searchHits = [];
			// focus après rendu
			queueMicrotask(() => inputEl?.focus());
			// Abonnements podcasts chargés pour la recherche multi-sources, selon la source active
			// (même réglage podcastSource que PodcastsPanel — sinon aucun résultat en mode local).
			if (isLocalPodcasts) {
				// Lecture locale synchrone (pas de requête réseau) : autant rafraîchir à chaque
				// ouverture, un abonnement a pu être ajouté depuis la dernière fois.
				podcasts = listLocalSubscriptions();
				if (episodes.length === 0) {
					listLocalRecent(60)
						.then((e) => (episodes = e))
						.catch(() => {});
				}
			} else {
				const conn = pinepods.connection;
				if (conn && podcasts.length === 0) {
					listPodcasts(conn)
						.then((p) => (podcasts = p))
						.catch(() => {});
				}
				if (conn && episodes.length === 0) {
					homeOverview(conn)
						.then((e) => (episodes = e))
						.catch(() => {});
				}
			}
		}
	});

	// Garde la sélection dans les bornes quand la liste rétrécit.
	$effect(() => {
		if (selected >= entries.length) selected = Math.max(0, entries.length - 1);
	});

	function runAt(i: number) {
		const entry = entries[i];
		if (!entry) return;
		onClose();
		void entry.run();
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			onClose();
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			selected = Math.min(entries.length - 1, selected + 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			selected = Math.max(0, selected - 1);
		} else if (e.key === 'Enter') {
			e.preventDefault();
			runAt(selected);
		}
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div class="cmdk" onclick={onClose}>
		<div class="cmdk__panel scanlines" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex={-1} aria-label="Palette de commandes">
			<input
				bind:this={inputEl}
				bind:value={query}
				type="text"
				class="cmdk__input"
				placeholder="Tapez une commande…"
				aria-label="Rechercher une commande"
				onkeydown={onKeydown}
			/>
			<ul class="cmdk__list">
				{#if entries.length === 0}
					<li class="cmdk__empty">{searching ? 'Recherche…' : 'Aucun résultat'}</li>
				{:else}
					{#each entries as entry, i (entry.id)}
						<li>
							<button
								type="button"
								class="cmdk__item"
								class:is-selected={i === selected}
								onmousemove={() => (selected = i)}
								onclick={() => runAt(i)}
							>
								<span class="cmdk__label">{entry.label}</span>
								{#if entry.hint}<span class="cmdk__hint">{entry.hint}</span>{/if}
							</button>
						</li>
					{/each}
					{#if searching}
						<li class="cmdk__empty">Recherche…</li>
					{/if}
				{/if}
			</ul>
		</div>
	</div>
{/if}

<style>
	.cmdk {
		position: fixed;
		inset: 0;
		z-index: 300;
		background: rgba(0, 0, 0, 0.55);
		display: flex;
		justify-content: center;
		align-items: flex-start;
		padding: 12vh 1rem 1rem;
	}

	.cmdk__panel {
		position: relative; /* ancre la superposition .scanlines */
		width: 100%;
		max-width: 34rem;
		background: var(--plum-deep);
		border: 3px solid var(--bezel);
		border-radius: var(--radius-control, 0);
		box-shadow: 6px 8px 0 0 var(--shadow);
		overflow: hidden;
		display: flex;
		flex-direction: column;
		max-height: 70vh;
	}

	.cmdk__input {
		font-family: var(--font-pixel);
		font-size: 1rem;
		padding: 0.9rem 1rem;
		background: var(--ink);
		color: var(--cream-bright);
		border: none;
		border-bottom: 3px solid var(--bezel);
		outline: none;
	}

	.cmdk__list {
		list-style: none;
		margin: 0;
		padding: 0.35rem;
		overflow-y: auto;
	}

	.cmdk__item {
		font-family: var(--font-pixel);
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		background: none;
		border: none;
		color: var(--cream);
		padding: 0.6rem 0.75rem;
		cursor: pointer;
		text-align: left;
		border-radius: var(--radius-control, 0);
	}

	.cmdk__item.is-selected {
		background: var(--plum);
		color: var(--gold-bright);
	}

	.cmdk__label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.cmdk__hint {
		flex-shrink: 0;
		font-size: 0.68rem;
		color: var(--muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.cmdk__empty {
		color: var(--muted);
		padding: 0.75rem;
		text-align: center;
	}
</style>
