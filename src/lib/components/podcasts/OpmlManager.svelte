<script lang="ts">
	import { pinepods } from '$lib/stores/pinepods.svelte';
	import { toasts } from '$lib/stores/toasts.svelte';
	import { listPodcasts, addPodcastByFeed, PinePodsApiError } from '$lib/api/pinepods';
	import { buildOpml, parseOpml } from '$lib/opml';
	import { mapLimit } from '$lib/concurrency';

	let exporting = $state(false);
	let importing = $state(false);
	let fileInput = $state<HTMLInputElement>();

	async function exportOpml() {
		const conn = pinepods.connection;
		if (!conn || exporting) return;
		exporting = true;
		try {
			const pods = await listPodcasts(conn);
			const feeds = pods
				.map((p) => ({ title: p.podcastname, feedUrl: p.feedurl }))
				.filter((f) => f.feedUrl);
			if (feeds.length === 0) {
				toasts.info('Aucun abonnement à exporter.');
				return;
			}
			const xml = buildOpml(feeds);
			// Téléchargement déclenché par l'action de l'utilisateur (clic) : export de ses
			// propres abonnements, révoqué juste après.
			const blob = new Blob([xml], { type: 'text/x-opml' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = 'tentacle-podcasts.opml';
			a.click();
			URL.revokeObjectURL(url);
			toasts.info(`${feeds.length} abonnement(s) exporté(s).`);
		} catch (err) {
			toasts.error(err instanceof PinePodsApiError ? err.message : 'Export OPML impossible.');
		} finally {
			exporting = false;
		}
	}

	async function onFileChosen(e: Event) {
		const conn = pinepods.connection;
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = ''; // permet de re-sélectionner le même fichier
		if (!conn || !file || importing) return;
		importing = true;
		try {
			const feeds = parseOpml(await file.text());
			if (feeds.length === 0) {
				toasts.info('Aucun flux trouvé dans ce fichier OPML.');
				return;
			}
			// Abonnements existants → on n'ajoute que les nouveaux.
			const existing = new Set((await listPodcasts(conn)).map((p) => p.feedurl));
			const toAdd = feeds.filter((f) => !existing.has(f.feedUrl));
			if (toAdd.length === 0) {
				toasts.info('Tous les flux du fichier sont déjà abonnés.');
				return;
			}
			let ok = 0;
			await mapLimit(toAdd, 3, async (f) => {
				try {
					await addPodcastByFeed(conn, f.feedUrl, f.title);
					ok++;
				} catch {
					/* flux invalide ou déjà présent : ignoré, le compteur reflète les réussites */
				}
			});
			toasts.info(`${ok}/${toAdd.length} podcast(s) importé(s).`);
		} catch (err) {
			toasts.error(err instanceof PinePodsApiError ? err.message : 'Import OPML impossible.');
		} finally {
			importing = false;
		}
	}
</script>

<div class="opml">
	<p class="opml__hint">
		Sauvegarde ou transfère tes abonnements podcasts au format OPML (standard, compatible avec
		les autres applications).
	</p>
	<div class="opml__actions">
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
			class="opml__file"
			onchange={onFileChosen}
		/>
	</div>
</div>

<style>
	.opml__hint {
		margin: 0 0 0.75rem;
		color: var(--muted);
		font-size: 0.82rem;
	}

	.opml__actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
	}

	.opml__file {
		display: none;
	}
</style>
