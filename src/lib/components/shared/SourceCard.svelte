<script lang="ts">
	let {
		index,
		name,
		accent = 'var(--gold-bright)'
	}: {
		index: number;
		name: string;
		accent?: string;
	} = $props();
</script>

<div class="source-card">
	<div class="source-card__tile" style:--accent={accent}>
		<span aria-hidden="true">{String(index).padStart(2, '0')}</span>
	</div>
	<div class="source-card__label">
		<span class="label-tag">Source {String(index).padStart(2, '0')}</span>
		<strong>{name}</strong>
	</div>
</div>

<style>
	.source-card {
		display: flex;
		align-items: center;
		gap: 0.85rem;
		border: var(--border-w, 3px) solid var(--bezel);
		border-radius: var(--radius-control, 0);
		background: var(--plum-deep);
		padding: 0.65rem 0.9rem;
		box-shadow:
			0 4px 0 0 inset rgba(0, 0, 0, 0.35),
			0 -1px 0 0 inset rgba(255, 255, 255, 0.04);
	}

	.source-card__tile {
		display: grid;
		place-items: center;
		width: 2.6rem;
		height: 2.6rem;
		flex-shrink: 0;
		background: linear-gradient(180deg, var(--accent), var(--rust));
		border: var(--border-w, 3px) solid var(--bezel);
		border-radius: var(--radius-control, 0);
		box-shadow:
			0 -4px 0 0 inset rgba(0, 0, 0, 0.3),
			0 2px 0 0 inset rgba(255, 255, 255, 0.3),
			0 0 10px 0 var(--glow-faint);
		color: var(--ink);
		font-weight: 700;
		text-shadow: 0 1px 0 rgba(255, 255, 255, 0.35);
	}

	.source-card__label {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.source-card__label strong {
		color: var(--cream-bright);
		letter-spacing: 0.08em;
		text-shadow: 1px 1px 0 var(--bezel);
	}
</style>
