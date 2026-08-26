<script lang="ts">
	// SPDX-License-Identifier: AGPL-3.0-or-later
	import { jellyfin } from '$lib/stores/jellyfin.svelte';
	import { DEMO_BASE_URL, DEMO_USER_ID, isDemo } from '$lib/demo';
	import { toasts } from '$lib/stores/toasts.svelte';

	/**
	 * Invitation au mode démonstration, sur une instance vitrine (`DEMO_MODE=1`).
	 *
	 * Un visiteur qui découvre l'application n'a aucun serveur Jellyfin à connecter : sans cela il
	 * ne verrait qu'un écran « relie une source ». On lui propose donc le catalogue de
	 * démonstration — d'un seul clic, et jamais d'autorité : une connexion existante n'est pas
	 * touchée, et le bandeau se referme.
	 */
	let { enabled }: { enabled: boolean } = $props();

	let dismissed = $state(false);
	const visible = $derived(enabled && !dismissed && !jellyfin.connected && !isDemo(jellyfin.connection));

	function activate() {
		jellyfin.connect({
			baseUrl: DEMO_BASE_URL,
			token: 'demo',
			userId: DEMO_USER_ID,
			serverName: 'Démonstration'
		});
		toasts.info('Mode démonstration activé.');
	}
</script>

{#if visible}
	<div class="invite">
		<div class="invite__text">
			<strong>Bienvenue sur la démonstration.</strong>
			<span>
				Aucun serveur à connecter : charge un petit catalogue d'exemple, jouable, pour faire le
				tour de l'application.
			</span>
		</div>
		<div class="invite__actions">
			<button type="button" class="pixel-btn" onclick={activate}>Charger la démonstration</button>
			<button type="button" class="pixel-btn pixel-btn--ghost" onclick={() => (dismissed = true)}>
				Non merci
			</button>
		</div>
	</div>
{/if}

<style>
	.invite {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.8rem;
		margin: 0 0 1rem;
		padding: 0.7rem 0.9rem;
		background: var(--panel);
		border: 3px solid var(--bezel);
		border-radius: var(--radius-control, 0);
		box-shadow: inset 2px 2px 0 0 rgba(255, 255, 255, 0.06);
	}
	.invite__text {
		flex: 1 1 18rem;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		font-size: 0.85rem;
	}
	.invite__text strong {
		color: var(--gold-bright);
	}
	.invite__text span {
		color: var(--muted);
	}
	.invite__actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
</style>
