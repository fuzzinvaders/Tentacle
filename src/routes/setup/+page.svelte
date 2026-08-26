<script lang="ts">
	import { enhance } from '$app/forms';
	import PixelPanel from '$lib/components/shared/PixelPanel.svelte';
	import PasswordInput from '$lib/components/shared/PasswordInput.svelte';
	import type { ActionData, PageData } from './$types';

	let { form, data }: { form: ActionData; data: PageData } = $props();
	let submitting = $state(false);
</script>

<div class="auth-wrap">
	<PixelPanel>
		<span class="label-tag">Première connexion</span>
		<h1>Créer l'administrateur</h1>
		<p class="lead">Aucun compte n'existe encore. Crée le compte administrateur de Tentacle.</p>

		<form
			method="POST"
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					await update();
					submitting = false;
				};
			}}
		>
			<label for="username">Identifiant</label>
			<input id="username" name="username" class="pixel-input" type="text" autocomplete="username" value={form?.username ?? ''} required />

			<label for="password">Mot de passe</label>
			<PasswordInput id="password" name="password" autocomplete="new-password" required />

			<label for="confirm">Confirmer le mot de passe</label>
			<PasswordInput id="confirm" name="confirm" autocomplete="new-password" required />

			{#if data.tokenRequired}
				<label for="setupToken">Jeton d'installation</label>
				<PasswordInput id="setupToken" name="setupToken" autocomplete="off" required />
			{/if}

			<button type="submit" class="pixel-btn" disabled={submitting}>
				{submitting ? 'Création…' : "Créer l'administrateur"}
			</button>
		</form>

		{#if form?.error}<p class="error">{form.error}</p>{/if}
	</PixelPanel>
</div>

<style>
	.auth-wrap {
		min-height: 100vh;
		display: grid;
		place-items: center;
		padding: 1.5rem;
	}

	.auth-wrap :global(.pixel-panel) {
		width: 100%;
		max-width: 26rem;
	}

	h1 {
		font-size: 1.8rem;
		margin: 0.6rem 0 0.3rem;
		color: var(--cream-bright);
		text-shadow: var(--title-shadow, 2px 2px 0 var(--bezel));
	}

	.lead {
		color: var(--muted);
		margin: 0 0 1rem;
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
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

	.error {
		color: var(--coral);
		margin: 0.75rem 0 0;
		font-size: 0.85rem;
	}
</style>
