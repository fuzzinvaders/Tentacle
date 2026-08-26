<script lang="ts">
	import { toasts } from '$lib/stores/toasts.svelte';

	/**
	 * Abonnement à un podcast par l'URL de son flux RSS. Générique : découplé de la source, il
	 * sert aussi bien aux podcasts « Intégrés » qu'à PinePods (voir PodcastsPanel pour le
	 * câblage de chacune). Utile dans les deux cas, car un podcast confidentiel peut être absent
	 * de l'annuaire de recherche alors que son flux est parfaitement valide.
	 */
	let {
		subscribe: doSubscribe,
		onSubscribed,
		hint = "Colle l'URL du flux (souvent obtenue via « Copier le lien du flux RSS » sur la page du podcast)."
	}: {
		/** Abonne à ce flux. Renvoie le nom du podcast si la source le connaît, sinon ''. */
		subscribe: (feedUrl: string) => Promise<string>;
		onSubscribed: () => void;
		hint?: string;
	} = $props();

	let feedUrl = $state('');
	let subscribing = $state(false);

	async function submit() {
		const url = feedUrl.trim();
		if (!url || subscribing) return;
		subscribing = true;
		try {
			const name = await doSubscribe(url);
			feedUrl = '';
			toasts.info(name ? `Abonné à « ${name} ».` : 'Abonnement ajouté.');
			onSubscribed();
		} catch (err) {
			toasts.error(err instanceof Error ? err.message : 'Impossible de lire ce flux.');
		} finally {
			subscribing = false;
		}
	}
</script>

<p class="feed-add__hint">{hint}</p>
<form class="feed-add__form" onsubmit={(e) => (e.preventDefault(), submit())}>
	<input
		type="url"
		class="pixel-input"
		placeholder="https://exemple.com/podcast/feed.xml"
		aria-label="URL du flux RSS"
		bind:value={feedUrl}
		required
	/>
	<button type="submit" class="pixel-btn" disabled={subscribing}>
		{subscribing ? 'Vérification…' : "S'abonner"}
	</button>
</form>

<style>
	.feed-add__hint {
		margin: 0 0 0.75rem;
		color: var(--muted);
		font-size: 0.82rem;
	}
	.feed-add__form {
		display: flex;
		gap: 0.6rem;
		margin-bottom: 1rem;
	}
	.feed-add__form input {
		flex: 1;
		min-width: 0;
	}
</style>
