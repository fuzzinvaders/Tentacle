<script lang="ts">
	import { settings, type Settings } from '$lib/stores/settings.svelte';
	import { radios } from '$lib/stores/radios.svelte';
	import { podcastSpeeds } from '$lib/stores/podcastSpeeds.svelte';
	import { podcastSkips, type PodcastSkip } from '$lib/stores/podcastSkips.svelte';
	import { localPodcasts, type LocalFeedMeta, type LocalEpisodeState } from '$lib/stores/localPodcasts.svelte';
	import { toasts } from '$lib/stores/toasts.svelte';
	import type { RadioStation } from '$lib/types';
	import { buildConnections, applyConnections, type Connections } from '$lib/profileSync.svelte';
	import { Capacitor } from '@capacitor/core';
	import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

	const FILE_NAME = 'tentacle-reglages.json';

	// Préférences, radios, podcasts… et, SI l'utilisateur le demande, les connexions aux sources
	// (URL des serveurs + jetons / clés API) : c'est ce qui permet de monter une application
	// Android à partir de la version web sans tout ressaisir. Ces dernières sont sensibles —
	// d'où une case explicite, et l'absence du champ `connections` quand elle est décochée.
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
		connections?: Connections;
	};

	let fileInput = $state<HTMLInputElement>();
	let includeCredentials = $state(true);

	async function exportBackup() {
		const data: Backup = {
			app: 'tentacle',
			kind: 'settings-backup',
			settings: settings.values,
			radios: radios.stations,
			podcastSpeeds: podcastSpeeds.all(),
			podcastSkips: podcastSkips.all(),
			localPodcastFeeds: localPodcasts.allFeeds(),
			localPodcastState: localPodcasts.allState(),
			localPodcastQueue: localPodcasts.allQueue(),
			...(includeCredentials ? { connections: buildConnections() } : {})
		};
		const json = JSON.stringify(data, null, 2);

		// Le téléchargement web (<a download>) n'a pas d'équivalent fiable dans la WebView
		// Android : constaté en usage réel, rien ne se passe visiblement — ni le fichier, ni la
		// moindre erreur. Écriture native dans le dossier « Documents » public à la place, comme
		// le téléchargement audio hors-ligne le fait déjà (voir downloads.ts) : visible depuis
		// n'importe quel gestionnaire de fichiers, sans permission de stockage supplémentaire à
		// demander (l'app peut toujours écrire les fichiers qu'elle crée elle-même).
		if (Capacitor.isNativePlatform()) {
			try {
				await Filesystem.writeFile({
					path: FILE_NAME,
					data: json,
					directory: Directory.Documents,
					encoding: Encoding.UTF8,
					recursive: true
				});
				toasts.info(`Réglages exportés dans Documents/${FILE_NAME}.`);
			} catch (err) {
				toasts.error(`Export impossible : ${err instanceof Error ? err.message : String(err)}`);
			}
			return;
		}

		// Web : téléchargement classique du navigateur, déclenché par ce clic (geste utilisateur).
		const blob = new Blob([json], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = FILE_NAME;
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
			const connected = applyConnections(data.connections, {
				native: Capacitor.isNativePlatform()
			});
			toasts.info(
				connected.length > 0
					? `Réglages restaurés — sources reconnectées : ${connected.join(', ')}.`
					: 'Réglages restaurés.'
			);
		} catch {
			toasts.error('Impossible de lire ce fichier de sauvegarde.');
		}
	}
</script>

<div class="backup">
	<p class="backup__hint">
		Exporte tes préférences, radios favorites, abonnements et vitesses de podcasts dans un
		fichier. Utile pour migrer d'un appareil à l'autre — par exemple de la version web vers
		l'application Android.
	</p>
	<label class="backup__check">
		<input type="checkbox" bind:checked={includeCredentials} />
		<span>Inclure les identifiants des sources (URL des serveurs, jetons, clés API)</span>
	</label>
	{#if includeCredentials}
		<p class="backup__warn">
			⚠️ Le fichier contiendra tes jetons en clair : garde-le pour toi et supprime-le une fois
			importé. Sur Android, Last.fm et Lidarr (réservés à la version web) ne sont pas repris.
		</p>
	{/if}
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

	.backup__check {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		margin: 0 0 0.5rem;
		font-size: 0.85rem;
		cursor: pointer;
	}

	.backup__warn {
		margin: 0 0 0.75rem;
		color: var(--coral);
		font-size: 0.78rem;
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
