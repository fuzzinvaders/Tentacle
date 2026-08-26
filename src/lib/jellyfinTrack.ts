import type { JellyfinConnection } from '$lib/stores/jellyfin.svelte';
import type { JellyfinItem, Track } from '$lib/types';
import { primaryImageUrl, songStreamUrl } from '$lib/api/jellyfin';
import { settings, STREAM_BITRATE } from '$lib/stores/settings.svelte';
import { localSrc } from '$lib/downloads';

const TICKS_PER_SEC = 10_000_000;

/** Adapts a Jellyfin audio item into a Track for the shared player bus. */
export function songToTrack(conn: JellyfinConnection, item: JellyfinItem): Track {
	const artist = item.Artists?.length ? item.Artists.join(', ') : (item.AlbumArtist ?? '');
	const subtitle = [artist, item.Album].filter(Boolean).join(' · ');

	// Prefer the album cover for artwork; fall back to the track's own image.
	const useAlbumArt = Boolean(item.AlbumId && item.AlbumPrimaryImageTag);
	const imageId = useAlbumArt ? item.AlbumId! : item.Id;
	const imageTag = useAlbumArt ? item.AlbumPrimaryImageTag : item.ImageTags?.Primary;

	return {
		id: `jellyfin-${item.Id}`,
		source: 'jellyfin',
		title: item.Name,
		subtitle,
		artist: artist || undefined,
		album: item.Album || undefined,
		artworkUrl: imageTag ? primaryImageUrl(conn, imageId, imageTag) : undefined,
		// Titre téléchargé → lecture depuis le fichier local (hors-ligne) ; sinon flux réseau.
		streamUrl:
			localSrc(item.Id) ?? songStreamUrl(conn, item.Id, STREAM_BITRATE[settings.values.streamQuality]),
		durationSec: item.RunTimeTicks ? Math.round(item.RunTimeTicks / TICKS_PER_SEC) : undefined,
		gainDb: typeof item.NormalizationGain === 'number' ? item.NormalizationGain : undefined
	};
}
