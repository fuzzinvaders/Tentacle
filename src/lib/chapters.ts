/**
 * Chapitres de podcast au format Podcasting 2.0 (JSON pointé par `<podcast:chapters url="…">`
 * dans le flux RSS — voir rss.ts). Fonctions pures, testables sans réseau.
 * Spec : https://github.com/Podcastindex-org/podcast-namespace/blob/main/chapters/jsonChapters.md
 */

export type Chapter = {
	startTime: number;
	title: string;
	img?: string;
	url?: string;
};

/** Parse un document JSON de chapitres. Tolérant : ignore silencieusement les entrées
 * malformées (startTime manquant/négatif, titre absent) plutôt que de tout rejeter. */
export function parseChaptersJson(raw: string): Chapter[] {
	let data: unknown;
	try {
		data = JSON.parse(raw);
	} catch {
		return [];
	}
	const arr = (data as { chapters?: unknown } | null)?.chapters;
	if (!Array.isArray(arr)) return [];
	return arr
		.map((c): Chapter | null => {
			const rec = c as Record<string, unknown>;
			const startTime = Number(rec?.startTime);
			const title = typeof rec?.title === 'string' ? rec.title : '';
			if (!Number.isFinite(startTime) || startTime < 0 || !title) return null;
			return {
				startTime,
				title,
				img: typeof rec?.img === 'string' ? rec.img : undefined,
				url: typeof rec?.url === 'string' ? rec.url : undefined
			};
		})
		.filter((c): c is Chapter => c !== null)
		.sort((a, b) => a.startTime - b.startTime);
}

/** Index du chapitre actif pour une position (s) : dernier chapitre dont startTime ≤ position.
 * -1 avant le premier. Recherche dichotomique (appelée à chaque tick) — même principe que
 * `currentLineIndex` pour les paroles (lrc.ts), types distincts (startTime vs time). */
export function currentChapterIndex(chapters: Chapter[], posSec: number): number {
	let lo = 0;
	let hi = chapters.length - 1;
	let res = -1;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		if (chapters[mid].startTime <= posSec) {
			res = mid;
			lo = mid + 1;
		} else {
			hi = mid - 1;
		}
	}
	return res;
}
