/**
 * Sélection de l'album (release group) d'un enregistrement MusicBrainz.
 * Fonction pure (pas de réseau) — isolée pour être testable.
 */

export type ResolvedAlbum = {
	releaseGroupMbid: string;
	albumTitle: string;
	artistName: string;
};

export type MbReleaseGroup = {
	id: string;
	title?: string;
	'primary-type'?: string;
	'secondary-types'?: string[];
	'first-release-date'?: string;
};

export type MbRecordingResponse = {
	title?: string;
	'artist-credit'?: { name?: string; artist?: { name?: string } }[];
	releases?: { status?: string; 'release-group'?: MbReleaseGroup }[];
};

/** Classe un release group : vrai album studio d'abord, compilations/lives en dernier. */
export function tierOf(rg: MbReleaseGroup): number {
	const primary = rg['primary-type'] ?? '';
	const secondaries = rg['secondary-types'] ?? [];
	if (primary === 'Album' && secondaries.length === 0) return 0;
	if (primary === 'EP' && secondaries.length === 0) return 1;
	if (primary === 'Single' && secondaries.length === 0) return 2;
	if (primary === 'Album') return 3; // live, compilation…
	return 4;
}

/**
 * Parmi toutes les parutions contenant ce morceau, privilégie l'album studio
 * officiel le plus ancien, puis EP, puis single, compilations/lives en dernier.
 */
export function pickBestAlbum(data: MbRecordingResponse): ResolvedAlbum | null {
	const seen = new Map<string, { rg: MbReleaseGroup; official: boolean }>();
	for (const release of data.releases ?? []) {
		const rg = release['release-group'];
		if (!rg?.id) continue;
		const official = release.status === 'Official';
		const existing = seen.get(rg.id);
		if (!existing) seen.set(rg.id, { rg, official });
		else if (official && !existing.official) existing.official = true;
	}
	if (seen.size === 0) return null;

	const best = [...seen.values()].sort((a, b) => {
		if (a.official !== b.official) return a.official ? -1 : 1;
		const tier = tierOf(a.rg) - tierOf(b.rg);
		if (tier !== 0) return tier;
		return (a.rg['first-release-date'] ?? '9999').localeCompare(b.rg['first-release-date'] ?? '9999');
	})[0];

	return {
		releaseGroupMbid: best.rg.id,
		albumTitle: best.rg.title ?? data.title ?? '',
		artistName: data['artist-credit']?.[0]?.name ?? data['artist-credit']?.[0]?.artist?.name ?? ''
	};
}
