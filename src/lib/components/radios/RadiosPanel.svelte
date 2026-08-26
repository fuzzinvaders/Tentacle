<script lang="ts">
	import PixelPanel from '$lib/components/shared/PixelPanel.svelte';
	import RadioStationList from '$lib/components/radios/RadioStationList.svelte';
	import RadioSearch from '$lib/components/radios/RadioSearch.svelte';
	import RadioAddForm from '$lib/components/radios/RadioAddForm.svelte';
	import { radios } from '$lib/stores/radios.svelte';
	import { player } from '$lib/stores/player.svelte';
	import { reportStationClick } from '$lib/api/radioBrowser';
	import { stationToTrack } from '$lib/radioTrack';
	import { tablist } from '$lib/actions/tablist';
	import type { RadioStation } from '$lib/types';

	type RadiosSubTab = 'stations' | 'recherche' | 'ajouter';

	let subTab = $state<RadiosSubTab>('stations');

	const subTabs: { id: RadiosSubTab; label: string; accent: string }[] = [
		{ id: 'stations', label: 'Mes radios', accent: 'var(--gold)' },
		{ id: 'recherche', label: 'Recherche', accent: 'var(--teal)' },
		{ id: 'ajouter', label: 'Ajouter un flux', accent: 'var(--coral)' }
	];

	function play(station: RadioStation) {
		const track = stationToTrack(station);
		// Re-cliquer sur la station en cours = pause/reprise plutôt que recharger le flux.
		if (player.current?.id === track.id) {
			player.togglePlay();
			return;
		}
		player.playNow(track);
		if (station.stationUuid) reportStationClick(station.stationUuid);
	}
</script>

<PixelPanel>
	<div class="radios-toolbar">
		<div class="radios-subnav" role="tablist" aria-label="Sections des radios" use:tablist>
			{#each subTabs as tab (tab.id)}
				<button
					type="button"
					class="category-btn"
					style:--accent={tab.accent}
					role="tab"
					aria-selected={subTab === tab.id}
					tabindex={subTab === tab.id ? 0 : -1}
					class:is-active={subTab === tab.id}
					onclick={() => (subTab = tab.id)}
				>
					{tab.label}
				</button>
			{/each}
		</div>
	</div>

	{#if subTab === 'stations'}
		<RadioStationList stations={radios.stations} onPlay={play} onRemove={(s) => radios.remove(s.id)} />
	{:else if subTab === 'recherche'}
		<RadioSearch onPlay={play} />
	{:else}
		<RadioAddForm onAdd={(s) => radios.add(s)} />
	{/if}
</PixelPanel>

<style>
	.radios-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin-bottom: 1rem;
	}

	.radios-subnav {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
	}
</style>
