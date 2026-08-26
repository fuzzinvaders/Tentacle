<script lang="ts">
	import PixelPanel from '$lib/components/shared/PixelPanel.svelte';
	import SourceCard from '$lib/components/shared/SourceCard.svelte';
	import PasswordInput from '$lib/components/shared/PasswordInput.svelte';
	import { lidarr } from '$lib/stores/lidarr.svelte';
	import { testConnection, LidarrApiError } from '$lib/api/lidarr';

	// embedded : rendu sans le panneau/carte propres (déjà fournis par la section repliable).
	let { embedded = false }: { embedded?: boolean } = $props();

	let serverUrl = $state('');
	let apiKey = $state('');
	let submitting = $state(false);
	let errorMessage = $state('');

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		errorMessage = '';
		if (!serverUrl.trim() || !apiKey.trim()) {
			errorMessage = "L'URL du serveur Lidarr et la clé API sont requises.";
			return;
		}

		submitting = true;
		try {
			await testConnection({ baseUrl: serverUrl.trim(), apiKey: apiKey.trim() });
			lidarr.connect({ baseUrl: serverUrl.trim(), apiKey: apiKey.trim() });
		} catch (err) {
			errorMessage = err instanceof LidarrApiError ? err.message : 'Connexion à Lidarr impossible.';
		} finally {
			submitting = false;
		}
	}
</script>

{#snippet body()}
	<form onsubmit={handleSubmit}>
		<label for="ld-url">URL du serveur</label>
		<input
			id="ld-url"
			class="pixel-input"
			type="url"
			placeholder="https://lidarr.exemple.fr"
			bind:value={serverUrl}
		/>

		<label for="ld-key">Clé API</label>
		<PasswordInput id="ld-key" placeholder="Paramètres → Général → Clé API" bind:value={apiKey} />

		<button type="submit" class="pixel-btn" disabled={submitting}>
			{submitting ? 'Connexion…' : 'Connecter'}
		</button>
	</form>

	{#if errorMessage}
		<p class="error">{errorMessage}</p>
	{:else}
		<p class="hint">
			Optionnel : permet de demander à Lidarr les albums manquants des playlists ListenBrainz.
		</p>
	{/if}
{/snippet}

{#if embedded}
	{@render body()}
{:else}
	<PixelPanel>
		<SourceCard index={4} name="Lidarr" accent="var(--gold)" />
		<h3>Relier la connexion</h3>
		{@render body()}
	</PixelPanel>
{/if}

<style>
	h3 {
		margin: 0.75rem 0 0.5rem;
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	label {
		font-size: 0.75rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--muted);
		margin-top: 0.4rem;
	}

	button {
		margin-top: 1rem;
	}

	.hint,
	.error {
		font-size: 0.8rem;
		margin: 0.75rem 0 0;
	}

	.hint {
		color: var(--muted);
	}

	.error {
		color: var(--coral);
	}
</style>
