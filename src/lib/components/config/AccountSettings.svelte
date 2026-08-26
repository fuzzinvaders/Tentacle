<script lang="ts">
	import PixelPanel from '$lib/components/shared/PixelPanel.svelte';
	import PasswordInput from '$lib/components/shared/PasswordInput.svelte';
	import { page } from '$app/state';

	let currentPassword = $state('');
	let newPassword = $state('');
	let confirmPassword = $state('');
	let submitting = $state(false);
	let error = $state('');
	let success = $state(false);

	async function changePassword(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		success = false;
		const userId = page.data.user?.id;
		if (!userId) return;

		if (newPassword !== confirmPassword) {
			error = 'Les nouveaux mots de passe ne correspondent pas.';
			return;
		}

		submitting = true;
		try {
			const res = await fetch(`/api/users/${userId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ currentPassword, newPassword })
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				error = body.message || 'Changement de mot de passe impossible.';
				return;
			}
			currentPassword = '';
			newPassword = '';
			confirmPassword = '';
			success = true;
		} catch {
			error = 'Changement de mot de passe impossible.';
		} finally {
			submitting = false;
		}
	}
</script>

<PixelPanel>
	<h3>Mon compte</h3>
	<p class="hint">
		Connecté en tant que <strong>{page.data.user?.username}</strong>{#if page.data.user?.isAdmin}
			<span class="badge">admin</span>{/if}
	</p>

	<form onsubmit={changePassword}>
		<label for="current-password">Mot de passe actuel</label>
		<PasswordInput
			id="current-password"
			autocomplete="current-password"
			bind:value={currentPassword}
			required
		/>

		<label for="new-password">Nouveau mot de passe</label>
		<PasswordInput id="new-password" autocomplete="new-password" bind:value={newPassword} required />

		<label for="confirm-password">Confirmer le nouveau mot de passe</label>
		<PasswordInput
			id="confirm-password"
			autocomplete="new-password"
			bind:value={confirmPassword}
			required
		/>

		<button type="submit" class="pixel-btn" disabled={submitting}>
			{submitting ? 'Changement…' : 'Changer le mot de passe'}
		</button>
	</form>

	{#if error}
		<p class="error">{error}</p>
	{:else if success}
		<p class="success">Mot de passe changé.</p>
	{/if}
</PixelPanel>

<style>
	h3 {
		margin-bottom: 0.5rem;
	}

	.hint {
		color: var(--muted);
		margin: 0 0 1rem;
	}

	.badge {
		font-size: 0.62rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--ink);
		background: var(--gold-bright);
		border: 2px solid var(--bezel);
		border-radius: var(--radius-chip, 0);
		padding: 0.05rem 0.35rem;
		margin-left: 0.4rem;
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		max-width: 24rem;
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
		align-self: flex-start;
	}

	.error {
		color: var(--coral);
		margin: 0.75rem 0 0;
		font-size: 0.85rem;
	}

	.success {
		color: var(--teal);
		margin: 0.75rem 0 0;
		font-size: 0.85rem;
	}
</style>
