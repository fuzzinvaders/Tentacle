import { describe, it, expect } from 'vitest';
import { isExternallyPaused, type MediaSnapshot } from './playbackState';

/** Élément en pleine lecture : rien d'anormal. */
function playing(overrides: Partial<MediaSnapshot> = {}): MediaSnapshot {
	return { paused: false, readyState: 4, currentTime: 42, ended: false, ...overrides };
}

describe('isExternallyPaused', () => {
	it('détecte la pause externe : on croit jouer, mais l’élément est en pause en pleine piste', () => {
		// Le cas réel : l'autoradio a pris le focus audio (GPS, appel) en cours de lecture.
		expect(isExternallyPaused(playing({ paused: true }), true)).toBe(true);
	});

	it('ne signale rien quand la lecture est effectivement en cours', () => {
		expect(isExternallyPaused(playing(), true)).toBe(false);
	});

	it('ne signale rien quand l’app se sait déjà en pause', () => {
		// Pause demandée par l'utilisateur : les deux états sont d'accord, rien à réconcilier.
		expect(isExternallyPaused(playing({ paused: true }), false)).toBe(false);
	});

	it('ignore une piste encore en chargement (readyState < 2)', () => {
		// Juste après load() lors d'un changement de piste : en pause, mais c'est normal.
		expect(isExternallyPaused(playing({ paused: true, readyState: 0, currentTime: 0 }), true)).toBe(false);
		expect(isExternallyPaused(playing({ paused: true, readyState: 1, currentTime: 5 }), true)).toBe(false);
	});

	it('ignore une piste chargée mais pas encore démarrée (currentTime à 0)', () => {
		expect(isExternallyPaused(playing({ paused: true, currentTime: 0 }), true)).toBe(false);
	});

	it('ignore une fin de piste naturelle (gérée par onEnded)', () => {
		expect(isExternallyPaused(playing({ paused: true, ended: true }), true)).toBe(false);
	});

	it('accepte le seuil exact readyState = 2', () => {
		expect(isExternallyPaused(playing({ paused: true, readyState: 2 }), true)).toBe(true);
	});
});
