import type { RadioStation, Track } from '$lib/types';

export function stationToTrack(station: RadioStation): Track {
	return {
		id: `radio-${station.id}`,
		source: 'radio',
		title: station.name,
		subtitle: station.country ? `Radio en direct · ${station.country}` : 'Radio en direct',
		artworkUrl: station.faviconUrl,
		streamUrl: station.streamUrl
	};
}
