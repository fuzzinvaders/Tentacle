<script lang="ts">
	import { localFiles } from '$lib/stores/localFiles.svelte';
	import { player } from '$lib/stores/player.svelte';
	import { toasts } from '$lib/stores/toasts.svelte';

	let fileInput = $state<HTMLInputElement>();
	let folderInput = $state<HTMLInputElement>();

	// webkitdirectory n'est pas typé sur HTMLInputElement : on le pose via une action.
	function asDirectory(node: HTMLInputElement) {
		node.setAttribute('webkitdirectory', '');
		node.setAttribute('directory', '');
	}

	function onPick(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		if (!input.files || input.files.length === 0) return;
		const before = localFiles.tracks.length;
		localFiles.add(input.files);
		const added = localFiles.tracks.length - before;
		input.value = ''; // permet de re-choisir les mêmes fichiers
		toasts.info(
			added > 0
				? `${added} fichier${added > 1 ? 's' : ''} audio ajouté${added > 1 ? 's' : ''}`
				: 'Aucun fichier audio reconnu'
		);
	}

	function playAll() {
		if (localFiles.tracks.length === 0) return;
		player.playCollection(localFiles.tracks.slice());
	}

	function enqueueAll() {
		if (localFiles.tracks.length === 0) return;
		for (const t of localFiles.tracks) player.enqueue(t);
		toasts.info(`${localFiles.tracks.length} titre(s) ajouté(s) à la file`);
	}
</script>

<input
	bind:this={fileInput}
	type="file"
	accept="audio/*"
	multiple
	hidden
	onchange={onPick}
/>
<input bind:this={folderInput} type="file" hidden onchange={onPick} use:asDirectory />

<p class="hint">
	Lis des fichiers audio directement depuis cet appareil (ou un NAS monté/accessible via le
	sélecteur du système). Rien n'est envoyé sur un serveur ; la sélection reste sur cette session.
</p>

<div class="actions">
	<button type="button" class="pixel-btn" onclick={() => fileInput?.click()}>
		Choisir des fichiers
	</button>
	<button type="button" class="pixel-btn pixel-btn--ghost" onclick={() => folderInput?.click()}>
		Choisir un dossier
	</button>
</div>

{#if localFiles.tracks.length > 0}
	<div class="list-head">
		<span>{localFiles.tracks.length} fichier(s)</span>
		<div class="list-head__actions">
			<button type="button" class="pixel-btn pixel-btn--play" onclick={playAll}>Tout lire</button>
			<button type="button" class="pixel-btn pixel-btn--ghost" onclick={enqueueAll}>
				Ajouter à la file
			</button>
			<button type="button" class="pixel-btn pixel-btn--ghost" onclick={() => localFiles.clear()}>
				Vider
			</button>
		</div>
	</div>

	<ul class="files">
		{#each localFiles.tracks as track (track.id)}
			<li>
				<button
					type="button"
					class="file-play"
					title="Lire"
					onclick={() => player.playNow(track)}
				>
					<span class="file-play__glyph" aria-hidden="true">▶</span>
					{track.title}
				</button>
				<button
					type="button"
					class="file-remove"
					aria-label="Retirer"
					title="Retirer"
					onclick={() => localFiles.remove(track.id)}
				>✕</button>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.hint {
		margin: 0 0 0.75rem;
		color: var(--muted);
		font-size: 0.8rem;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
	}

	.list-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.6rem;
		margin-top: 1rem;
		color: var(--muted);
		font-size: 0.78rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.list-head__actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.files {
		list-style: none;
		margin: 0.6rem 0 0;
		padding: 0;
		max-height: 14rem;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.files li {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.file-play {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		background: var(--plum-deep);
		border: 2px solid var(--bezel);
		border-radius: var(--radius-control, 0);
		color: var(--cream);
		font-family: var(--font-pixel);
		font-size: 0.82rem;
		text-align: left;
		padding: 0.45rem 0.6rem;
		cursor: pointer;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.file-play:hover {
		color: var(--cream-bright);
		border-color: var(--gold-bright);
	}

	.file-play__glyph {
		color: var(--gold-bright);
		flex-shrink: 0;
		font-size: 0.7rem;
	}

	.file-remove {
		flex-shrink: 0;
		background: none;
		border: none;
		cursor: pointer;
		color: var(--metal-mid);
		font-size: 0.8rem;
		padding: 0.2rem 0.35rem;
	}

	.file-remove:hover {
		color: var(--coral);
	}
</style>
