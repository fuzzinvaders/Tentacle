<script lang="ts">
	import type { RadioStation } from '$lib/types';
	import { player } from '$lib/stores/player.svelte';

	let {
		stations,
		onPlay,
		onRemove
	}: {
		stations: RadioStation[];
		onPlay: (station: RadioStation) => void;
		onRemove: (station: RadioStation) => void;
	} = $props();

	function isPlaying(station: RadioStation): boolean {
		return player.playing && player.current?.id === `radio-${station.id}`;
	}
</script>

{#if stations.length === 0}
	<p class="empty">
		Aucune radio enregistrée. Passe par l'onglet Recherche ou ajoute un flux manuellement.
	</p>
{:else}
	<ul class="stations">
		{#each stations as station (station.id)}
			<li class="stations__item" class:is-playing={isPlaying(station)}>
				{#if station.faviconUrl}
					<img src={station.faviconUrl} alt="" width="48" height="48" loading="lazy" />
				{:else}
					<div class="stations__placeholder" aria-hidden="true">⌁</div>
				{/if}
				<div class="stations__body">
					<strong>{station.name}</strong>
					<span>
						{#if station.country}{station.country}{/if}
						{#if station.country && station.tags}&nbsp;·&nbsp;{/if}
						{#if station.tags}{station.tags.split(',').slice(0, 3).join(', ')}{/if}
					</span>
				</div>
				<button
					type="button"
					class="pixel-btn"
					onclick={() => onPlay(station)}
					aria-label={`Écouter ${station.name}`}
				>
					{isPlaying(station) ? '⏸' : '▶'}
				</button>
				<button
					type="button"
					class="pixel-btn pixel-btn--ghost"
					onclick={() => onRemove(station)}
					aria-label={`Supprimer ${station.name}`}
				>
					✕
				</button>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.empty {
		color: var(--muted);
	}

	.stations {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.stations__item {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		border: var(--border-w, 3px) solid var(--bezel);
		border-radius: var(--radius-control, 0);
		background: var(--plum-deep);
		padding: 0.5rem;
	}

	.stations__item.is-playing {
		border-color: var(--gold-bright);
		box-shadow: 0 0 10px 0 var(--glow-faint);
	}

	.stations__item img,
	.stations__placeholder {
		width: 48px;
		height: 48px;
		border: var(--border-w, 3px) solid var(--bezel);
		border-radius: var(--radius-control, 0);
		background: var(--metal-dark);
		object-fit: cover;
		flex-shrink: 0;
	}

	.stations__placeholder {
		display: grid;
		place-items: center;
		color: var(--gold);
		font-size: 1.4rem;
	}

	.stations__body {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.stations__body strong {
		color: var(--cream-bright);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.stations__body span {
		font-size: 0.75rem;
		color: var(--muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
