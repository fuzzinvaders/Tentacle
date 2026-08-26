import type { PinePodsEpisode, Track } from '$lib/types';

/** Fonction pure (testable sans store réactif ni DOM — voir podcastTrack.test.ts). `isLocal`
 * indique un abonnement « local » (flux RSS géré dans l'app, sans PinePods) : les appelants
 * connaissent déjà la source active (réglage `podcastSource`) et la transmettent explicitement,
 * plutôt que d'importer ici le store localPodcasts (qui casserait la testabilité pure du fichier —
 * $app/environment et les runes n'y sont pas résolus en test). */
export function episodeToTrack(ep: PinePodsEpisode, isLocal = false): Track {
	return {
		id: `podcast-${ep.episodeid}`,
		source: 'podcast',
		title: ep.episodetitle,
		subtitle: ep.podcastname,
		artworkUrl: ep.episodeartwork,
		streamUrl: ep.episodeurl,
		durationSec: ep.episodeduration,
		// Un épisode terminé se rejoue depuis le début (sinon on reprendrait à ~97 %, sa
		// dernière position enregistrée). Sinon, on reprend là où on s'était arrêté.
		resumeSec: !ep.completed && ep.listenduration > 0 ? ep.listenduration : 0,
		podcastMeta: { podcastId: ep.podcastid, episodeId: ep.episodeid, local: isLocal },
		chaptersUrl: ep.chaptersUrl
	};
}
