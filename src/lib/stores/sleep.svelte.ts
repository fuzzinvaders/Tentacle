import { browser } from '$app/environment';
import { player } from '$lib/stores/player.svelte';

/**
 * Minuteur de sommeil : met la lecture en pause après un délai, ou à la fin du titre en cours.
 * Purement local/éphémère (non persisté).
 */
class SleepStore {
	/** Secondes restantes (null = pas de minuteur par durée). */
	remainingSec = $state<number | null>(null);
	/** Mode « arrêt à la fin du titre courant ». */
	endOfTrack = $state(false);

	private timer: ReturnType<typeof setInterval> | undefined;

	/**
	 * Comment arrêter la lecture à l'échéance. Le layout y installe un fondu descendant : couper
	 * net est désagréable pour un minuteur d'endormissement, c'en est même le contraire du but.
	 * Le store, lui, n'a pas accès à l'élément audio — d'où ce point d'accroche plutôt qu'un
	 * couplage. Sans handler installé, on retombe sur une pause sèche.
	 */
	private stopHandler: (() => void) | null = null;

	setStopHandler(fn: (() => void) | null) {
		this.stopHandler = fn;
	}

	private stop() {
		if (this.stopHandler) this.stopHandler();
		else player.pause();
	}

	get active(): boolean {
		return this.remainingSec !== null || this.endOfTrack;
	}

	/** Programme l'arrêt dans `min` minutes. */
	setMinutes(min: number) {
		this.endOfTrack = false;
		this.remainingSec = Math.max(1, Math.round(min * 60));
		this.clear();
		if (!browser) return;
		this.timer = setInterval(() => {
			if (this.remainingSec === null) return;
			this.remainingSec -= 1;
			if (this.remainingSec <= 0) {
				this.stop();
				this.cancel();
			}
		}, 1000);
	}

	/** Programme l'arrêt à la fin du titre en cours. */
	setEndOfTrack() {
		this.cancel();
		this.endOfTrack = true;
	}

	/** À appeler quand un titre se termine : stoppe si mode « fin du titre ». Renvoie true si stoppé. */
	onTrackEnded(): boolean {
		if (this.endOfTrack) {
			this.stop();
			this.cancel();
			return true;
		}
		return false;
	}

	cancel() {
		this.clear();
		this.remainingSec = null;
		this.endOfTrack = false;
	}

	private clear() {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = undefined;
		}
	}
}

export const sleep = new SleepStore();
