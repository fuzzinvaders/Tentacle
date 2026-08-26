<script lang="ts">
	import PixelPanel from '$lib/components/shared/PixelPanel.svelte';

	let {
		title,
		tagline
	}: {
		title: string;
		tagline: string;
	} = $props();
</script>

<PixelPanel>
	<span class="label-tag">Bientôt</span>
	<h3>{title}</h3>
	<p>{tagline}</p>
</PixelPanel>

<PixelPanel sunken>
	<span class="label-tag">Module en construction</span>
	<h3>{title}</h3>
	<p>Cette section possède déjà sa navigation, sa palette et son cadre de contenu.</p>
</PixelPanel>

<style>
	h3 {
		margin: 0.75rem 0 0.5rem;
	}

	p {
		color: var(--muted);
		margin: 0;
	}
</style>
