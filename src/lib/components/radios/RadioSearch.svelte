<script lang="ts">
	import type { RadioBrowserStation, RadioStation } from '$lib/types';
	import { searchStations } from '$lib/api/radioBrowser';
	import { ApiError } from '$lib/http';
	import { radios } from '$lib/stores/radios.svelte';

	let { onPlay }: { onPlay: (station: RadioStation) => void } = $props();

	let term = $state('');
	let results = $state<RadioBrowserStation[]>([]);
	let searching = $state(false);
	let searched = $state(false);
	let errorMessage = $state('');

	function toStation(r: RadioBrowserStation): RadioStation {
		return {
			id: r.stationuuid,
			name: r.name,
			streamUrl: r.url_resolved || r.url,
			faviconUrl: r.favicon || undefined,
			homepage: r.homepage || undefined,
			country: r.country || undefined,
			tags: r.tags || undefined,
			stationUuid: r.stationuuid
		};
	}

	async function runSearch(e: SubmitEvent) {
		e.preventDefault();
		if (!term.trim()) return;
		searching = true;
		errorMessage = '';
		try {
			results = await searchStations(term.trim());
			searched = true;
		} catch (err) {
			errorMessage = err instanceof ApiError ? err.message : 'Recherche impossible.';
			results = [];
		} finally {
			searching = false;
		}
	}

	function describe(r: RadioBrowserStation): string {
		const parts = [r.country, r.tags?.split(',').slice(0, 3).join(', ')].filter(Boolean);
		const tech = [r.codec, r.bitrate ? `${r.bitrate} kbps` : ''].filter(Boolean).join(' ');
		if (tech) parts.push(tech);
		return parts.join(' · ');
	}
</script>

<form onsubmit={runSearch} class="search-form">
	<input
		class="pixel-input"
		type="search"
		placeholder="Rechercher une station (ex. FIP, BBC, jazz…)"
		bind:value={term}
	/>
	<button type="submit" class="pixel-btn" disabled={searching}>{searching ? '…' : 'Rechercher'}</button>
</form>
<p class="hint">Annuaire communautaire Radio Browser — pas besoin de connaître l'URL du flux.</p>

{#if errorMessage}
	<p class="error">{errorMessage}</p>
{/if}

{#if results.length > 0}
	<ul class="results">
		{#each results as result (result.stationuuid)}
			{@const saved = radios.has(result.url_resolved || result.url)}
			<li class="results__item">
				{#if result.favicon}
					<img src={result.favicon} alt="" width="48" height="48" loading="lazy" />
				{:else}
					<div class="results__placeholder" aria-hidden="true">⌁</div>
				{/if}
				<div class="results__body">
					<strong>{result.name}</strong>
					<span>{describe(result)}</span>
				</div>
				<button
					type="button"
					class="pixel-btn"
					onclick={() => onPlay(toStation(result))}
					aria-label={`Écouter ${result.name}`}
				>
					▶
				</button>
				<button
					type="button"
					class="pixel-btn pixel-btn--ghost"
					disabled={saved}
					onclick={() => radios.add(toStation(result))}
				>
					{saved ? 'Ajoutée' : '+ Ajouter'}
				</button>
			</li>
		{/each}
	</ul>
{:else if searched && !searching}
	<p class="empty">Aucune station trouvée pour cette recherche.</p>
{/if}

<style>
	.search-form {
		display: flex;
		gap: 0.5rem;
	}

	.search-form input {
		flex: 1;
		max-width: 28rem;
	}

	.hint {
		color: var(--muted);
		font-size: 0.78rem;
		margin: 0.4rem 0 0;
	}

	.error {
		color: var(--coral);
		font-size: 0.85rem;
	}

	.empty {
		color: var(--muted);
		margin-top: 1rem;
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
		border: 3px solid var(--bezel);
		background: var(--plum-deep);
		padding: 0.5rem;
	}

	.results__item img,
	.results__placeholder {
		width: 48px;
		height: 48px;
		border: 3px solid var(--bezel);
		background: var(--metal-dark);
		object-fit: cover;
		flex-shrink: 0;
	}

	.results__placeholder {
		display: grid;
		place-items: center;
		color: var(--gold);
		font-size: 1.4rem;
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
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
