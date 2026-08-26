<script lang="ts">
	import { settings, EQ_FREQUENCIES, EQ_GAIN_LIMIT } from '$lib/stores/settings.svelte';

	// Libellés courts des fréquences.
	const labels = EQ_FREQUENCIES.map((f) => (f >= 1000 ? `${f / 1000}k` : `${f}`));

	// Préréglages types (gains dB pour les bandes 60 / 230 / 910 / 3.6k / 14k Hz).
	const presets: { name: string; gains: number[] }[] = [
		{ name: 'Plat', gains: [0, 0, 0, 0, 0] },
		{ name: 'Grave +', gains: [6, 4, 1, 0, 0] },
		{ name: 'Loudness', gains: [5, 2, -1, 2, 5] },
		{ name: 'Voix / Podcast', gains: [-3, 0, 3, 4, 1] },
		{ name: 'Rock', gains: [4, 2, -1, 2, 4] },
		{ name: 'Acoustique', gains: [3, 1, 0, 2, 3] },
		{ name: 'Aigu +', gains: [0, 0, 1, 4, 6] },
		{ name: 'Nuit', gains: [-4, -2, 0, -1, -3] }
	];

	// Un préréglage est « actif » si les gains courants correspondent exactement.
	function isActive(gains: number[]): boolean {
		const b = bands();
		return gains.every((g, i) => g === b[i]);
	}

	function bands(): number[] {
		const b = settings.values.eqBands ?? [];
		return EQ_FREQUENCIES.map((_, i) => b[i] ?? 0);
	}

	function setBand(i: number, value: number) {
		const next = bands();
		next[i] = value;
		settings.set('eqBands', next);
	}

	function reset() {
		settings.set('eqBands', EQ_FREQUENCIES.map(() => 0));
	}
</script>

<label class="pref-row">
	<input
		type="checkbox"
		checked={settings.values.eqEnabled}
		onchange={(e) => settings.set('eqEnabled', e.currentTarget.checked)}
	/>
	Activer l'égaliseur (expérimental)
</label>
<p class="pref-hint">
	S'applique uniquement à Jellyfin et aux fichiers locaux (les radios et podcasts, servis sans
	CORS, gardent la lecture directe). Prend effet au titre suivant.
</p>

{#if settings.values.eqEnabled}
	<div class="eq-presets">
		{#each presets as p (p.name)}
			<button
				type="button"
				class="eq-preset"
				class:is-active={isActive(p.gains)}
				onclick={() => settings.set('eqBands', p.gains.slice())}
			>
				{p.name}
			</button>
		{/each}
	</div>
	<div class="eq">
		{#each EQ_FREQUENCIES as freq, i (freq)}
			{@const val = bands()[i]}
			<div class="eq__band">
				<span class="eq__gain">{val > 0 ? '+' : ''}{val}</span>
				<input
					class="eq__slider"
					type="range"
					min={-EQ_GAIN_LIMIT}
					max={EQ_GAIN_LIMIT}
					step="1"
					value={val}
					aria-label={`Bande ${labels[i]} Hz`}
					oninput={(e) => setBand(i, Number(e.currentTarget.value))}
				/>
				<span class="eq__freq">{labels[i]}</span>
			</div>
		{/each}
	</div>
	<button type="button" class="pixel-btn pixel-btn--ghost eq__reset" onclick={reset}>
		Réinitialiser
	</button>
{/if}

<style>
	.pref-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.6rem 0;
		font-size: 0.85rem;
		cursor: pointer;
	}

	.pref-row input[type='checkbox'] {
		width: 1.1rem;
		height: 1.1rem;
		accent-color: var(--gold-bright);
	}

	.pref-hint {
		margin: 0 0 0.75rem;
		color: var(--muted);
		font-size: 0.78rem;
	}

	.eq-presets {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-bottom: 0.5rem;
	}

	.eq-preset {
		font-family: var(--font-pixel);
		font-size: 0.72rem;
		background: var(--plum-deep);
		border: 2px solid var(--bezel);
		border-radius: var(--radius-control, 0);
		color: var(--cream);
		padding: 0.3rem 0.6rem;
		cursor: pointer;
	}

	.eq-preset:hover {
		background: var(--plum);
		color: var(--cream-bright);
	}

	.eq-preset.is-active {
		background: var(--gold-bright);
		color: var(--ink);
	}

	.eq {
		display: flex;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.5rem 0 0.75rem;
	}

	.eq__band {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.4rem;
		flex: 1;
	}

	.eq__gain {
		font-size: 0.7rem;
		color: var(--teal);
	}

	/* Curseurs verticaux. */
	.eq__slider {
		writing-mode: vertical-lr;
		direction: rtl;
		width: 1.2rem;
		height: 7rem;
		accent-color: var(--gold-bright);
		cursor: pointer;
	}

	.eq__freq {
		font-size: 0.68rem;
		color: var(--muted);
	}

	.eq__reset {
		font-size: 0.75rem;
	}
</style>
