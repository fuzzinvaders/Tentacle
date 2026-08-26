import type { LBPlaylist, LBTrack } from '$lib/types';

/**
 * Parsing du format JSPF (JSON Playlist Format) renvoyé par ListenBrainz.
 * Fonctions pures (aucun réseau) — isolées ici pour être testables.
 */

/** Extrait le MBID final d'un identifiant ListenBrainz/MusicBrainz (chaîne ou tableau). */
export function extractMbid(identifier: unknown): string {
	const first = Array.isArray(identifier) ? identifier[0] : identifier;
	if (typeof first !== 'string') return '';
	const parts = first.split('/').filter(Boolean);
	return parts[parts.length - 1] ?? '';
}

/** Réduit un fragment HTML en texte brut (descriptions de playlists). */
export function stripHtml(text?: string): string | undefined {
	if (!text) return undefined;
	return text.replace(/<[^>]*>/g, '').trim() || undefined;
}

export type JspfPlaylist = {
	title?: string;
	identifier?: string | string[];
	annotation?: string;
	track?: unknown[];
};

export type JspfTrack = {
	title?: string;
	creator?: string;
	album?: string;
	identifier?: string | string[];
};

function parsePlaylistSummary(entry: { playlist?: JspfPlaylist } | JspfPlaylist): LBPlaylist | null {
	const p: JspfPlaylist = 'playlist' in entry && entry.playlist ? entry.playlist : (entry as JspfPlaylist);
	const mbid = extractMbid(p.identifier);
	if (!mbid) return null;
	return {
		mbid,
		title: p.title?.trim() || 'Playlist sans titre',
		description: stripHtml(p.annotation),
		trackCount: Array.isArray(p.track) ? p.track.length : undefined
	};
}

/** Liste de playlists (réponse `.../playlists`) → résumés, en ignorant les entrées sans MBID. */
export function parsePlaylistList(data: { playlists?: unknown[] }): LBPlaylist[] {
	const raw = Array.isArray(data.playlists) ? data.playlists : [];
	return raw
		.map((entry) => parsePlaylistSummary(entry as { playlist?: JspfPlaylist }))
		.filter((p): p is LBPlaylist => p !== null);
}

export function parseTrack(t: JspfTrack): LBTrack {
	const ids = Array.isArray(t.identifier) ? t.identifier : t.identifier ? [t.identifier] : [];
	const recUrl = ids.find((u) => typeof u === 'string' && u.includes('/recording/'));
	return {
		title: t.title?.trim() ?? '',
		artist: t.creator?.trim() ?? '',
		album: t.album?.trim() || undefined,
		recordingMbid: recUrl ? extractMbid(recUrl) : undefined
	};
}

/** Pistes d'une playlist (réponse `/playlist/{mbid}`), en ignorant celles sans titre. */
export function parsePlaylistTracks(data: { playlist?: { track?: JspfTrack[] } }): LBTrack[] {
	const tracks = data.playlist?.track ?? [];
	return tracks.map(parseTrack).filter((t) => t.title);
}
