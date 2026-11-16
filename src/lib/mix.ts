/**
 * Mix « même plan sonore » : classement de titres candidats d'après leur proximité de genres
 * avec la graine (artiste, album ou titre).
 *
 * Pourquoi : l'Instant Mix de Jellyfin pioche au hasard parmi les titres qui partagent AU MOINS
 * UN genre avec la graine. Un artiste étiqueté « Rock, Pop, Alternatif » ramène donc du metal
 * comme de la variété. Ici on pondère chaque genre de la graine par sa RARETÉ dans le lot
 * candidat (un genre précis pèse plus qu'un genre fourre-tout) et on pénalise les titres qui
 * portent beaucoup de genres que la graine n'a pas.
 *
 * Deuxième signal, plus proche de la « radio d'artiste » de Plexamp : l'AFFINITÉ d'artiste. Une
 * vraie analyse sonore des fichiers (ce que fait Plexamp) n'existe ni dans Jellyfin ni dans une API
 * gratuite ; on s'en approche avec les artistes réputés proches (Deezer, Jellyfin) : un titre dont
 * l'artiste est proche de la graine est favorisé même si ses genres sont mal renseignés.
 *
 * Fonctions pures (aucun accès réseau) pour pouvoir les tester.
 */

export type MixCandidate<T> = {
	item: T;
	/** Genres du titre (tels que renvoyés par Jellyfin, casse quelconque). */
	genres: string[];
	/** Artiste principal, pour éviter qu'un seul artiste monopolise le mix. */
	artist?: string;
	/** Titre de l'artiste graine / de la graine elle-même : toujours retenu en priorité. */
	isSeed?: boolean;
	/** Proximité de l'artiste avec la graine, 0..1 (voir `artistAffinities`). */
	affinity?: number;
};

/** Part du score due à l'affinité d'artiste (le reste vient des genres). */
export const AFFINITY_WEIGHT = 0.7;

/**
 * Affinités par nom d'artiste (normalisé) à partir d'une liste ordonnée du plus au moins proche :
 * 1 pour le premier, décroissant jusqu'à ~0,3 pour le dernier. Les doublons gardent leur meilleur rang.
 */
export function artistAffinities(orderedNames: string[]): Map<string, number> {
	const unique: string[] = [];
	const seen = new Set<string>();
	for (const n of orderedNames) {
		const k = normalizeGenre(n);
		if (k && !seen.has(k)) {
			seen.add(k);
			unique.push(k);
		}
	}
	const out = new Map<string, number>();
	unique.forEach((k, i) => out.set(k, 1 - (0.7 * i) / Math.max(1, unique.length)));
	return out;
}

export type RankOptions = {
	limit: number;
	/** Part d'aléatoire ajoutée au score (0 = classement strict). */
	jitter?: number;
	/** Nombre maximal de titres d'un même artiste. */
	maxPerArtist?: number;
	/** Score minimal (0..1) pour qu'un titre soit jugé « du même plan sonore ». */
	minScore?: number;
	/** Nombre minimal de titres à renvoyer, quitte à relâcher le seuil. */
	minResults?: number;
	rand?: () => number;
};

export function normalizeGenre(g: string): string {
	return g
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

function genreSet(genres: string[]): Set<string> {
	const s = new Set<string>();
	for (const g of genres) {
		const n = normalizeGenre(g);
		if (n) s.add(n);
	}
	return s;
}

/**
 * Score 0..1 de chaque candidat par rapport aux genres de la graine : poids des genres
 * communs ÷ (poids des genres de la graine + pénalité pour les genres étrangers).
 */
export function scoreCandidates<T>(
	seedGenres: string[],
	candidates: MixCandidate<T>[]
): number[] {
	const seed = genreSet(seedGenres);
	const sets = candidates.map((c) => genreSet(c.genres));

	// Poids = 1 / fréquence dans le lot : « Shoegaze » (rare) compte plus que « Rock » (partout).
	const weight = new Map<string, number>();
	for (const g of seed) {
		let count = 0;
		for (const s of sets) if (s.has(g)) count++;
		if (count > 0) weight.set(g, 1 / count);
	}
	if (weight.size === 0) return candidates.map(() => 0);

	let total = 0;
	for (const w of weight.values()) total += w;
	const avg = total / weight.size;
	// Un genre étranger coûte un quart d'un genre moyen de la graine.
	const foreign = avg * 0.25;

	return sets.map((s) => {
		let shared = 0;
		let extra = 0;
		for (const g of s) {
			const w = weight.get(g);
			if (w !== undefined) shared += w;
			else if (!seed.has(g)) extra++;
		}
		if (shared === 0) return 0;
		return shared / (total + extra * foreign);
	});
}

/**
 * Sélectionne les `limit` titres les plus proches de la graine, avec un peu d'aléatoire pour
 * que deux mix successifs ne soient pas identiques, et un plafond par artiste.
 */
export function rankFocusedMix<T>(
	seedGenres: string[],
	candidates: MixCandidate<T>[],
	opts: RankOptions
): T[] {
	const rand = opts.rand ?? Math.random;
	const jitter = opts.jitter ?? 0.15;
	const maxPerArtist = opts.maxPerArtist ?? 5;
	const minScore = opts.minScore ?? 0.5;
	const minResults = Math.min(opts.minResults ?? 20, opts.limit);

	const scores = scoreCandidates(seedGenres, candidates);
	const ranked = candidates
		.map((c, i) => {
			// `raw` (non plafonné) sert à l'ORDRE : sans lui, un titre au genre parfait ET d'un artiste
			// proche serait à égalité avec un titre au seul genre parfait. `score` (plafonné) sert au seuil.
			const raw = c.isSeed ? 2 : scores[i] + AFFINITY_WEIGHT * (c.affinity ?? 0);
			return { c, score: Math.min(1, raw), key: raw + rand() * jitter };
		})
		.filter((r) => r.score > 0)
		.sort((a, b) => b.key - a.key);

	let pool = ranked.filter((r) => r.score >= minScore);
	if (pool.length < minResults) pool = ranked.slice(0, Math.max(minResults, pool.length));

	const perArtist = new Map<string, number>();
	const out: T[] = [];
	for (const r of pool) {
		if (out.length >= opts.limit) break;
		const a = r.c.artist ? normalizeGenre(r.c.artist) : '';
		if (a) {
			const n = perArtist.get(a) ?? 0;
			if (n >= maxPerArtist) continue;
			perArtist.set(a, n + 1);
		}
		out.push(r.c.item);
	}
	return out;
}

/**
 * Genres « représentatifs » d'un ensemble de titres : ceux portés par au moins `share` des
 * titres, du plus fréquent au moins fréquent (au plus `max`). Sert quand la graine (un artiste)
 * n'a pas de genre propre dans Jellyfin.
 */
export function dominantGenres(trackGenres: string[][], max = 4, share = 0.3): string[] {
	const counts = new Map<string, { label: string; n: number }>();
	for (const genres of trackGenres) {
		const seen = new Set<string>();
		for (const g of genres) {
			const key = normalizeGenre(g);
			if (!key || seen.has(key)) continue;
			seen.add(key);
			const e = counts.get(key);
			if (e) e.n++;
			else counts.set(key, { label: g, n: 1 });
		}
	}
	const min = Math.max(1, Math.ceil(trackGenres.length * share));
	return [...counts.values()]
		.filter((e) => e.n >= min)
		.sort((a, b) => b.n - a.n)
		.slice(0, max)
		.map((e) => e.label);
}
