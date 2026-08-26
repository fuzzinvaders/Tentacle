<script lang="ts">
	import { diagnostics } from '$lib/stores/diagnostics.svelte';
	import { toasts } from '$lib/stores/toasts.svelte';

	// Les plus récents en haut : c'est ce qu'on veut voir en premier après un incident.
	const recent = $derived([...diagnostics.entries].reverse());
	let copied = $state('');

	function time(at: number): string {
		const t = new Date(at);
		return [t.getHours(), t.getMinutes(), t.getSeconds()]
			.map((n) => String(n).padStart(2, '0'))
			.join(':');
	}

	async function copy() {
		const text = diagnostics.report();
		try {
			await navigator.clipboard.writeText(text);
			copied = 'Journal copié.';
		} catch {
			copied = 'Copie refusée par le navigateur — sélectionne le texte ci-dessous.';
		}
		setTimeout(() => (copied = ''), 4000);
	}

	function clear() {
		if (diagnostics.entries.length === 0) return;
		if (!confirm('Effacer le journal de lecture ?')) return;
		diagnostics.clear();
		toasts.info('Journal effacé.');
	}
</script>

<p class="diag__hint">
	Les derniers événements de lecture : changements de piste, demandes de lecture (y compris
	Bluetooth), erreurs média, blocages détectés et pauses venues du système. Après un incident —
	typiquement en voiture — copie ce journal : il dit précisément ce qui s'est passé.
</p>

<div class="diag__tools">
	<button type="button" class="pixel-btn" onclick={copy} disabled={recent.length === 0}>
		Copier le journal
	</button>
	<button type="button" class="pixel-btn pixel-btn--ghost" onclick={clear} disabled={recent.length === 0}>
		Effacer
	</button>
	<span class="diag__count">
		{recent.length === 0 ? 'Aucun événement' : `${recent.length} événement(s)`}
		{#if copied}· {copied}{/if}
	</span>
</div>

{#if recent.length > 0}
	<ul class="diag__list">
		{#each recent as e, i (i)}
			<li class="diag__row" data-kind={e.kind}>
				<span class="diag__time">{time(e.at)}</span>
				<span class="diag__kind">{e.kind}</span>
				<span class="diag__msg">{e.msg}</span>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.diag__hint {
		margin: 0 0 0.75rem;
		color: var(--muted);
		font-size: 0.82rem;
	}
	.diag__tools {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem;
		margin-bottom: 0.8rem;
	}
	.diag__count {
		font-size: 0.78rem;
		color: var(--muted);
	}

	.diag__list {
		list-style: none;
		margin: 0;
		padding: 0;
		max-height: 18rem;
		overflow-y: auto;
		border: 2px solid var(--bezel);
		border-radius: var(--radius-control, 0);
		background: var(--plum-deep);
	}
	.diag__row {
		display: grid;
		grid-template-columns: 4.2rem 5rem 1fr;
		gap: 0.5rem;
		padding: 0.3rem 0.5rem;
		font-size: 0.74rem;
		border-bottom: 1px solid rgba(127, 127, 127, 0.18);
	}
	.diag__row:last-child {
		border-bottom: none;
	}
	.diag__time {
		color: var(--muted);
		font-variant-numeric: tabular-nums;
	}
	.diag__kind {
		text-transform: uppercase;
		letter-spacing: 0.04em;
		font-size: 0.66rem;
		align-self: center;
		color: var(--teal);
	}
	/* La couleur porte la gravité : on repère un incident sans lire. */
	.diag__row[data-kind='erreur'] .diag__kind {
		color: var(--coral);
	}
	.diag__row[data-kind='blocage'] .diag__kind,
	.diag__row[data-kind='etat'] .diag__kind {
		color: var(--gold-bright);
	}
	.diag__msg {
		color: var(--cream);
		min-width: 0;
		overflow-wrap: anywhere;
	}
</style>
