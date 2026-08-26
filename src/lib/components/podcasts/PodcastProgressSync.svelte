<script lang="ts">
	import { untrack } from 'svelte';
	import { player } from '$lib/stores/player.svelte';
	import { pinepods } from '$lib/stores/pinepods.svelte';
	import { saveEpisodePosition, markEpisodeCompleted, removeFromQueue } from '$lib/api/pinepods';
	import { saveListenPosition, markCompleted as markLocalCompleted } from '$lib/api/localPodcasts';

	// Headless component: keeps the podcast source (PinePods or local RSS — see
	// `track.podcastMeta.local`) in sync with whatever episode is currently playing on the
	// shared bus, regardless of which tab the user is looking at.
	let syncedEpisodeId = -1;
	let lastSavedBucket = -1;
	let lastSavedPos = -1;
	let completedIds = new Set<number>();

	function persistPosition(local: boolean, podcastId: number, episodeId: number, pos: number) {
		if (local) {
			saveListenPosition(episodeId, podcastId, pos);
			return;
		}
		const conn = pinepods.connection;
		if (conn) saveEpisodePosition(conn, episodeId, pos).catch(() => {});
	}

	/** Sauvegarde immédiate de la position courante (pause, fermeture, mise en arrière-plan).
	 * Indispensable : l'effet réactif ne se déclenche plus quand la position est figée, donc
	 * sans ce flush les dernières secondes ne remonteraient jamais à la source → reprise en retard. */
	function flush() {
		const track = player.current;
		if (!track || track.source !== 'podcast' || !track.podcastMeta) return;
		const pos = Math.floor(player.positionSec);
		if (pos <= 0 || pos === lastSavedPos) return;
		lastSavedPos = pos;
		lastSavedBucket = Math.floor(pos / 15);
		persistPosition(!!track.podcastMeta.local, track.podcastMeta.podcastId, track.podcastMeta.episodeId, pos);
	}

	$effect(() => {
		const track = player.current;
		if (!track || track.source !== 'podcast' || !track.podcastMeta) return;
		const { podcastId, episodeId, local } = track.podcastMeta;

		if (episodeId !== syncedEpisodeId) {
			syncedEpisodeId = episodeId;
			lastSavedBucket = -1;
			lastSavedPos = -1;
		}

		const pos = player.positionSec;
		const duration = player.durationSec;

		const bucket = Math.floor(pos / 15);
		if (pos > 0 && bucket !== lastSavedBucket) {
			lastSavedBucket = bucket;
			lastSavedPos = Math.floor(pos);
			persistPosition(!!local, podcastId, episodeId, Math.floor(pos));
		}

		if (duration > 0 && pos / duration > 0.97 && !completedIds.has(episodeId)) {
			completedIds.add(episodeId);
			if (local) {
				// markCompleted() retire aussi l'épisode de la file locale.
				markLocalCompleted(episodeId, podcastId);
			} else {
				const conn = pinepods.connection;
				if (conn) {
					markEpisodeCompleted(conn, episodeId).catch(() => {});
					// Épisode terminé → le retirer de la file PinePods (sinon les épisodes finis
					// s'y accumulent). Sans effet s'il n'y était pas.
					removeFromQueue(conn, episodeId).catch(() => {});
				}
			}
		}
	});

	// Flush à chaque passage lecture → pause (position ensuite figée, l'effet ne re-sauvera pas).
	let wasPlaying = false;
	$effect(() => {
		const playing = player.playing;
		if (wasPlaying && !playing) untrack(() => flush());
		wasPlaying = playing;
	});
</script>

<svelte:window onpagehide={flush} />
<svelte:document
	onvisibilitychange={() => {
		if (document.visibilityState === 'hidden') flush();
	}}
/>
