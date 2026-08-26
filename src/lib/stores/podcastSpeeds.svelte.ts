import { browser } from '$app/environment';

const STORAGE_KEY = 'tentacle:podcast-speeds';

/**
 * Vitesse de lecture mémorisée par podcast : quand on ajuste la vitesse pendant un épisode,
 * elle est retenue pour ce podcast et réappliquée aux épisodes suivants du même podcast
 * (comme Symfonium/Pocket Casts). Persistée en localStorage.
 */
function load(): Record<number, number> {
	if (!browser) return {};
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		const data = raw ? JSON.parse(raw) : {};
		return data && typeof data === 'object' ? data : {};
	} catch {
		return {};
	}
}

class PodcastSpeedsStore {
	private map = $state<Record<number, number>>(load());

	get(podcastId: number): number | undefined {
		return this.map[podcastId];
	}

	set(podcastId: number, rate: number) {
		this.map[podcastId] = rate;
		this.save();
	}

	/** Toutes les vitesses mémorisées (pour la sauvegarde des réglages). */
	all(): Record<number, number> {
		return { ...this.map };
	}

	/** Remplace toutes les vitesses (restauration d'une sauvegarde). */
	replaceAll(map: Record<number, number>) {
		this.map = { ...map };
		this.save();
	}

	private save() {
		if (!browser) return;
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(this.map));
		} catch {
			/* quota / mode privé : confort, non critique */
		}
	}
}

export const podcastSpeeds = new PodcastSpeedsStore();
