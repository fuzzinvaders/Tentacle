<script lang="ts">
	import { settings, type Settings } from '$lib/stores/settings.svelte';
	import { radios } from '$lib/stores/radios.svelte';
	import { podcastSpeeds } from '$lib/stores/podcastSpeeds.svelte';
	import { podcastSkips, type PodcastSkip } from '$lib/stores/podcastSkips.svelte';
	import { localPodcasts, type LocalFeedMeta, type LocalEpisodeState } from '$lib/stores/localPodcasts.svelte';
	import { toasts } from '$lib/stores/toasts.svelte';
	import type { RadioStation } from '$lib/types';

	// La sauvegarde ne contient QUE des préférences non sensibles : aucun jeton / clé API des
	// sources (ceux-ci restent dans le profil serveur chiffré côté compte).
	type Backup = {
		app: 'tentacle';
		kind: 'settings-backup';
		settings: Settings;
		radios: RadioStation[];
		podcastSpeeds: Record<number, number>;
		podcastSkips: Record<number, PodcastSkip>;
		localPodcastFeeds: Record<number, LocalFeedMeta>;
		localPodcastState: Record<number, LocalEpisodeState>;
		localPodcastQueue: number[];
	};

	let fileInput = $state<HTMLInputElement>();

	function exportBackup() {
		const data: Backup = {
			app: 'tentacle',
			kind: 'settings-backup',
			settings: settings.values,
			radios: radios.stations,
			podcastSpeeds: podcastSpeeds.all(),
			podcastSkips: podcastSkips.all(),
			localPodcastFeeds: localPodcasts.allFeeds(),
			localPodcastState: localPodcasts.allState(),
			localPodcastQueue: localPodcasts.allQueue()
		};
		// Téléchargement déclenché par l'utilisateur (clic) — ses propres réglages.
		const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'tentacle-reglages.json';
		a.click();
		URL.revokeObjectURL(url);
		toasts.info('Réglages exportés.');
	}

	async function onFileChosen(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		try {
			const data = JSON.parse(await file.text()) as Partial<Backup>;
			if (data.app !== 'tentacle' || data.kind !== 'settings-backup') {
				toasts.error('Fichier de sauvegarde Tentacle invalide.');
				return;
			}
			if (data.settings) settings.replaceAll(data.settings);
			if (Array.isArray(data.radios)) radios.replaceAll(data.radios);
			if (data.podcastSpeeds && typeof data.podcastSpeeds === 'object')
				podcastSpeeds.replaceAll(data.podcastSpeeds);
			if (data.podcastSkips && typeof data.podcastSkips === 'object')
				podcastSkips.replaceAll(data.podcastSkips);
			if (data.localPodcastFeeds && typeof data.localPodcastFeeds === 'object')
				localPodcasts.replaceAll(
					data.localPodcastFeeds,
					data.localPodcastState ?? {},
					Array.isArray(data.localPodcastQueue) ? data.localPodcastQueue : []
				);
			toasts.info('Réglages restaurés.');
		} catch {
			toasts.error('Impossible de lire ce fichier de sauvegarde.');
		}
	}
</script>

<div class="backup">
	<p class="backup__hint">
		Exporte tes préférences, radios favorites et vitesses de podcasts dans un fichier
		(sans mots de passe ni jetons des sources). Utile pour migrer d'un appareil à l'autre.
	</p>
	<div class="backup__actions">
		<button type="button" class="pixel-btn pixel-btn--ghost" onclick={exportBackup}>
			⬇ Exporter les réglages
		</button>
		<button type="button" class="pixel-btn pixel-btn--ghost" onclick={() => fileInput?.click()}>
			⬆ Restaurer
		</button>
		<input
			bind:this={fileInput}
			type="file"
			accept="application/json,.json"
			class="backup__file"
			onchange={onFileChosen}
		/>
	</div>
</div>

<style>
	.backup__hint {
		margin: 0 0 0.75rem;
		color: var(--muted);
		font-size: 0.82rem;
	}

	.backup__actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
	}

	.backup__file {
		display: none;
	}
</style>
