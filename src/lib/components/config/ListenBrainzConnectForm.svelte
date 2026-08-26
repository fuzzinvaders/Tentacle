<script lang="ts">
	import PixelPanel from '$lib/components/shared/PixelPanel.svelte';
	import SourceCard from '$lib/components/shared/SourceCard.svelte';
	import PasswordInput from '$lib/components/shared/PasswordInput.svelte';
	import { listenbrainz } from '$lib/stores/listenbrainz.svelte';
	import { validateToken, ListenBrainzApiError } from '$lib/api/listenbrainz';

	// embedded : rendu sans le panneau/carte propres (déjà fournis par la section repliable).
	let { embedded = false }: { embedded?: boolean } = $props();

	let token = $state('');
	let submitting = $state(false);
	let errorMessage = $state('');

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		errorMessage = '';
		if (!token.trim()) {
			errorMessage = 'Le token ListenBrainz est requis.';
			return;
		}

		submitting = true;
		try {
			const result = await validateToken(token.trim());
			if (!result.valid || !result.userName) {
				errorMessage = 'Token refusé par ListenBrainz. Vérifie-le sur listenbrainz.org/profile.';
				return;
			}
			listenbrainz.connect({ token: token.trim(), userName: result.userName });
		} catch (err) {
			errorMessage = err instanceof ListenBrainzApiError ? err.message : 'Connexion à ListenBrainz impossible.';
		} finally {
			submitting = false;
		}
	}
</script>

{#snippet body()}
	<form onsubmit={handleSubmit}>
		<label for="lb-token">Token d'accès</label>
		<PasswordInput
			id="lb-token"
			placeholder="Token personnel (listenbrainz.org/profile)"
			bind:value={token}
		/>

		<button type="submit" class="pixel-btn" disabled={submitting}>
			{submitting ? 'Connexion…' : 'Connecter'}
		</button>
	</form>

	{#if errorMessage}
		<p class="error">{errorMessage}</p>
	{:else}
		<p class="hint">
			Récupère tes playlists et mixes de recommandation. Le token se trouve sur
			listenbrainz.org/profile.
		</p>
	{/if}
{/snippet}

{#if embedded}
	{@render body()}
{:else}
	<PixelPanel>
		<SourceCard index={3} name="ListenBrainz" accent="var(--teal)" />
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
