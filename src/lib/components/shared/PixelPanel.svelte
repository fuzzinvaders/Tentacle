<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		sunken = false,
		children
	}: {
		sunken?: boolean;
		children: Snippet;
	} = $props();
</script>

<div class="pixel-panel" class:pixel-panel--sunken={sunken}>
	{@render children()}
</div>
