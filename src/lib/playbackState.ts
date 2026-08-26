/**
 * Détection d'une pause « externe » : l'application se croit en lecture alors que l'élément
 * audio est réellement en pause.
 *
 * Ça arrive quand le système reprend le focus audio sans passer par l'app : instruction GPS,
 * appel entrant, son du véhicule, autre application. L'élément est mis en pause, mais aucun
 * code de l'app n'en est informé — l'état interne et la réalité divergent.
 *
 * La conséquence est visible : une commande « lecture » (bouton du volant, écran verrouillé)
 * qui se contente d'écrire `playing = true` ne change alors rien, puisque la valeur est déjà
 * `true`. D'où le symptôme « il faut appuyer play/play/pause/play avant que ça reprenne ».
 *
 * Fonction pure, extraite du layout pour être testable (voir playbackState.test.ts).
 */

/** Le peu qu'on a besoin de savoir d'un HTMLAudioElement pour trancher. */
export type MediaSnapshot = {
	paused: boolean;
	/** `HTMLMediaElement.readyState` : ≥ 2 (HAVE_CURRENT_DATA) = métadonnées et données prêtes. */
	readyState: number;
	currentTime: number;
	ended: boolean;
};

/** Seuil `HAVE_CURRENT_DATA` : en dessous, l'élément est encore en train de charger. */
export const READY_ENOUGH = 2;

/**
 * L'élément est-il en pause pour une raison EXTERNE, alors que l'app se croit en lecture ?
 *
 * Les trois gardes évitent les faux positifs, tous rencontrés lors d'un fonctionnement normal :
 *  - `readyState >= 2` : juste après un `load()` (changement de piste, relance du chien de
 *    garde), l'élément est légitimement en pause le temps de charger ;
 *  - `currentTime > 0` : une piste tout juste chargée et pas encore démarrée n'est pas une
 *    interruption ;
 *  - `!ended` : une fin de piste naturelle est gérée par `onEnded`, pas ici.
 */
export function isExternallyPaused(snapshot: MediaSnapshot, appThinksPlaying: boolean): boolean {
	if (!appThinksPlaying) return false;
	return (
		snapshot.paused &&
		snapshot.readyState >= READY_ENOUGH &&
		snapshot.currentTime > 0 &&
		!snapshot.ended
	);
}
