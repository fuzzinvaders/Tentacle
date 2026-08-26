<script lang="ts">
	import { subscribeToFeed, listSubscriptions } from '$lib/api/localPodcasts';
	import { buildOpml, parseOpml } from '$lib/opml';
	import { mapLimit } from '$lib/concurrency';
	import { toasts } from '$lib/stores/toasts.svelte';

	// Import/export OPML des abonnements « Intégrés ». Le formulaire d'ajout par URL, lui, est
	// commun aux deux sources : voir PodcastFeedAdd, monté par PodcastsPanel.
	let { onSubscribed }: { onSubscribed: () => void } = $props();

	let exporting = $state(false);
	let importing = $state(false);
	let fileInput = $state<HTMLInputElement>();

	function exportOpml() {
		const pods = listSubscriptions();
		const feeds = pods.map((p) => ({ title: p.podcastname, feedUrl: p.feedurl })).filter((f) => f.feedUrl);
		if (feeds.length === 0) {
			toasts.info('Aucun abonnement à exporter.');
			return;
		}
		exporting = true;
		try {
			const xml = buildOpml(feeds);
			// Téléchargement déclenché par l'action de l'utilisateur (clic) : export de ses
			// propres abonnements.
			const blob = new Blob([xml], { type: 'text/x-opml' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = 'tentacle-podcasts.opml';
			a.click();
			URL.revokeObjectURL(url);
			toasts.info(`${feeds.length} abonnement(s) exporté(s).`);
		} finally {
			exporting = false;
		}
	}

	async function onFileChosen(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file || importing) return;
		importing = true;
		try {
			const feeds = parseOpml(await file.text());
			if (feeds.length === 0) {
				toasts.info('Aucun flux trouvé dans ce fichier OPML.');
				return;
			}
			const existing = new Set(listSubscriptions().map((p) => p.feedurl));
			const toAdd = feeds.filter((f) => !existing.has(f.feedUrl));
			if (toAdd.length === 0) {
				toasts.info('Tous les flux du fichier sont déjà abonnés.');
				return;
			}
			let ok = 0;
			await mapLimit(toAdd, 3, async (f) => {
				try {
					await subscribeToFeed(f.feedUrl);
					ok++;
				} catch {
					/* flux invalide/injoignable : ignoré, le compteur reflète les réussites */
				}
			});
			toasts.info(`${ok}/${toAdd.length} podcast(s) importé(s).`);
			onSubscribed();
		} finally {
			importing = false;
		}
	}
</script>

<div class="local-add">
	<div class="local-add__opml">
		<button type="button" class="pixel-btn pixel-btn--ghost" disabled={exporting} onclick={exportOpml}>
			{exporting ? 'Export…' : '⬇ Exporter OPML'}
		</button>
		<button
			type="button"
			class="pixel-btn pixel-btn--ghost"
			disabled={importing}
			onclick={() => fileInput?.click()}
		>
			{importing ? 'Import…' : '⬆ Importer OPML'}
		</button>
		<input
			bind:this={fileInput}
			type="file"
			accept=".opml,.xml,text/x-opml,text/xml"
			class="local-add__file"
			onchange={onFileChosen}
		/>
	</div>
</div>

<style>
	.local-add__opml {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
	}
	.local-add__file {
		display: none;
	}
</style>
