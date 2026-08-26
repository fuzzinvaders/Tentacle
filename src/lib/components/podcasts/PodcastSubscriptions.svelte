<script lang="ts">
	import type { PinePodsPodcast } from '$lib/types';

	let {
		podcasts,
		selectedId,
		onSelect,
		onUnsubscribe,
		newCounts = {}
	}: {
		podcasts: PinePodsPodcast[];
		selectedId: number | null;
		onSelect: (podcastId: number) => void;
		onUnsubscribe: (podcastId: number) => void;
		/** Nombre de nouveaux épisodes par podcastId (podcasts locaux uniquement) — badge sur la
		 * pochette. Absent ou 0 = pas de badge. */
		newCounts?: Record<number, number>;
	} = $props();
</script>

{#if podcasts.length === 0}
	<p class="empty">
		Aucun abonnement pour l'instant. Utilise l'onglet Recherche pour t'abonner à un podcast.
	</p>
{:else}
	<ul class="podcast-grid">
		{#each podcasts as pod (pod.podcastid)}
			<li class="podcast-card" class:is-selected={pod.podcastid === selectedId}>
				<button type="button" class="podcast-card__main" onclick={() => onSelect(pod.podcastid)}>
					<div class="podcast-card__art-wrap">
						{#if pod.artworkurl}
							<img src={pod.artworkurl} alt="" width="72" height="72" />
						{:else}
							<div class="podcast-card__placeholder" aria-hidden="true"></div>
						{/if}
						{#if newCounts[pod.podcastid]}
							<span class="podcast-card__badge">{newCounts[pod.podcastid]}</span>
						{/if}
					</div>
					<span class="podcast-card__name">{pod.podcastname}</span>
					<span class="podcast-card__count">{pod.episodecount} épisodes</span>
				</button>
				<button
					type="button"
					class="pixel-btn pixel-btn--danger podcast-card__unsub"
					onclick={() => onUnsubscribe(pod.podcastid)}
				>
					Désabonner
				</button>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.empty {
		color: var(--muted);
	}

	.podcast-grid {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
		gap: 0.75rem;
	}

	.podcast-card {
		border: var(--border-w, 3px) solid var(--bezel);
		border-radius: var(--radius-control, 0);
		overflow: hidden;
		background: var(--plum-deep);
		display: flex;
		flex-direction: column;
	}

	.podcast-card.is-selected {
		outline: 2px solid var(--gold-bright);
		outline-offset: -2px;
	}

	.podcast-card__main {
		font-family: var(--font-pixel);
		background: transparent;
		border: none;
		color: var(--cream);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.35rem;
		padding: 0.6rem;
		cursor: pointer;
		/* Occupe toute la hauteur de la carte : combiné à la hauteur réservée du nom, toutes les
		   cartes de la grille font exactement la même taille (le bouton « Désabonner » reste donc
		   aligné d'une carte à l'autre). */
		flex: 1;
		justify-content: flex-start;
	}

	.podcast-card__art-wrap {
		position: relative;
	}

	.podcast-card__main img,
	.podcast-card__placeholder {
		width: 72px;
		height: 72px;
		border: var(--border-w, 3px) solid var(--bezel);
		border-radius: var(--radius-control, 0);
		background: var(--metal-dark);
		object-fit: cover;
	}

	.podcast-card__badge {
		position: absolute;
		top: -6px;
		right: -6px;
		min-width: 1.3rem;
		height: 1.3rem;
		padding: 0 0.3rem;
		display: grid;
		place-items: center;
		background: var(--coral);
		color: var(--ink);
		font-size: 0.65rem;
		font-weight: bold;
		border: 2px solid var(--bezel);
		border-radius: 999px;
	}

	/* Deux lignes TOUJOURS réservées, même pour un nom court : c'est ce qui rendait les cartes
	   inégales (un nom sur une ligne donnait une carte plus basse que son voisin sur deux). */
	.podcast-card__name {
		font-size: 0.8rem;
		line-height: 1.25;
		height: 2.5em;
		width: 100%;
		text-align: center;
		color: var(--cream-bright);
		overflow: hidden;
		text-overflow: ellipsis;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
	}

	.podcast-card__count {
		font-size: 0.7rem;
		color: var(--muted);
	}

	.podcast-card__unsub {
		font-size: 0.65rem;
		padding: 0.35rem;
		border-top: 3px solid var(--bezel);
	}
</style>
