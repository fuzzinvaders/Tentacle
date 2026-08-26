import { browser } from '$app/environment';

const STORAGE_KEY = 'tentacle:podcast-skips';

/** Secondes d'intro (début) et d'outro (fin) à sauter pour un podcast donné. */
export type PodcastSkip = { intro: number; outro: number };

/**
 * Saut d'intro/outro mémorisé PAR ABONNEMENT (podcastId) : réglé une fois pour un podcast,
 * il s'applique à tous ses épisodes (et aux suivants). L'intro fait démarrer la lecture à
 * +N s (générique/annonces), l'outro considère l'épisode « lu » à N s de la fin (pub/outro).
 * Persisté en localStorage, comme les vitesses par podcast ([[podcastSpeeds]]).
 */
function load(): Record<number, PodcastSkip> {
	if (!browser) return {};
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		const data = raw ? JSON.parse(raw) : {};
		return data && typeof data === 'object' ? data : {};
	} catch {
		return {};
	}
}

function sanitize(n: unknown): number {
	const v = typeof n === 'number' ? n : Number(n);
	return Number.isFinite(v) && v > 0 ? Math.round(v) : 0;
}

class PodcastSkipsStore {
	private map = $state<Record<number, PodcastSkip>>(load());

	get(podcastId: number): PodcastSkip | undefined {
		return this.map[podcastId];
	}

	set(podcastId: number, skip: PodcastSkip) {
		const clean: PodcastSkip = { intro: sanitize(skip.intro), outro: sanitize(skip.outro) };
		// Rien à sauter → on retire l'entrée (garde le stockage propre).
		if (clean.intro === 0 && clean.outro === 0) delete this.map[podcastId];
		else this.map[podcastId] = clean;
		this.save();
	}

	/** Tous les sauts mémorisés (pour la sauvegarde des réglages). */
	all(): Record<number, PodcastSkip> {
		return { ...this.map };
	}

	/** Remplace tous les sauts (restauration d'une sauvegarde). */
	replaceAll(map: Record<number, PodcastSkip>) {
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

export const podcastSkips = new PodcastSkipsStore();
