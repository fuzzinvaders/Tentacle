<script lang="ts">
	import { contextTrigger } from '$lib/actions/contextTrigger';
	import type { ContextMenuItem } from '$lib/stores/contextMenu.svelte';

	type GridItem = {
		id: string;
		title: string;
		subtitle?: string;
		imageUrl?: string;
		round?: boolean;
	};

	let {
		items,
		onSelect,
		emptyMessage = 'Rien à afficher.',
		menuFor,
		badgeFor
	}: {
		items: GridItem[];
		onSelect: (id: string) => void;
		emptyMessage?: string;
		/** Actions du menu contextuel (clic droit / appui long) pour une carte. */
		menuFor?: (id: string) => { items: ContextMenuItem[]; title?: string };
		/** Affiche un badge « téléchargé » (⭳) sur la carte si vrai. */
		badgeFor?: (id: string) => boolean;
	} = $props();

	const noMenu = { items: [] as ContextMenuItem[] };
</script>

{#if items.length === 0}
	<p class="empty">{emptyMessage}</p>
{:else}
	<ul class="grid">
		{#each items as item (item.id)}
			<li use:contextTrigger={() => (menuFor ? menuFor(item.id) : noMenu)}>
				<button type="button" class="card" onclick={() => onSelect(item.id)}>
					<span class="card__art-wrap">
						{#if item.imageUrl}
							<img class="card__art" class:is-round={item.round} src={item.imageUrl} alt="" loading="lazy" />
						{:else}
							<div class="card__art card__art--placeholder" class:is-round={item.round} aria-hidden="true">♪</div>
						{/if}
						{#if badgeFor?.(item.id)}
							<span class="card__badge" title="Disponible hors-ligne" aria-label="Disponible hors-ligne">⭳</span>
						{/if}
					</span>
					<span class="card__title">{item.title}</span>
					{#if item.subtitle}
						<span class="card__subtitle">{item.subtitle}</span>
					{/if}
				</button>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.empty {
		color: var(--muted);
	}

	.grid {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
		gap: 0.9rem;
	}

	.card {
		font-family: var(--font-pixel);
		width: 100%;
		background: var(--plum-deep);
		border: var(--border-w, 3px) solid var(--bezel);
		border-radius: var(--radius-control, 0);
		color: var(--cream);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.4rem;
		padding: 0.7rem;
		cursor: pointer;
		box-shadow: var(--card-shadow, 0 -4px 0 0 inset var(--shadow));
	}

	.card:hover {
		color: var(--cream-bright);
		box-shadow: var(--card-shadow-hover, 0 -4px 0 0 inset var(--shadow), 0 0 12px 0 var(--glow-faint));
	}

	.card:active {
		transform: translate(1px, 2px);
	}

	.card__art-wrap {
		position: relative;
		width: 100%;
		display: block;
	}

	.card__badge {
		position: absolute;
		top: 4px;
		right: 4px;
		display: grid;
		place-items: center;
		min-width: 1.4rem;
		height: 1.4rem;
		padding: 0 0.2rem;
		font-size: 0.8rem;
		color: var(--ink);
		background: var(--teal);
		border: 2px solid var(--bezel);
		border-radius: var(--radius-chip, 0);
	}

	.card__art {
		width: 100%;
		aspect-ratio: 1 / 1;
		object-fit: cover;
		border: var(--border-w, 3px) solid var(--bezel);
		border-radius: var(--radius-control, 0);
		background: var(--metal-dark);
		image-rendering: auto;
	}

	.card__art.is-round {
		border-radius: 50%;
	}

	.card__art--placeholder {
		display: grid;
		place-items: center;
		font-size: 2rem;
		color: var(--metal-mid);
	}

	.card__title {
		font-size: 0.82rem;
		text-align: center;
		color: var(--cream-bright);
		overflow: hidden;
		text-overflow: ellipsis;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
	}

	.card__subtitle {
		font-size: 0.7rem;
		color: var(--muted);
		text-align: center;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 100%;
	}
</style>
