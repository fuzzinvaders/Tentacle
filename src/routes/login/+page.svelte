<script lang="ts">
	import { enhance } from '$app/forms';
	import PixelPanel from '$lib/components/shared/PixelPanel.svelte';
	import PasswordInput from '$lib/components/shared/PasswordInput.svelte';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
	let submitting = $state(false);
</script>

<div class="auth-wrap">
	<PixelPanel>
		<span class="label-tag">Tentacle</span>
		<h1>Connexion</h1>

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
			<PasswordInput id="password" name="password" autocomplete="current-password" required />

			<button type="submit" class="pixel-btn" disabled={submitting}>
				{submitting ? 'Connexion…' : 'Se connecter'}
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
		max-width: 24rem;
	}

	h1 {
		font-size: 1.8rem;
		margin: 0.6rem 0 0.6rem;
		color: var(--cream-bright);
		text-shadow: var(--title-shadow, 2px 2px 0 var(--bezel));
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
