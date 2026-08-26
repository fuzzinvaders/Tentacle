<script lang="ts">
	import { jellyfin } from '$lib/stores/jellyfin.svelte';
	import { DEMO_BASE_URL, DEMO_USER_ID, isDemo } from '$lib/demo';
	import { player } from '$lib/stores/player.svelte';
	import { toasts } from '$lib/stores/toasts.svelte';

	const active = $derived(isDemo(jellyfin.connection));
	/** Une vraie connexion Jellyfin serait écrasée : on prévient au lieu de la perdre. */
	const wouldReplaceReal = $derived(jellyfin.connected && !active);

	function enable() {
		if (wouldReplaceReal) {
			const ok = confirm(
				'Le mode démonstration remplace la connexion Jellyfin actuelle. Il faudra la refaire ensuite. Continuer ?'
			);
			if (!ok) return;
		}
		player.clearQueue();
		jellyfin.connect({
			baseUrl: DEMO_BASE_URL,
			token: 'demo',
			userId: DEMO_USER_ID,
			serverName: 'Démonstration'
		});
		toasts.info('Mode démonstration activé.');
	}

	function disable() {
		player.clearQueue();
		jellyfin.disconnect();
		toasts.info('Mode démonstration désactivé.');
	}
</script>

<p class="demo__hint">
	Un faux catalogue jouable, sans aucun serveur : la bibliothèque, la lecture, la file et les
	contrôles média fonctionnent pour de vrai. Les pistes sont des notes de test — c'est audible,
	donc les enchaînements et les fondus se vérifient à l'oreille.
</p>
<p class="demo__hint">
	Utile pour reproduire un problème de lecture sans mettre ton serveur dans l'équation, et pour
	montrer l'application à quelqu'un qui n'a pas de Jellyfin.
</p>

{#if active}
	<div class="demo__row">
		<span class="demo__badge">Actif</span>
		<button type="button" class="pixel-btn pixel-btn--ghost" onclick={disable}>
			Désactiver la démonstration
		</button>
	</div>
{:else}
	<button type="button" class="pixel-btn" onclick={enable}>Activer la démonstration</button>
	{#if wouldReplaceReal}
		<p class="demo__warn">
			⚠️ Ta connexion Jellyfin actuelle sera remplacée — il faudra la refaire ensuite.
		</p>
	{/if}
{/if}

<style>
	.demo__hint {
		margin: 0 0 0.6rem;
		color: var(--muted);
		font-size: 0.82rem;
	}
	.demo__row {
		display: flex;
		align-items: center;
		gap: 0.7rem;
	}
	.demo__badge {
		font-family: var(--font-pixel);
		font-size: 0.68rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		background: var(--gold-bright);
		color: var(--ink);
		border: 2px solid var(--bezel);
		padding: 0.15rem 0.4rem;
	}
	.demo__warn {
		margin: 0.6rem 0 0;
		font-size: 0.78rem;
		color: var(--coral);
	}
</style>
