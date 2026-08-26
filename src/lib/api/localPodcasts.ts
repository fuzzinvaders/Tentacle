import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { mapLimit } from '$lib/concurrency';
import { parsePodcastFeed, type ParsedEpisode, type ParsedFeed } from '$lib/rss';
import { parseChaptersJson, type Chapter } from '$lib/chapters';
import { localPodcasts, type LocalFeedMeta } from '$lib/stores/localPodcasts.svelte';
import type { PinePodsEpisode, PinePodsPodcast, PinePodsSearchResult } from '$lib/types';

/**
 * Podcasts « locaux » : abonnements RSS gérés entièrement dans l'app, sans PinePods (voir
 * réglage `podcastSource` et [[../stores/localPodcasts.svelte.ts]]). Les fonctions ci-dessous
 * miroitent volontairement la forme de `api/pinepods.ts` (mêmes types PinePodsPodcast/
 * PinePodsEpisode en sortie) pour que PodcastsPanel et tous les composants d'affichage
 * (PodcastEpisodeList, PodcastSubscriptions…) restent identiques quelle que soit la source.
 *
 * Récupération du flux :
 *  - mobile (Capacitor) : CapacitorHttp (natif → pas de CORS) ;
 *  - web : proxy serveur /api/podcast-feed (le navigateur ne peut pas lire un flux arbitraire
 *    sans en-têtes CORS, que la plupart des hébergeurs de podcasts n'envoient pas).
 */

export class LocalPodcastError extends Error {}

/** Récupère une ressource texte arbitraire (flux RSS OU document JSON de chapitres — même
 * problème de CORS, même traitement) : CapacitorHttp natif sur mobile, proxy serveur sur web. */
async function fetchTextResource(url: string): Promise<string> {
	if (Capacitor.isNativePlatform()) {
		const res = await CapacitorHttp.get({
			url,
			responseType: 'text',
			connectTimeout: 20000,
			readTimeout: 20000
		});
		if (res.status < 200 || res.status >= 300) {
			throw new LocalPodcastError(`Ressource injoignable (HTTP ${res.status}).`);
		}
		return typeof res.data === 'string' ? res.data : String(res.data ?? '');
	}
	const res = await fetch(`/api/podcast-feed?url=${encodeURIComponent(url)}`);
	if (!res.ok) {
		const msg = await res.text().catch(() => '');
		throw new LocalPodcastError(msg || `Ressource injoignable (HTTP ${res.status}).`);
	}
	return await res.text();
}

// Cache en mémoire (PAS persisté : uniquement pour éviter de re-télécharger/parser le même
// flux à chaque changement d'onglet pendant une session). Les vues multi-podcasts (En cours,
// À suivre, Récents) doivent, comme côté PinePods, balayer chaque abonnement — ce cache leur
// évite de retélécharger si l'utilisateur navigue entre onglets en quelques minutes.
const FEED_CACHE_TTL_MS = 5 * 60 * 1000;
const feedCache = new Map<number, { at: number; parsed: ParsedFeed }>();

async function getParsedFeed(podcastId: number, feedUrl: string, force = false): Promise<ParsedFeed> {
	const cached = feedCache.get(podcastId);
	if (!force && cached && Date.now() - cached.at < FEED_CACHE_TTL_MS) return cached.parsed;
	const xml = await fetchTextResource(feedUrl);
	const parsed = parsePodcastFeed(xml, feedUrl);
	feedCache.set(podcastId, { at: Date.now(), parsed });
	return parsed;
}

function toPinePodsPodcast(podcastId: number, meta: LocalFeedMeta, episodeCount = 0): PinePodsPodcast {
	return {
		podcastid: podcastId,
		podcastname: meta.title,
		artworkurl: meta.artworkUrl,
		description: meta.description,
		episodecount: episodeCount,
		websiteurl: '',
		feedurl: meta.feedUrl,
		author: meta.author,
		categories: '',
		explicit: false,
		podcastindexid: null
	};
}

function toPinePodsEpisode(ep: ParsedEpisode, podcastId: number, podcastname: string): PinePodsEpisode {
	const st = localPodcasts.getEpisodeState(ep.id);
	return {
		episodeid: ep.id,
		episodetitle: ep.title,
		podcastname,
		podcastid: podcastId,
		episodepubdate: ep.pubDate,
		episodedescription: ep.description,
		episodeartwork: ep.artworkUrl,
		episodeurl: ep.enclosureUrl,
		episodeduration: ep.durationSec,
		listenduration: st?.listenSec ?? 0,
		websiteurl: '',
		chaptersUrl: ep.chaptersUrl,
		completed: st?.completed ?? false,
		saved: false,
		queued: st?.queued ?? false,
		downloaded: false,
		is_youtube: false
	};
}

/** Abonne (ou réabonne) à un flux RSS : télécharge, analyse, et enregistre l'abonnement. */
export async function subscribeToFeed(feedUrl: string): Promise<PinePodsPodcast> {
	const url = feedUrl.trim();
	if (!url) throw new LocalPodcastError('URL de flux vide.');
	const xml = await fetchTextResource(url);
	const parsed = parsePodcastFeed(xml, url);
	if (parsed.episodes.length === 0) {
		throw new LocalPodcastError('Aucun épisode exploitable dans ce flux.');
	}
	const meta: LocalFeedMeta = {
		feedUrl: url,
		title: parsed.meta.title,
		artworkUrl: parsed.meta.artworkUrl,
		author: parsed.meta.author,
		description: parsed.meta.description
	};
	localPodcasts.upsert(parsed.id, meta);
	feedCache.set(parsed.id, { at: Date.now(), parsed });
	// Marque tout de suite « vu » : sans ça, les épisodes déjà existants au moment de
	// l'abonnement remonteraient tous comme « nouveaux » au premier chargement.
	localPodcasts.markSeen(parsed.id);
	return toPinePodsPodcast(parsed.id, meta, parsed.episodes.length);
}

export function listSubscriptions(): PinePodsPodcast[] {
	return localPodcasts.list().map((f) => toPinePodsPodcast(f.podcastId, f));
}

export function unsubscribe(podcastId: number): void {
	feedCache.delete(podcastId);
	localPodcasts.remove(podcastId);
}

/** Épisodes d'un abonnement, plus récents d'abord ou non — rafraîchit aussi les métadonnées
 * du podcast (titre/pochette) au passage, comme un vrai client RSS. */
export async function listEpisodes(
	podcastId: number,
	sortOrder: 'asc' | 'desc' = 'desc'
): Promise<PinePodsEpisode[]> {
	const meta = localPodcasts.get(podcastId);
	if (!meta) return [];
	const parsed = await getParsedFeed(podcastId, meta.feedUrl);
	// Rafraîchit les métadonnées affichées (titre/pochette peuvent changer côté éditeur), mais
	// SEULEMENT si l'analyse a produit quelque chose de crédible.
	//
	// Sans cette garde, une réponse dégradée (hébergeur qui renvoie une page d'erreur en HTTP 200,
	// portail wifi captif…) s'analysait en un flux vide dont le titre retombe sur l'URL — et le
	// nom du podcast était alors REMPLACÉ par son URL dans la liste des abonnements. Constaté en
	// test. Un flux sain a toujours un titre et au moins un épisode.
	const credible = parsed.meta.title.trim().length > 0 && parsed.episodes.length > 0;
	if (credible) {
		localPodcasts.upsert(podcastId, {
			feedUrl: meta.feedUrl,
			title: parsed.meta.title,
			artworkUrl: parsed.meta.artworkUrl,
			author: parsed.meta.author,
			description: parsed.meta.description
		});
	}
	const episodes = parsed.episodes.map((ep) => toPinePodsEpisode(ep, podcastId, parsed.meta.title));
	const sorted = [...episodes].sort((a, b) => {
		const da = Date.parse(a.episodepubdate) || 0;
		const db = Date.parse(b.episodepubdate) || 0;
		return sortOrder === 'desc' ? db - da : da - db;
	});
	return sorted;
}

/** Épisodes en cours (progression réelle, non terminés) sur TOUS les abonnements locaux —
 * même approche que `listInProgressEpisodes` côté PinePods (balaye chaque flux, concurrence
 * bornée), simplement en reparsant les flux plutôt qu'en interrogeant un serveur tiers. */
export async function listInProgressEpisodes(): Promise<PinePodsEpisode[]> {
	const feeds = localPodcasts.list();
	const perFeed = await mapLimit(feeds, 6, (f) =>
		listEpisodes(f.podcastId, 'desc').catch(() => [] as PinePodsEpisode[])
	);
	return perFeed.flat().filter((ep) => ep.listenduration > 0 && !ep.completed);
}

/** N épisodes les plus récents, tous abonnements confondus (onglet « Récents »). */
export async function listRecentEpisodes(limit = 40): Promise<PinePodsEpisode[]> {
	const feeds = localPodcasts.list();
	const perFeed = await mapLimit(feeds, 6, (f) =>
		listEpisodes(f.podcastId, 'desc').catch(() => [] as PinePodsEpisode[])
	);
	return perFeed
		.flat()
		.sort((a, b) => (Date.parse(b.episodepubdate) || 0) - (Date.parse(a.episodepubdate) || 0))
		.slice(0, limit);
}

/** File « à suivre » : reconstruit chaque épisode depuis son flux d'origine, dans l'ordre où
 * il a été mis en file. Un épisode retiré du flux par l'éditeur disparaît silencieusement
 * (rien à jouer) — cas limite acceptable, pas de duplication de données à maintenir sinon. */
export async function listQueue(): Promise<PinePodsEpisode[]> {
	const order = localPodcasts.allQueue();
	if (order.length === 0) return [];
	const podcastIds = [...new Set(order.map((id) => localPodcasts.getEpisodeState(id)?.podcastId))].filter(
		(id): id is number => id !== undefined
	);
	const perFeed = await mapLimit(podcastIds, 6, (id) =>
		listEpisodes(id, 'desc').catch(() => [] as PinePodsEpisode[])
	);
	const byId = new Map<number, PinePodsEpisode>();
	for (const ep of perFeed.flat()) byId.set(ep.episodeid, ep);
	return order.map((id) => byId.get(id)).filter((ep): ep is PinePodsEpisode => ep !== undefined);
}

export function toggleQueue(ep: PinePodsEpisode): void {
	localPodcasts.toggleQueued(ep.episodeid, ep.podcastid);
}

export function removeFromQueue(episodeId: number): void {
	localPodcasts.removeFromQueue(episodeId);
}

export function markCompleted(episodeId: number, podcastId: number): void {
	localPodcasts.setCompleted(episodeId, podcastId, true);
	localPodcasts.removeFromQueue(episodeId);
}

export function markUncompleted(episodeId: number, podcastId: number): void {
	localPodcasts.setCompleted(episodeId, podcastId, false);
}

export function saveListenPosition(episodeId: number, podcastId: number, sec: number): void {
	localPodcasts.setListenSec(episodeId, podcastId, sec);
}

/** À appeler quand l'utilisateur ouvre l'écran des épisodes d'un abonnement : efface son
 * compteur de « nouveaux » (voir getNewEpisodeCounts). */
export function markPodcastSeen(podcastId: number): void {
	localPodcasts.markSeen(podcastId);
}

/** Nombre de nouveaux épisodes (publiés depuis la dernière visite) par abonnement — pour le
 * badge sur les cartes, dans l'onglet « Abonnements ». Ne renvoie que les podcasts qui en ont
 * au moins un (les autres sont simplement absents de l'objet). */
export async function getNewEpisodeCounts(): Promise<Record<number, number>> {
	const feeds = localPodcasts.list();
	const perFeed = await mapLimit(feeds, 6, async (f) => {
		const lastSeen = localPodcasts.getLastSeenAt(f.podcastId);
		if (lastSeen === 0) {
			// Abonnement antérieur à cette fonctionnalité (ou jamais marqué) : on prend « maintenant »
			// comme référence plutôt que de compter tout l'historique du flux comme « nouveau ».
			localPodcasts.markSeen(f.podcastId);
			return [f.podcastId, 0] as const;
		}
		const eps = await listEpisodes(f.podcastId, 'desc').catch(() => [] as PinePodsEpisode[]);
		const count = eps.filter((ep) => (Date.parse(ep.episodepubdate) || 0) > lastSeen).length;
		return [f.podcastId, count] as const;
	});
	return Object.fromEntries(perFeed.filter(([, count]) => count > 0));
}

// Cache en mémoire des chapitres déjà téléchargés (le document ne change pas une fois l'épisode
// publié) — évite de retélécharger à chaque ouverture de l'écran Now Playing pour le même titre.
const chaptersCache = new Map<string, Chapter[]>();

/** Récupère et parse les chapitres Podcasting 2.0 d'un épisode (voir `ep.chaptersUrl`). */
export async function getEpisodeChapters(chaptersUrl: string): Promise<Chapter[]> {
	const cached = chaptersCache.get(chaptersUrl);
	if (cached) return cached;
	const raw = await fetchTextResource(chaptersUrl);
	const chapters = parseChaptersJson(raw);
	chaptersCache.set(chaptersUrl, chapters);
	return chapters;
}

/**
 * Recherche de podcasts (découverte, sans connaître l'URL du flux) via l'annuaire iTunes/Apple
 * Podcasts — API publique, sans clé, et qui envoie des en-têtes CORS (`Access-Control-Allow-
 * Origin: *`), donc appelable directement depuis le navigateur/la WebView : pas besoin de proxy
 * serveur ici (contrairement à la récupération des flux eux-mêmes, cf. fetchTextResource ci-dessus).
 */
export async function searchPodcastsItunes(term: string): Promise<PinePodsSearchResult[]> {
	const q = term.trim();
	if (!q) return [];
	const res = await fetch(
		`https://itunes.apple.com/search?media=podcast&limit=25&term=${encodeURIComponent(q)}`
	);
	if (!res.ok) throw new LocalPodcastError(`Recherche impossible (HTTP ${res.status}).`);
	const data = (await res.json()) as { results?: Record<string, unknown>[] };
	const results = Array.isArray(data.results) ? data.results : [];
	return results
		.filter((r): r is Record<string, unknown> & { feedUrl: string } => typeof r.feedUrl === 'string' && !!r.feedUrl)
		.map((r) => ({
			podcastname: String(r.collectionName ?? r.trackName ?? ''),
			feedurl: r.feedUrl,
			artworkurl: String(r.artworkUrl600 ?? r.artworkUrl100 ?? ''),
			description: '',
			author: String(r.artistName ?? ''),
			episodecount: Number(r.trackCount ?? 0),
			podcastindexid: 0,
			websiteurl: String(r.collectionViewUrl ?? ''),
			explicit: r.collectionExplicitness === 'explicit',
			categories: {}
		}));
}
