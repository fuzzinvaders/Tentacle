import { settings } from '$lib/stores/settings.svelte';

export type SpaceId = 'home' | 'library' | 'radios' | 'podcasts' | 'config';

class UiStore {
	/**
	 * Espace affiché. Initialisé depuis la préférence `startupSpace` — le store `settings`
	 * est hydraté depuis le localStorage au chargement du module, donc la valeur est déjà
	 * disponible ici, de façon synchrone.
	 *
	 * On ne réapplique volontairement PAS la préférence si le profil serveur arrive plus tard
	 * (version web) : cela déplacerait l'utilisateur alors qu'il a peut-être déjà navigué.
	 * La Configuration n'est jamais un espace de démarrage (elle s'ouvre à la demande).
	 */
	activeSpace = $state<SpaceId>(
		settings.values.startupSpace === 'config' ? 'home' : settings.values.startupSpace
	);
}

export const ui = new UiStore();
