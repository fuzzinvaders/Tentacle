import { MediaSession } from '@capgo/capacitor-media-session';
import type {
	MetadataOptions,
	MediaSessionAction,
	MediaSessionPlaybackState,
	ActionHandler,
	PositionStateOptions
} from '@capgo/capacitor-media-session';

/**
 * Fine couche au-dessus du plugin @capgo/capacitor-media-session.
 *
 * - Sur le WEB : le plugin délègue à `navigator.mediaSession` (comportement identique à avant).
 * - Sur ANDROID (WebView Capacitor) : le plugin adosse ces appels à une VRAIE MediaSession
 *   native + service au premier plan → l'écran verrouillé et surtout les touches Bluetooth
 *   ciblent Tentacle de façon fiable (au lieu de partir vers un autre lecteur).
 *
 * Tout est « best-effort » (promesses avalées) : la session média est décorative, un échec
 * ne doit jamais casser la lecture ni l'UI. Le plugin lève `unavailable` là où l'API manque.
 */
export const media = {
	setMetadata(options: MetadataOptions): void {
		MediaSession.setMetadata(options).catch(() => {});
	},
	setPlaybackState(playbackState: MediaSessionPlaybackState): void {
		MediaSession.setPlaybackState({ playbackState }).catch(() => {});
	},
	setActionHandler(action: MediaSessionAction, handler: ActionHandler | null): void {
		MediaSession.setActionHandler({ action }, handler).catch(() => {});
	},
	setPositionState(options: PositionStateOptions): void {
		MediaSession.setPositionState(options).catch(() => {});
	}
};
