<script lang="ts">
	import { downloads } from '$lib/stores/downloads.svelte';
	import { removeDownload, downloadToTrack, offlineSupported } from '$lib/downloads';
	import { player } from '$lib/stores/player.svelte';
	import { toasts } from '$lib/stores/toasts.svelte';

	const list = $derived(downloads.list);
	const totalSize = $derived(downloads.totalSize);

	function formatSize(bytes: number): string {
		if (bytes <= 0) return '';
		const mb = bytes / (1024 * 1024);
		return mb >= 1024 ? `${(mb / 1024).toFixed(1)} Go` : `${Math.round(mb)} Mo`;
	}

	function playAll() {
		if (list.length === 0) return;
		player.playCollection(list.map(downloadToTrack));
	}
	function playOne(id: string) {
		const rec = downloads.get(id);
		if (rec) player.playNow(downloadToTrack(rec));
	}
	async function del(id: string, title: string) {
		await removeDownload(id);
		toasts.info(`« ${title} » supprimé des téléchargements`);
	}
</script>

{#if !offlineSupported()}
	<p class="hint">
		Les téléchargements hors-ligne ne sont disponibles que dans l'application mobile (Android).
	</p>
{:else if list.length === 0}
	<p class="hint">
		Aucun téléchargement. Depuis un album, appui long (ou clic droit) sur un titre → « Télécharger ».
	</p>
{:else}
	<div class="dl-head">
		<span>{list.length} titre{list.length > 1 ? 's' : ''} hors-ligne{#if totalSize > 0} · {formatSize(totalSize)}{/if}</span>
		<button type="button" class="pixel-btn pixel-btn--ghost" onclick={playAll}>▶ Tout lire</button>
	</div>
	<ul class="dl-list">
		{#each list as rec (rec.id)}
			<li class="dl">
				<button type="button" class="dl__play" onclick={() => playOne(rec.id)} aria-label={`Lire ${rec.title}`}>
					<span class="dl__icon">⭳</span>
					<span class="dl__text">
						<strong>{rec.title}</strong>
						<small>{rec.subtitle}</small>
					</span>
				</button>
				<button
					type="button"
					class="dl__del"
					title="Supprimer"
					aria-label={`Supprimer ${rec.title}`}
					onclick={() => del(rec.id, rec.title)}
				>✕</button>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.hint {
		color: var(--muted);
		font-size: 0.82rem;
		margin: 0;
	}
	.dl-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 0.6rem;
		font-size: 0.82rem;
		color: var(--muted);
	}
	.dl-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.dl {
		display: flex;
		align-items: stretch;
		gap: 2px;
	}
	.dl__play {
		font-family: var(--font-pixel);
		flex: 1;
		min-width: 0;
		display: flex;
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
	.dl__play:hover {
		background: var(--plum);
		color: var(--cream-bright);
	}
	.dl__icon {
		color: var(--teal);
		flex-shrink: 0;
	}
	.dl__text {
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.dl__text strong {
		font-size: 0.85rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.dl__text small {
		font-size: 0.72rem;
		color: var(--muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.dl__del {
		flex-shrink: 0;
		width: 2.4rem;
		display: grid;
		place-items: center;
		background: var(--plum-deep);
		border: 2px solid var(--bezel);
		border-radius: var(--radius-control, 0);
		color: var(--metal-mid);
		cursor: pointer;
	}
	.dl__del:hover {
		color: var(--coral);
	}
</style>
