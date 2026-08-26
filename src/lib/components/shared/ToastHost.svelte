<script lang="ts">
	import { toasts } from '$lib/stores/toasts.svelte';
</script>

<div class="toast-host" aria-live="polite" aria-atomic="false">
	{#each toasts.items as toast (toast.id)}
		<button
			type="button"
			class="toast"
			class:toast--error={toast.kind === 'error'}
			onclick={() => toasts.dismiss(toast.id)}
			title="Fermer"
		>
			{toast.message}
		</button>
	{/each}
</div>

<style>
	.toast-host {
		position: fixed;
		left: 50%;
		transform: translateX(-50%);
		bottom: calc(1rem + env(safe-area-inset-bottom));
		z-index: 100;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		pointer-events: none;
		width: max-content;
		max-width: min(92vw, 30rem);
	}

	.toast {
		pointer-events: auto;
		font-family: var(--font-pixel);
		font-size: 0.8rem;
		text-align: left;
		color: var(--cream-bright);
		background: linear-gradient(180deg, var(--panel-hi), var(--panel-lo));
		border: var(--border-w, 3px) solid var(--bezel);
		border-radius: var(--radius-control, 0);
		padding: 0.55rem 0.8rem;
		box-shadow:
			0 4px 0 0 var(--shadow),
			0 0 10px 0 var(--glow-faint);
		cursor: pointer;
		animation: toast-in 0.18s ease-out;
	}

	.toast--error {
		color: var(--cream-bright);
		border-color: var(--coral);
		box-shadow:
			0 4px 0 0 var(--shadow),
			0 0 10px 0 rgba(232, 121, 90, 0.4);
	}

	@keyframes toast-in {
		from {
			opacity: 0;
			transform: translateY(0.5rem);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.toast {
			animation: none;
		}
	}
</style>
