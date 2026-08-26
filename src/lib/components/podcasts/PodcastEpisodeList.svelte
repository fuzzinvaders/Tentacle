<script lang="ts">
	import type { PinePodsEpisode } from '$lib/types';
	import { player } from '$lib/stores/player.svelte';
	import { formatDate, formatTime } from '$lib/format';
	import { episodeToTrack } from '$lib/podcastTrack';

	let {
		episodes,
		showPodcastName = false,
		emptyMessage = 'Aucun épisode pour le moment.',
		onToggleQueue = null,
		onToggleCompleted = null,
		onPlay = null,
		isLocal = false
	}: {
		episodes: PinePodsEpisode[];
		showPodcastName?: boolean;
		emptyMessage?: string;
		/** When provided, shows a queue toggle button per episode (Ajouter/Retirer de la file). */
		onToggleQueue?: ((ep: PinePodsEpisode) => void) | null;
		/** When provided, shows a read toggle button per episode (Marquer comme lu/non lu). */
		onToggleCompleted?: ((ep: PinePodsEpisode) => void) | null;
		/** Called right after starting playback — lets the parent reflect "en cours" locally. */
		onPlay?: ((ep: PinePodsEpisode) => void) | null;
		/** Abonnement « local » (flux RSS géré dans l'app) plutôt que PinePods — répercuté sur
		 * la piste jouée pour que la synchro de progression parte au bon endroit. */
		isLocal?: boolean;
	} = $props();

	// Épisodes dépliés (titre complet + description). Vide par défaut → liste compacte.
	let expanded = $state(new Set<number>());

	function toggle(id: number) {
		const next = new Set(expanded);
		next.has(id) ? next.delete(id) : next.add(id);
		expanded = next;
	}

	/** Les descriptions de podcasts sont du HTML : on le réduit en texte brut (pas de {@html},
	 * donc aucun risque d'injection) et on décode les entités les plus courantes. */
	function plainText(html: string): string {
		return html
			.replace(/<[^>]*>/g, ' ')
			.replace(/&nbsp;/g, ' ')
			.replace(/&amp;/g, '&')
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.replace(/&quot;/g, '"')
			.replace(/&#39;/g, "'")
			.replace(/\s+/g, ' ')
			.trim();
	}

	function play(ep: PinePodsEpisode) {
		player.playNow(episodeToTrack(ep, isLocal));
		onPlay?.(ep);
	}

	function progressRatio(ep: PinePodsEpisode): number {
		if (!ep.episodeduration) return 0;
		return Math.min(1, ep.listenduration / ep.episodeduration);
	}
</script>

{#if episodes.length === 0}
	<p class="empty">{emptyMessage}</p>
{:else}
	<ul class="episode-list">
		{#each episodes as ep (ep.episodeid)}
			{@const isOpen = expanded.has(ep.episodeid)}
			<li class="episode-list__item">
				{#if ep.episodeartwork}
					<img src={ep.episodeartwork} alt="" width="56" height="56" />
				{:else}
					<div class="episode-list__placeholder" aria-hidden="true"></div>
				{/if}

				<div class="episode-list__body">
					<button
						type="button"
						class="episode-list__toggle"
						aria-expanded={isOpen}
						onclick={() => toggle(ep.episodeid)}
					>
						<span class="episode-list__chevron" aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
						<span class="episode-list__title-row">
							<strong class:is-open={isOpen}>{ep.episodetitle}</strong>
							{#if ep.completed}
								<span class="label-tag">Lu</span>
							{:else if ep.listenduration > 0}
								<span class="label-tag">En cours</span>
							{/if}
						</span>
					</button>
					{#if showPodcastName}
						<span class="episode-list__podcast">{ep.podcastname}</span>
					{/if}
					<span class="episode-list__meta">
						{formatDate(ep.episodepubdate)} · {formatTime(ep.episodeduration)}
					</span>
					{#if ep.listenduration > 0 && !ep.completed}
						<div class="episode-list__progress" aria-hidden="true">
							<div class="episode-list__progress-fill" style:width={`${progressRatio(ep) * 100}%`}></div>
						</div>
					{/if}
					{#if isOpen && ep.episodedescription}
						<p class="episode-list__description">{plainText(ep.episodedescription)}</p>
					{/if}
				</div>

				<div class="episode-list__actions">
					<button type="button" class="pixel-btn" onclick={() => play(ep)}>Lire</button>
					{#if onToggleQueue}
						<button type="button" class="pixel-btn pixel-btn--ghost" onclick={() => onToggleQueue?.(ep)}>
							{ep.queued ? 'Retirer de la file' : 'Ajouter à la file'}
						</button>
					{/if}
					{#if onToggleCompleted}
						<button type="button" class="pixel-btn pixel-btn--ghost" onclick={() => onToggleCompleted?.(ep)}>
							{ep.completed ? 'Marquer comme non lu' : 'Marquer comme lu'}
						</button>
					{/if}
				</div>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.empty {
		color: var(--muted);
	}

	.episode-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.episode-list__item {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		border: var(--border-w, 3px) solid var(--bezel);
		border-radius: var(--radius-control, 0);
		background: var(--plum-deep);
		padding: 0.6rem;
	}

	.episode-list__item img,
	.episode-list__placeholder {
		width: 56px;
		height: 56px;
		flex-shrink: 0;
		border: var(--border-w, 3px) solid var(--bezel);
		border-radius: var(--radius-control, 0);
		background: var(--metal-dark);
		object-fit: cover;
	}

	.episode-list__body {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	/* Titre cliquable : reset du bouton, aligne le chevron avec le titre. */
	.episode-list__toggle {
		display: flex;
		align-items: baseline;
		gap: 0.4rem;
		width: 100%;
		background: none;
		border: none;
		padding: 0;
		margin: 0;
		text-align: left;
		color: inherit;
		cursor: pointer;
	}

	.episode-list__chevron {
		color: var(--gold);
		font-size: 0.7rem;
		flex-shrink: 0;
	}

	.episode-list__title-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 0;
	}

	.episode-list__title-row strong {
		color: var(--cream-bright);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Déplié : le titre s'affiche en entier (retour à la ligne autorisé). */
	.episode-list__title-row strong.is-open {
		overflow: visible;
		white-space: normal;
	}

	.episode-list__description {
		margin: 0.4rem 0 0;
		color: var(--muted);
		font-size: 0.8rem;
		line-height: 1.45;
		max-height: 11rem;
		overflow-y: auto;
	}

	.episode-list__podcast {
		color: var(--gold-bright);
		font-size: 0.75rem;
	}

	.episode-list__meta {
		color: var(--muted);
		font-size: 0.75rem;
	}

	.episode-list__progress {
		height: 4px;
		background: var(--metal-dark);
		border-radius: var(--radius-chip, 0);
		overflow: hidden;
		margin-top: 0.25rem;
	}

	.episode-list__progress-fill {
		height: 100%;
		background: var(--gold-bright);
	}

	.episode-list__actions {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		flex-shrink: 0;
	}

	.episode-list__actions .pixel-btn {
		font-size: 0.65rem;
		padding: 0.4rem 0.6rem;
		white-space: nowrap;
	}
</style>
