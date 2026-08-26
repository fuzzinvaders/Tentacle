import { browser } from '$app/environment';
import type { PinePodsEpisode } from '$lib/types';

const STORAGE_KEY = 'tentacle:podcast-inprogress-cache';
/** Au-delà, on considère la liste trop vieille pour être affichée (on attend le réseau). */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Assez pour remplir l'écran ; évite de gonfler le localStorage. */
const MAX_EPISODES = 12;

type Entry = { at: number; episodes: PinePodsEpisode[] };
type Cache = Partial<Record<'pinepods' | 'local', Entry>>;

/**
 * Dernière liste « En cours » connue, par source.
 *
 * Pourquoi : « En cours » est l'onglet Podcasts ouvert par défaut, et c'est aussi le plus
 * coûteux — il balaye TOUS les abonnements (et, en source locale, re-télécharge et re-analyse
 * chaque flux RSS). L'app s'ouvrait donc sur son écran le plus lent, écran vide pendant
 * plusieurs secondes. On affiche désormais immédiatement la dernière liste connue, puis on la
 * remplace par la vraie dès qu'elle arrive.
 *
 * Ce n'est qu'un cache d'AFFICHAGE : la source de vérité reste le serveur (ou les flux). Il est
 * volontairement séparé du reste pour ne jamais être confondu avec l'état réel de progression.
 */
function load(): Cache {
	if (!browser) return {};
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		const data = raw ? JSON.parse(raw) : {};
		return data && typeof data === 'object' ? (data as Cache) : {};
	} catch {
		return {};
	}
}

class PodcastProgressCache {
	private cache: Cache = load();

	/** Liste mémorisée si elle existe et n'est pas périmée, sinon null. */
	get(source: 'pinepods' | 'local'): PinePodsEpisode[] | null {
		const entry = this.cache[source];
		if (!entry || !Array.isArray(entry.episodes) || entry.episodes.length === 0) return null;
		if (Date.now() - entry.at > MAX_AGE_MS) return null;
		return entry.episodes;
	}

	set(source: 'pinepods' | 'local', episodes: PinePodsEpisode[]) {
		this.cache[source] = { at: Date.now(), episodes: episodes.slice(0, MAX_EPISODES) };
		if (!browser) return;
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(this.cache));
		} catch {
			/* quota : l'affichage instantané est un confort, pas une nécessité */
		}
	}
}

export const podcastProgressCache = new PodcastProgressCache();
