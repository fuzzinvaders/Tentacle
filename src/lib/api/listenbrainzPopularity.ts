/**
 * Parsing pur de la réponse « top recordings » (popularité ListenBrainz). Isolé ici, sans
 * dépendance à $lib, pour être testable en unités (les modules important $lib/http ne sont
 * pas résolus par vitest).
 */

export type PopularTrack = {
	title: string;
	artist: string;
	recordingMbid?: string;
	listenCount?: number;
};

/**
 * L'API renvoie normalement un tableau, mais on accepte aussi un éventuel enrobage
 * {payload:{recordings}} / {recordings}. La liste arrive déjà triée par popularité :
 * on préserve l'ordre.
 */
export function parseTopRecordings(data: unknown): PopularTrack[] {
	const d = data as Record<string, unknown> | unknown[];
	const arr: unknown[] = Array.isArray(d)
		? d
		: Array.isArray((d as { payload?: { recordings?: unknown[] } })?.payload?.recordings)
			? (d as { payload: { recordings: unknown[] } }).payload.recordings
			: Array.isArray((d as { recordings?: unknown[] })?.recordings)
				? (d as { recordings: unknown[] }).recordings
				: [];
	const out: PopularTrack[] = [];
	for (const item of arr) {
		if (!item || typeof item !== 'object') continue;
		const r = item as Record<string, unknown>;
		const rawTitle = r.recording_name ?? r.title ?? r.name;
		if (typeof rawTitle !== 'string' || !rawTitle.trim()) continue;
		out.push({
			title: rawTitle.trim(),
			artist: typeof r.artist_name === 'string' ? r.artist_name : '',
			recordingMbid: typeof r.recording_mbid === 'string' ? r.recording_mbid : undefined,
			listenCount: typeof r.total_listen_count === 'number' ? r.total_listen_count : undefined
		});
	}
	return out;
}
