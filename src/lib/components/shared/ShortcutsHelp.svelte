<script lang="ts">
	// Les raccourcis existaient sans que rien ne les annonce : personne ne devine « / » ou « M ».
	// Cet aide-mémoire est la seule façon de les découvrir sans lire le code.
	let { open, onClose }: { open: boolean; onClose: () => void } = $props();

	const groups: { title: string; items: [string, string][] }[] = [
		{
			title: 'Général',
			items: [
				['Ctrl / ⌘ + K', 'Palette de commandes'],
				['?', 'Cet aide-mémoire'],
				['/', 'Placer le curseur dans la recherche'],
				['Échap', 'Fermer l’écran, la palette ou un menu']
			]
		},
		{
			title: 'Lecture',
			items: [
				['Espace', 'Lecture / pause'],
				['←  →', 'Reculer / avancer de 10 s'],
				['Maj + ←  →', 'Titre précédent / suivant'],
				['M', 'Couper / rétablir le son']
			]
		},
		{
			title: 'File d’attente',
			items: [['↑  ↓', 'Déplacer un titre (poignée sélectionnée)']]
		}
	];
</script>

{#if open}
	<div
		class="sc"
		role="dialog"
		aria-modal="true"
		aria-label="Raccourcis clavier"
		onclick={onClose}
		onkeydown={(e) => e.key === 'Escape' && onClose()}
		tabindex="-1"
	>
		<!-- Le clic sur le fond ferme ; on stoppe donc la propagation depuis le panneau. -->
		<div class="sc__panel" onclick={(e) => e.stopPropagation()} role="presentation">
			<div class="sc__head">
				<h2>Raccourcis clavier</h2>
				<button type="button" class="sc__close" onclick={onClose} aria-label="Fermer">✕</button>
			</div>
			<div class="sc__groups">
				{#each groups as g (g.title)}
					<section>
						<h3>{g.title}</h3>
						<dl>
							{#each g.items as [keys, label] (keys)}
								<div class="sc__row">
									<dt><kbd>{keys}</kbd></dt>
									<dd>{label}</dd>
								</div>
							{/each}
						</dl>
					</section>
				{/each}
			</div>
		</div>
	</div>
{/if}

<style>
	.sc {
		position: fixed;
		inset: 0;
		z-index: 70;
		display: grid;
		place-items: center;
		padding: 1rem;
		background: rgba(0, 0, 0, 0.6);
	}
	.sc__panel {
		width: min(34rem, 100%);
		max-height: 85vh;
		overflow-y: auto;
		background: var(--panel);
		border: 3px solid var(--bezel);
		box-shadow: 4px 5px 0 0 var(--shadow);
	}
	.sc__head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.7rem 0.9rem;
		background: var(--panel-lo);
		border-bottom: 3px solid var(--bezel);
	}
	.sc__head h2 {
		margin: 0;
		font-family: var(--font-pixel);
		font-size: 1rem;
		color: var(--cream-bright);
	}
	.sc__close {
		background: var(--plum-deep);
		border: 2px solid var(--bezel);
		color: var(--muted);
		cursor: pointer;
		width: 2rem;
		height: 2rem;
	}
	.sc__close:hover {
		color: var(--coral);
	}
	.sc__groups {
		padding: 0.9rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.sc__groups h3 {
		margin: 0 0 0.4rem;
		font-size: 0.78rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--gold-bright);
	}
	dl {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.sc__row {
		display: grid;
		grid-template-columns: 9rem 1fr;
		gap: 0.7rem;
		align-items: baseline;
	}
	dt,
	dd {
		margin: 0;
	}
	kbd {
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 0.76rem;
		background: var(--plum-deep);
		border: 2px solid var(--bezel);
		border-radius: var(--radius-chip, 0);
		padding: 0.1rem 0.35rem;
		color: var(--cream-bright);
	}
	dd {
		font-size: 0.85rem;
		color: var(--cream);
	}
	@media (max-width: 520px) {
		.sc__row {
			grid-template-columns: 1fr;
			gap: 0.1rem;
		}
	}
</style>
