<script lang="ts">
	import type { PinePodsSearchResult } from '$lib/types';

	// Générique : découplé de PinePods pour être réutilisé par la source « Intégrée »
	// (recherche iTunes, sans serveur) — voir PodcastsPanel.svelte pour le câblage de chaque source.
	let {
		search,
		subscribe: doSubscribe,
		onSubscribed
	}: {
		search: (term: string) => Promise<PinePodsSearchResult[]>;
		subscribe: (result: PinePodsSearchResult) => Promise<void>;
		onSubscribed: () => void;
	} = $props();

	let term = $state('');
	let results = $state<PinePodsSearchResult[]>([]);
	let searching = $state(false);
	let subscribingFeed = $state<string | null>(null);
	let errorMessage = $state('');

	async function runSearch(e: SubmitEvent) {
		e.preventDefault();
		if (!term.trim()) return;
		searching = true;
		errorMessage = '';
		try {
			results = await search(term.trim());
			if (results.length === 0) errorMessage = 'Aucun résultat.';
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Recherche impossible.';
			results = [];
		} finally {
			searching = false;
		}
	}

	async function subscribe(result: PinePodsSearchResult) {
		subscribingFeed = result.feedurl;
		errorMessage = '';
		try {
			await doSubscribe(result);
			onSubscribed();
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : "Impossible de s'abonner.";
		} finally {
			subscribingFeed = null;
		}
	}
</script>

<form onsubmit={runSearch} class="search-form">
	<input class="pixel-input" type="search" placeholder="Rechercher un podcast…" bind:value={term} />
	<button type="submit" class="pixel-btn" disabled={searching}>{searching ? '…' : 'Rechercher'}</button>
</form>

{#if errorMessage}
	<p class="error">{errorMessage}</p>
{/if}

{#if results.length > 0}
	<ul class="results">
		{#each results as result (result.feedurl)}
			<li class="results__item">
				{#if result.artworkurl}
					<img src={result.artworkurl} alt="" width="48" height="48" />
				{:else}
					<div class="results__placeholder" aria-hidden="true"></div>
				{/if}
				<div class="results__body">
					<strong>{result.podcastname}</strong>
					<span>{result.author}</span>
				</div>
				<button
					type="button"
					class="pixel-btn"
					disabled={subscribingFeed === result.feedurl}
					onclick={() => subscribe(result)}
				>
					{subscribingFeed === result.feedurl ? '…' : "S'abonner"}
				</button>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.search-form {
		display: flex;
		gap: 0.5rem;
	}

	.error {
		color: var(--coral);
		font-size: 0.85rem;
	}

	.results {
		list-style: none;
		margin: 1rem 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.results__item {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		border: var(--border-w, 3px) solid var(--bezel);
		border-radius: var(--radius-control, 0);
		background: var(--plum-deep);
		padding: 0.5rem;
	}

	.results__item img,
	.results__placeholder {
		width: 48px;
		height: 48px;
		border: var(--border-w, 3px) solid var(--bezel);
		border-radius: var(--radius-control, 0);
		background: var(--metal-dark);
		object-fit: cover;
	}

	.results__body {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.results__body strong {
		color: var(--cream-bright);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.results__body span {
		font-size: 0.75rem;
		color: var(--muted);
	}
</style>
