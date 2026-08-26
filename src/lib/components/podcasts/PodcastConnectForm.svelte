<script lang="ts">
	import PixelPanel from '$lib/components/shared/PixelPanel.svelte';
	import SourceCard from '$lib/components/shared/SourceCard.svelte';
	import PasswordInput from '$lib/components/shared/PasswordInput.svelte';
	import { pinepods } from '$lib/stores/pinepods.svelte';
	import { getApiKey, getUserId, PinePodsApiError } from '$lib/api/pinepods';

	// embedded : rendu sans le panneau/carte propres (déjà fournis par la section repliable).
	let { embedded = false }: { embedded?: boolean } = $props();

	let serverUrl = $state('');
	let apiKey = $state('');
	let userIdInput = $state('');
	let username = $state('');
	let password = $state('');
	let submitting = $state(false);
	let errorMessage = $state('');

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		errorMessage = '';
		if (!serverUrl.trim()) {
			errorMessage = "L'URL du serveur PinePods est requise.";
			return;
		}

		submitting = true;
		try {
			if (apiKey.trim()) {
				const manualUserId = Number(userIdInput);
				const userId = manualUserId ? manualUserId : await getUserId(serverUrl.trim(), apiKey.trim());
				pinepods.connect({ baseUrl: serverUrl.trim(), apiKey: apiKey.trim(), userId });
				return;
			}

			if (username.trim() && password) {
				const result = await getApiKey(serverUrl.trim(), username.trim(), password);
				if (result.status === 'mfa_required') {
					errorMessage =
						"Ce compte a la double authentification activée. La 2FA n'est pas encore gérée par ce formulaire — génère une clé API depuis PinePods (Paramètres → Clés API) et connecte-toi avec le token à la place.";
					return;
				}
				pinepods.connect({ baseUrl: serverUrl.trim(), apiKey: result.apiKey, userId: result.userId });
				return;
			}

			errorMessage = "Renseigne un token d'accès (+ ID utilisateur) ou un identifiant et un mot de passe.";
		} catch (err) {
			errorMessage = err instanceof PinePodsApiError ? err.message : 'Connexion à PinePods impossible.';
		} finally {
			submitting = false;
		}
	}
</script>

{#snippet body()}
	<form onsubmit={handleSubmit}>
		<label for="pp-url">URL du serveur</label>
		<input
			id="pp-url"
			class="pixel-input"
			type="url"
			placeholder="https://pinepods.exemple.fr"
			bind:value={serverUrl}
		/>

		<label for="pp-token">Token d'accès</label>
		<PasswordInput id="pp-token" placeholder="Api-Key (prioritaire)" bind:value={apiKey} />

		<label for="pp-userid">ID utilisateur (optionnel)</label>
		<input
			id="pp-userid"
			class="pixel-input"
			type="text"
			inputmode="numeric"
			placeholder="Déduit automatiquement du token si vide"
			bind:value={userIdInput}
		/>

		<p class="or-divider">Ou identifiant + mot de passe</p>

		<label for="pp-user">Identifiant</label>
		<input id="pp-user" class="pixel-input" type="text" bind:value={username} />

		<label for="pp-pass">Mot de passe</label>
		<PasswordInput id="pp-pass" bind:value={password} />

		<button type="submit" class="pixel-btn" disabled={submitting}>
			{submitting ? 'Connexion…' : 'Connecter'}
		</button>
	</form>

	{#if errorMessage}
		<p class="error">{errorMessage}</p>
	{:else}
		<p class="hint">Connecte-toi avec un token PinePods ou tes identifiants.</p>
	{/if}
{/snippet}

{#if embedded}
	{@render body()}
{:else}
	<PixelPanel>
		<SourceCard index={2} name="PinePods" accent="var(--teal)" />
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
