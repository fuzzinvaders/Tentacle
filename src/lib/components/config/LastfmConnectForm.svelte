<script lang="ts">
	import PixelPanel from '$lib/components/shared/PixelPanel.svelte';
	import SourceCard from '$lib/components/shared/SourceCard.svelte';
	import PasswordInput from '$lib/components/shared/PasswordInput.svelte';
	import { lastfm } from '$lib/stores/lastfm.svelte';
	import { getToken, getAuthUrl, getSession, LastfmApiError } from '$lib/api/lastfm';

	// embedded : rendu sans le panneau/carte propres (déjà fournis par la section repliable).
	let { embedded = false }: { embedded?: boolean } = $props();

	let apiKey = $state('');
	let secret = $state('');
	// Étape intermédiaire (jeton obtenu, en attente d'autorisation sur last.fm) — pas encore
	// persistée : uniquement le temps de ce mini-flux, dans cet onglet.
	let pendingToken = $state('');
	let submitting = $state(false);
	let confirming = $state(false);
	let errorMessage = $state('');

	async function requestToken(e: SubmitEvent) {
		e.preventDefault();
		errorMessage = '';
		if (!apiKey.trim() || !secret.trim()) {
			errorMessage = 'Clé API et secret partagé requis (last.fm/api/account/create).';
			return;
		}
		submitting = true;
		try {
			const token = await getToken(apiKey.trim(), secret.trim());
			pendingToken = token;
			window.open(getAuthUrl(apiKey.trim(), token), '_blank', 'noopener');
		} catch (err) {
			errorMessage = err instanceof LastfmApiError ? err.message : 'Connexion à Last.fm impossible.';
		} finally {
			submitting = false;
		}
	}

	async function confirmAuthorization() {
		errorMessage = '';
		confirming = true;
		try {
			const { sessionKey, username } = await getSession(apiKey.trim(), secret.trim(), pendingToken);
			lastfm.connect({ apiKey: apiKey.trim(), secret: secret.trim(), sessionKey, username });
			pendingToken = '';
			apiKey = '';
			secret = '';
		} catch (err) {
			errorMessage =
				err instanceof LastfmApiError
					? err.message
					: "Autorisation refusée ou pas encore validée sur Last.fm.";
		} finally {
			confirming = false;
		}
	}

	function cancelPending() {
		pendingToken = '';
		errorMessage = '';
	}
</script>

{#snippet body()}
	{#if pendingToken}
		<p class="hint">
			Une fenêtre last.fm s'est ouverte : clique « Oui, autoriser », puis reviens ici et
			confirme.
		</p>
		<div class="actions">
			<button type="button" class="pixel-btn" disabled={confirming} onclick={confirmAuthorization}>
				{confirming ? 'Vérification…' : "J'ai autorisé → Confirmer"}
			</button>
			<button type="button" class="pixel-btn pixel-btn--ghost" onclick={cancelPending}>Annuler</button>
		</div>
	{:else}
		<form onsubmit={requestToken}>
			<label for="lastfm-key">Clé API</label>
			<input
				id="lastfm-key"
				type="text"
				class="pixel-input"
				placeholder="Clé API (last.fm/api/account/create)"
				bind:value={apiKey}
			/>

			<label for="lastfm-secret">Secret partagé</label>
			<PasswordInput id="lastfm-secret" placeholder="Secret partagé" bind:value={secret} />

			<button type="submit" class="pixel-btn" disabled={submitting}>
				{submitting ? 'Connexion…' : 'Connecter'}
			</button>
		</form>
	{/if}

	{#if errorMessage}
		<p class="error">{errorMessage}</p>
	{:else if !pendingToken}
		<p class="hint">
			Crée une clé API sur <strong>last.fm/api/account/create</strong> (gratuit), colle la clé et
			le secret ici. Scrobble en parallèle de ListenBrainz si les deux sont connectés.
		</p>
	{/if}
{/snippet}

{#if embedded}
	{@render body()}
{:else}
	<PixelPanel>
		<SourceCard index={3} name="Last.fm" accent="var(--coral)" />
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

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
	}
	.actions .pixel-btn {
		margin-top: 0;
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
