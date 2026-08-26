<script lang="ts">
	import { untrack, type Snippet } from 'svelte';

	let {
		title,
		subtitle = '',
		accent = 'var(--gold-bright)',
		badge = '',
		open = false,
		children
	}: {
		title: string;
		subtitle?: string;
		/** Couleur de l'accent (barre + puce), pour distinguer les sources. */
		accent?: string;
		/** Petit libellé d'état à droite (ex. « Connecté »). */
		badge?: string;
		/** Ouvert par défaut ? */
		open?: boolean;
		children: Snippet;
	} = $props();

	// `open` ne sert que d'état initial : ensuite c'est le clic de l'utilisateur qui décide.
	// untrack() capture la valeur d'ouverture sans créer de dépendance réactive au prop.
	let expanded = $state(untrack(() => open));
</script>

<section class="collapsible" class:is-open={expanded} style:--accent={accent}>
	<button
		type="button"
		class="collapsible__head"
		aria-expanded={expanded}
		onclick={() => (expanded = !expanded)}
	>
		<span class="collapsible__chevron" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
		<span class="collapsible__title">
			<strong>{title}</strong>
			{#if subtitle}<small>{subtitle}</small>{/if}
		</span>
		{#if badge}<span class="collapsible__badge">{badge}</span>{/if}
	</button>

	{#if expanded}
		<div class="collapsible__body">
			{@render children()}
		</div>
	{/if}
</section>

<style>
	.collapsible {
		background: var(--plum-deep);
		border: var(--border-w, 3px) solid var(--bezel);
		border-radius: var(--radius-control, 0);
		border-left: 4px solid var(--accent);
		overflow: hidden;
	}

	.collapsible__head {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.75rem 0.9rem;
		background: linear-gradient(180deg, var(--panel-hi), var(--panel-lo));
		border: none;
		cursor: pointer;
		font-family: var(--font-pixel);
		text-align: left;
		color: var(--cream);
	}

	.collapsible__chevron {
		color: var(--accent);
		font-size: 0.9rem;
		flex-shrink: 0;
	}

	.collapsible__title {
		display: flex;
		flex-direction: column;
		min-width: 0;
		flex: 1;
	}

	.collapsible__title strong {
		color: var(--cream-bright);
		text-transform: uppercase;
		font-size: 0.85rem;
		letter-spacing: 0.05em;
	}

	.collapsible__title small {
		color: var(--muted);
		font-size: 0.72rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.collapsible__badge {
		flex-shrink: 0;
		font-size: 0.66rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--ink);
		background: var(--accent);
		padding: 0.2rem 0.45rem;
		border-radius: var(--radius-control, 0);
	}

	.collapsible__body {
		padding: 0.9rem;
		border-top: 2px solid var(--bezel);
	}
</style>
