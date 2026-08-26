<script lang="ts">
	import PixelPanel from '$lib/components/shared/PixelPanel.svelte';
	import SourceCard from '$lib/components/shared/SourceCard.svelte';
	import PasswordInput from '$lib/components/shared/PasswordInput.svelte';
	import { jellyfin } from '$lib/stores/jellyfin.svelte';
	import { authenticateByName, testConnection, JellyfinApiError } from '$lib/api/jellyfin';

	// embedded : rendu sans le panneau/carte propres (déjà fournis par la section repliable).
	let { embedded = false }: { embedded?: boolean } = $props();

	let serverUrl = $state('');
	let token = $state('');
	let userId = $state('');
	let username = $state('');
	let password = $state('');
	let submitting = $state(false);
	let errorMessage = $state('');

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		errorMessage = '';
		if (!serverUrl.trim()) {
			errorMessage = "L'URL du serveur Jellyfin est requise.";
			return;
		}

		submitting = true;
		try {
			if (token.trim()) {
				if (!userId.trim()) {
					errorMessage = "L'ID utilisateur Jellyfin est requis avec un token.";
					return;
				}
				const serverName = await testConnection(serverUrl.trim(), token.trim(), userId.trim());
				jellyfin.connect({ baseUrl: serverUrl.trim(), token: token.trim(), userId: userId.trim(), serverName });
				return;
			}

			if (username.trim() && password) {
				const result = await authenticateByName(serverUrl.trim(), username.trim(), password);
				jellyfin.connect({ baseUrl: serverUrl.trim(), token: result.token, userId: result.userId });
				return;
			}

			errorMessage = "Renseigne un token (+ ID utilisateur) ou un identifiant et un mot de passe.";
		} catch (err) {
			errorMessage = err instanceof JellyfinApiError ? err.message : 'Connexion à Jellyfin impossible.';
		} finally {
			submitting = false;
		}
	}
</script>

{#snippet body()}
	<form onsubmit={handleSubmit}>
		<label for="jf-url">URL du serveur</label>
		<input
			id="jf-url"
			class="pixel-input"
			type="url"
			placeholder="https://jellyfin.exemple.fr"
			bind:value={serverUrl}
		/>

		<label for="jf-token">Token d'accès</label>
		<PasswordInput id="jf-token" placeholder="Token (prioritaire)" bind:value={token} />

		<label for="jf-userid">ID utilisateur</label>
		<input
			id="jf-userid"
			class="pixel-input"
			type="text"
			placeholder="Requis avec le token"
			bind:value={userId}
		/>

		<p class="or-divider">Ou identifiant + mot de passe</p>

		<label for="jf-user">Identifiant</label>
		<input id="jf-user" class="pixel-input" type="text" bind:value={username} />

		<label for="jf-pass">Mot de passe</label>
		<PasswordInput id="jf-pass" bind:value={password} />

		<button type="submit" class="pixel-btn" disabled={submitting}>
			{submitting ? 'Connexion…' : 'Connecter'}
		</button>
	</form>

	{#if errorMessage}
		<p class="error">{errorMessage}</p>
	{:else}
		<p class="hint">Connecte-toi avec un token ou tes identifiants Jellyfin.</p>
	{/if}
{/snippet}

{#if embedded}
	{@render body()}
{:else}
	<PixelPanel>
		<SourceCard index={1} name="Jellyfin" accent="var(--gold-bright)" />
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

	.or-divider {
		text-align: center;
		font-size: 0.7rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--metal-mid);
		margin: 0.75rem 0 0.25rem;
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
