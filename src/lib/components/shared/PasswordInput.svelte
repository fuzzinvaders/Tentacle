<script lang="ts">
	/**
	 * Champ mot de passe avec bouton afficher/masquer. Supporte les deux usages du projet :
	 * - lié (`bind:value`) pour les formulaires pilotés en JS (config, compte…) ;
	 * - par `name` seul pour les formulaires POST classiques (connexion, création admin) —
	 *   `value` reste alors à sa valeur par défaut, l'input est soumis via son attribut `name`.
	 * Le basculement ne change que le `type` de l'input, jamais sa valeur : l'autofill des
	 * gestionnaires de mots de passe continue de fonctionner.
	 */
	import type { FullAutoFill } from 'svelte/elements';

	interface Props {
		value?: string;
		id?: string;
		name?: string;
		autocomplete?: FullAutoFill;
		placeholder?: string;
		required?: boolean;
	}
	let {
		value = $bindable(''),
		id,
		name,
		autocomplete,
		placeholder,
		required = false
	}: Props = $props();

	let revealed = $state(false);
	const actionLabel = $derived(revealed ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
</script>

<div class="password-field">
	<input
		{id}
		{name}
		{autocomplete}
		{placeholder}
		{required}
		class="pixel-input"
		type={revealed ? 'text' : 'password'}
		bind:value
	/>
	<button
		type="button"
		class="reveal-btn"
		aria-pressed={revealed}
		aria-label={actionLabel}
		title={actionLabel}
		onclick={() => (revealed = !revealed)}
	>
		<svg viewBox="0 0 16 16" width="18" height="18" shape-rendering="crispEdges" aria-hidden="true">
			<!-- Œil : paupières + iris (toujours affiché) -->
			<g fill="currentColor">
				<rect x="4" y="5" width="8" height="2" />
				<rect x="2" y="7" width="2" height="2" />
				<rect x="12" y="7" width="2" height="2" />
				<rect x="4" y="9" width="8" height="2" />
				<rect x="6" y="7" width="4" height="2" />
			</g>
			<rect x="7" y="7" width="2" height="2" fill="var(--plum-deep)" />
			{#if revealed}
				<!-- Barre oblique = état « visible » (clic pour masquer) -->
				<g fill="currentColor">
					<rect x="2" y="12" width="2" height="2" />
					<rect x="4" y="10" width="2" height="2" />
					<rect x="6" y="8" width="2" height="2" />
					<rect x="8" y="6" width="2" height="2" />
					<rect x="10" y="4" width="2" height="2" />
					<rect x="12" y="2" width="2" height="2" />
				</g>
			{/if}
		</svg>
	</button>
</div>

<style>
	.password-field {
		position: relative;
		width: 100%;
	}

	.password-field .pixel-input {
		/* place pour le bouton, sans chevaucher le texte saisi */
		padding-right: 2.6rem;
	}

	.reveal-btn {
		position: absolute;
		top: 0;
		right: 0;
		height: 100%;
		width: 2.4rem;
		display: grid;
		place-items: center;
		background: transparent;
		border: none;
		padding: 0;
		cursor: pointer;
		color: var(--metal-mid);
	}

	.reveal-btn:hover,
	.reveal-btn:focus-visible {
		color: var(--gold-bright);
	}

	.reveal-btn:focus-visible {
		outline: 2px solid var(--gold);
		outline-offset: -2px;
	}
</style>
