<script lang="ts">
	import { podcastSkips } from '$lib/stores/podcastSkips.svelte';

	let { podcastId }: { podcastId: number } = $props();

	// Saut mémorisé pour cet abonnement (0/0 par défaut = désactivé).
	const skip = $derived(podcastSkips.get(podcastId) ?? { intro: 0, outro: 0 });

	function setIntro(e: Event) {
		const v = Number((e.currentTarget as HTMLInputElement).value);
		podcastSkips.set(podcastId, { intro: v, outro: skip.outro });
	}
	function setOutro(e: Event) {
		const v = Number((e.currentTarget as HTMLInputElement).value);
		podcastSkips.set(podcastId, { intro: skip.intro, outro: v });
	}
</script>

<div class="skip">
	<span class="skip__label">⏱ Sauts (tous les épisodes de ce podcast)</span>
	<div class="skip__fields">
		<label class="skip__field">
			Intro
			<input
				type="number"
				min="0"
				step="5"
				class="pixel-input"
				value={skip.intro}
				oninput={setIntro}
				aria-label="Secondes d'intro à sauter"
			/>
			s
		</label>
		<label class="skip__field">
			Outro
			<input
				type="number"
				min="0"
				step="5"
				class="pixel-input"
				value={skip.outro}
				oninput={setOutro}
				aria-label="Secondes avant la fin à considérer comme lu"
			/>
			s
		</label>
	</div>
	<p class="skip__hint">
		Démarre à +{skip.intro || 0} s (générique/annonces) et considère l'épisode lu à
		{skip.outro || 0} s de la fin (outro/pub). 0 = désactivé.
	</p>
</div>

<style>
	.skip {
		border: var(--border-w, 3px) solid var(--bezel);
		border-radius: var(--radius-control, 0);
		background: var(--plum-deep);
		padding: 0.6rem 0.75rem;
		margin-bottom: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.skip__label {
		font-size: 0.78rem;
		color: var(--gold-bright);
	}
	.skip__fields {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
	}
	.skip__field {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.78rem;
		color: var(--cream);
	}
	.skip__field .pixel-input {
		width: 4.5rem;
		text-align: right;
	}
	.skip__hint {
		margin: 0;
		font-size: 0.72rem;
		color: var(--muted);
	}
</style>
