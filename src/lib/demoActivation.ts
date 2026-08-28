// SPDX-License-Identifier: AGPL-3.0-or-later
import { jellyfin } from '$lib/stores/jellyfin.svelte';
import { localPodcasts } from '$lib/stores/localPodcasts.svelte';
import { radios } from '$lib/stores/radios.svelte';
import { settings } from '$lib/stores/settings.svelte';
import { DEMO_BASE_URL, DEMO_USER_ID, demoPodcastFeeds, demoRadios, isDemo } from '$lib/demo';

/**
 * Peuple bibliothèque, podcasts et radios avec le catalogue de démonstration. Deux
 * déclencheurs, même effet — voir DemoInvite.svelte (bandeau, clic explicite) et
 * +layout.svelte (automatique, dès qu'on est connecté avec le compte demo/demo).
 *
 * Idempotent : ne fait rien si déjà actif, sûr à appeler à chaque montage du layout.
 */
export function activateDemoMode(): void {
	if (isDemo(jellyfin.connection)) return;
	jellyfin.connect({
		baseUrl: DEMO_BASE_URL,
		token: 'demo',
		userId: DEMO_USER_ID,
		serverName: 'Démonstration'
	});
	// Podcasts et radios n'ont pas de notion de connexion à part (voir demo.ts) : on peuple
	// directement leurs stores, comme le ferait un visiteur qui viendrait de s'abonner/ajouter
	// ces éléments lui-même.
	settings.set('podcastSource', 'local');
	for (const { podcastId, meta } of demoPodcastFeeds()) localPodcasts.upsert(podcastId, meta);
	for (const station of demoRadios()) radios.add(station);
}
