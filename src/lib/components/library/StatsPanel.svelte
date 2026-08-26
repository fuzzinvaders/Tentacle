<script lang="ts">
	import { listenbrainz } from '$lib/stores/listenbrainz.svelte';
	import { tablist } from '$lib/actions/tablist';
	import {
		getUserTopArtists,
		getUserTopRecordings,
		ListenBrainzApiError,
		type StatsRange,
		type ArtistStat,
		type RecordingStat
	} from '$lib/api/listenbrainz';

	const ranges: { id: StatsRange; label: string }[] = [
		{ id: 'week', label: 'Semaine' },
		{ id: 'month', label: 'Mois' },
		{ id: 'year', label: 'Année' },
		{ id: 'all_time', label: 'Tout' }
	];

	let range = $state<StatsRange>('month');
	let artists = $state<ArtistStat[]>([]);
	let recordings = $state<RecordingStat[]>([]);
	let loading = $state(false);
	let error = $state('');
	let loadedKey = '';

	async function load(r: StatsRange) {
		const conn = listenbrainz.connection;
		if (!conn) return;
		const key = `${conn.userName}:${r}`;
		if (key === loadedKey) return;
		loading = true;
		error = '';
		try {
			const [a, rec] = await Promise.all([
				getUserTopArtists(conn.userName, r),
				getUserTopRecordings(conn.userName, r)
			]);
			artists = a;
			recordings = rec;
			loadedKey = key;
		} catch (err) {
			error = err instanceof ListenBrainzApiError ? err.message : 'Statistiques indisponibles.';
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (listenbrainz.connected) load(range);
	});
</script>

{#if !listenbrainz.connected}
	<p class="stats-empty">Connecte ListenBrainz (Configuration) pour voir tes statistiques d'écoute.</p>
{:else}
	<div class="stats-ranges" role="tablist" aria-label="Période" use:tablist>
		{#each ranges as r (r.id)}
			<button
				type="button"
				class="range-btn"
				class:is-active={range === r.id}
				role="tab"
				aria-selected={range === r.id}
				tabindex={range === r.id ? 0 : -1}
				onclick={() => (range = r.id)}
			>
				{r.label}
			</button>
		{/each}
	</div>

	{#if error}
		<p class="stats-error">{error}</p>
	{:else if loading}
		<p class="stats-empty">Chargement des statistiques…</p>
	{:else if artists.length === 0 && recordings.length === 0}
		<p class="stats-empty">
			Aucune statistique pour cette période (ListenBrainz les calcule périodiquement).
		</p>
	{:else}
		<div class="stats-cols">
			<section>
				<h3 class="section-title">Artistes les plus écoutés</h3>
				{#if artists.length === 0}
					<p class="stats-empty">—</p>
				{:else}
					<ol class="stats-list">
						{#each artists as a, i (a.name + i)}
							<li>
								<span class="stats-rank">{i + 1}</span>
								<span class="stats-name">{a.name}</span>
								<span class="stats-count">{a.listenCount}</span>
							</li>
						{/each}
					</ol>
				{/if}
			</section>
			<section>
				<h3 class="section-title">Titres les plus écoutés</h3>
				{#if recordings.length === 0}
					<p class="stats-empty">—</p>
				{:else}
					<ol class="stats-list">
						{#each recordings as r, i (r.name + i)}
							<li>
								<span class="stats-rank">{i + 1}</span>
								<span class="stats-name">
									{r.name}<span class="stats-sub"> · {r.artist}</span>
								</span>
								<span class="stats-count">{r.listenCount}</span>
							</li>
						{/each}
					</ol>
				{/if}
			</section>
		</div>
	{/if}
{/if}

<style>
	.stats-ranges {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}

	.range-btn {
		font-family: var(--font-pixel);
		background: var(--plum-deep);
		border: 2px solid var(--bezel);
		border-radius: var(--radius-control, 0);
		color: var(--cream);
		padding: 0.35rem 0.75rem;
		cursor: pointer;
		font-size: 0.8rem;
	}

	.range-btn.is-active {
		background: var(--gold-bright);
		color: var(--ink);
	}

	.stats-cols {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
		gap: 1.5rem;
	}

	.section-title {
		margin-bottom: 0.6rem;
	}

	.stats-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.stats-list li {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		background: var(--plum-deep);
		border: 2px solid var(--bezel);
		border-radius: var(--radius-control, 0);
		padding: 0.4rem 0.6rem;
	}

	.stats-rank {
		width: 1.5rem;
		text-align: center;
		color: var(--gold-bright);
		font-size: 0.8rem;
		flex-shrink: 0;
	}

	.stats-name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 0.85rem;
	}

	.stats-sub {
		color: var(--muted);
		font-size: 0.75rem;
	}

	.stats-count {
		flex-shrink: 0;
		color: var(--teal);
		font-size: 0.8rem;
	}

	.stats-empty,
	.stats-error {
		color: var(--muted);
	}

	.stats-error {
		color: var(--coral);
	}
</style>
