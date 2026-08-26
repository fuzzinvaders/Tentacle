<script lang="ts">
	import { ui } from '$lib/stores/ui.svelte';
	import { settings } from '$lib/stores/settings.svelte';
	import PodcastsPanel from '$lib/components/podcasts/PodcastsPanel.svelte';
	import RadiosPanel from '$lib/components/radios/RadiosPanel.svelte';
	import ConfigPanel from '$lib/components/config/ConfigPanel.svelte';
	import LibraryPanel from '$lib/components/library/LibraryPanel.svelte';
	import HomePanel from '$lib/components/home/HomePanel.svelte';
</script>

{#if ui.activeSpace === 'home'}
	<section>
		<span class="label-tag">Espace Accueil</span>
		<h2>Accueil</h2>
		<p class="lead">Reprendre, favoris, nouveautés et découvertes — toutes sources.</p>
		<HomePanel />
	</section>
{:else if ui.activeSpace === 'library'}
	<section>
		<span class="label-tag">Espace Library</span>
		<h2>Bibliothèque</h2>
		<p class="lead">Albums, artistes et favoris Jellyfin.</p>
		<LibraryPanel />
	</section>
{:else if ui.activeSpace === 'radios'}
	<section>
		<span class="label-tag">Espace Radios</span>
		<h2>Radios</h2>
		<p class="lead">Stations en direct et favorites.</p>
		<RadiosPanel />
	</section>
{:else if ui.activeSpace === 'podcasts'}
	<section>
		<span class="label-tag">Espace Podcasts</span>
		<h2>Podcasts</h2>
		<p class="lead">
			Émissions suivies et épisodes récents, via {settings.values.podcastSource === 'local'
				? 'les flux RSS intégrés'
				: 'PinePods'}.
		</p>
		<PodcastsPanel />
	</section>
{:else}
	<section>
		<span class="label-tag">Espace Configuration</span>
		<h2>Configuration</h2>
		<p class="lead">Connexions aux sources et préférences.</p>
		<ConfigPanel />
	</section>
{/if}

<style>
	section {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	h2 {
		font-size: 2.25rem;
	}

	.lead {
		color: var(--muted);
		margin: 0 0 0.5rem;
	}

	@media (max-width: 600px) {
		section {
			gap: 0.35rem;
		}

		h2 {
			font-size: 1.5rem;
		}

		.lead {
			font-size: 0.85rem;
			margin: 0 0 0.25rem;
		}
	}
</style>
