<script lang="ts">
	import PixelPanel from '$lib/components/shared/PixelPanel.svelte';
	import SourceCard from '$lib/components/shared/SourceCard.svelte';
	import PasswordInput from '$lib/components/shared/PasswordInput.svelte';
	import { page } from '$app/state';

	type ManagedUser = { id: string; username: string; isAdmin: boolean; createdAt: string };

	let users = $state<ManagedUser[]>([]);
	let loading = $state(true);
	let error = $state('');

	let newUsername = $state('');
	let newPassword = $state('');
	let newIsAdmin = $state(false);
	let submitting = $state(false);

	const currentUserId = $derived(page.data.user?.id);

	async function refresh() {
		loading = true;
		error = '';
		try {
			const res = await fetch('/api/users');
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			users = (await res.json()).users;
		} catch (err) {
			error = 'Impossible de charger les utilisateurs.';
		} finally {
			loading = false;
		}
	}

	async function addUser(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		submitting = true;
		try {
			const res = await fetch('/api/users', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ username: newUsername, password: newPassword, isAdmin: newIsAdmin })
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				error = body.message || "Création de l'utilisateur impossible.";
				return;
			}
			newUsername = '';
			newPassword = '';
			newIsAdmin = false;
			await refresh();
		} catch {
			error = "Création de l'utilisateur impossible.";
		} finally {
			submitting = false;
		}
	}

	async function removeUser(u: ManagedUser) {
		if (!confirm(`Supprimer l'utilisateur « ${u.username} » ?`)) return;
		error = '';
		try {
			const res = await fetch(`/api/users/${u.id}`, { method: 'DELETE' });
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				error = body.message || 'Suppression impossible.';
				return;
			}
			await refresh();
		} catch {
			error = 'Suppression impossible.';
		}
	}

	async function resetPassword(u: ManagedUser) {
		const newPassword = prompt(`Nouveau mot de passe pour « ${u.username} » (6 caractères min.) :`);
		if (!newPassword) return;
		error = '';
		try {
			const res = await fetch(`/api/users/${u.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ newPassword })
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				error = body.message || 'Réinitialisation impossible.';
				return;
			}
			alert(`Mot de passe de « ${u.username} » réinitialisé.`);
		} catch {
			error = 'Réinitialisation impossible.';
		}
	}

	$effect(() => {
		refresh();
	});
</script>

<PixelPanel>
	<SourceCard index={5} name="Utilisateurs" accent="var(--coral)" />

	{#if loading}
		<p class="muted">Chargement…</p>
	{:else}
		<ul class="user-list">
			{#each users as u (u.id)}
				<li class="user-row">
					<span class="user-row__name">
						{u.username}
						{#if u.isAdmin}<span class="badge">admin</span>{/if}
						{#if u.id === currentUserId}<span class="badge badge--you">vous</span>{/if}
					</span>
					<div class="user-row__actions">
						<button
							type="button"
							class="pixel-btn pixel-btn--ghost user-row__reset"
							disabled={u.id === currentUserId}
							title={u.id === currentUserId ? 'Utilise « Mon compte » pour changer ton propre mot de passe' : 'Réinitialiser le mot de passe'}
							onclick={() => resetPassword(u)}
						>
							Nouveau mot de passe
						</button>
						<button
							type="button"
							class="pixel-btn pixel-btn--danger user-row__del"
							disabled={u.id === currentUserId}
							title={u.id === currentUserId ? 'Vous ne pouvez pas supprimer votre propre compte' : 'Supprimer'}
							onclick={() => removeUser(u)}
						>
							Supprimer
						</button>
					</div>
				</li>
			{/each}
		</ul>

		<form class="add-form" onsubmit={addUser}>
			<h4>Ajouter un utilisateur</h4>
			<div class="add-form__row">
				<input class="pixel-input" type="text" placeholder="Identifiant" bind:value={newUsername} autocomplete="off" required />
				<PasswordInput placeholder="Mot de passe" bind:value={newPassword} autocomplete="new-password" required />
			</div>
			<label class="add-form__admin">
				<input type="checkbox" bind:checked={newIsAdmin} />
				Administrateur
			</label>
			<button type="submit" class="pixel-btn" disabled={submitting}>
				{submitting ? 'Ajout…' : 'Ajouter'}
			</button>
		</form>
	{/if}

	{#if error}<p class="error">{error}</p>{/if}
</PixelPanel>

<style>
	.muted {
		color: var(--muted);
	}

	.user-list {
		list-style: none;
		margin: 0.75rem 0 1.25rem;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.user-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		background: var(--plum-deep);
		border: 2px solid var(--bezel);
		border-radius: var(--radius-control, 0);
		padding: 0.45rem 0.7rem;
	}

	.user-row__name {
		color: var(--cream-bright);
		display: flex;
		align-items: center;
		gap: 0.5rem;
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
	}

	.badge--you {
		background: var(--teal);
	}

	.user-row__actions {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
	}

	.user-row__reset,
	.user-row__del {
		font-size: 0.68rem;
		padding: 0.35rem 0.6rem;
	}

	.add-form {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		border-top: 2px solid var(--bezel);
		padding-top: 1rem;
	}

	.add-form h4 {
		margin: 0;
		color: var(--cream-bright);
		font-size: 0.95rem;
	}

	.add-form__row {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.add-form__row .pixel-input,
	.add-form__row :global(.password-field) {
		flex: 1;
		min-width: 10rem;
	}

	.add-form__admin {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.85rem;
		color: var(--muted);
		cursor: pointer;
	}

	.add-form__admin input {
		width: 1.1rem;
		height: 1.1rem;
		accent-color: var(--gold-bright);
	}

	.add-form button {
		align-self: flex-start;
	}

	.error {
		color: var(--coral);
		margin: 0.75rem 0 0;
		font-size: 0.85rem;
	}
</style>
