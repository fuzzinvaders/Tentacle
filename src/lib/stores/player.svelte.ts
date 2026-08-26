// SPDX-License-Identifier: AGPL-3.0-or-later
import { browser } from '$app/environment';
import type { Track } from '$lib/types';
import { podcastSpeeds } from '$lib/stores/podcastSpeeds.svelte';

export type RepeatMode = 'off' | 'all' | 'one';

const STORAGE_KEY = 'tentacle:player';

type PersistedPlayer = {
	queue: Track[];
	currentIndex: number;
	positionSec: number;
	volume: number;
	repeat: RepeatMode;
	shuffle: boolean;
	playbackRate: number;
};

/** Vitesses de lecture proposées (surtout utile pour les podcasts). */
export const PLAYBACK_RATES = [1, 1.25, 1.5, 1.75, 2] as const;

function loadStored(): Partial<PersistedPlayer> {
	if (!browser) return {};
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return {};
		const data = JSON.parse(raw);
		return data && typeof data === 'object' ? data : {};
	} catch {
		return {};
	}
}

/** Shared playback bus: every source (Jellyfin, radios, podcasts, playlists) enqueues into
 * this single queue, and one <audio> element (mounted once in +layout.svelte) drives it.
 *
 * L'état (file + position + réglages) est persisté en localStorage pour reprendre la lecture
 * après fermeture de l'app — comme pour les podcasts, mais ici pour TOUTES les sources
 * (notamment la bibliothèque Jellyfin, qui autrement était perdue à la fermeture). */
class PlayerStore {
	queue = $state<Track[]>([]);
	currentIndex = $state(-1);
	playing = $state(false);
	positionSec = $state(0);
	durationSec = $state(0);
	volume = $state(0.8);
	errorMessage = $state('');
	repeat = $state<RepeatMode>('off');
	shuffle = $state(false);
	playbackRate = $state(1);
	// Vitesse « de base » (musique / global), distincte de la vitesse effective : un podcast peut
	// surcharger playbackRate avec sa vitesse mémorisée sans écraser cette valeur persistée.
	private baseRate = 1;

	private saveTimer: ReturnType<typeof setTimeout> | undefined;

	constructor() {
		const s = loadStored();
		if (Array.isArray(s.queue)) this.queue = s.queue;
		if (typeof s.currentIndex === 'number') this.currentIndex = s.currentIndex;
		if (typeof s.volume === 'number') this.volume = s.volume;
		if (s.repeat === 'off' || s.repeat === 'all' || s.repeat === 'one') this.repeat = s.repeat;
		if (typeof s.shuffle === 'boolean') this.shuffle = s.shuffle;
		if (typeof s.playbackRate === 'number' && s.playbackRate > 0) {
			this.baseRate = s.playbackRate;
			this.playbackRate = s.playbackRate;
		}
		// Reprend la position du morceau courant (sans relancer la lecture : autoplay bloqué
		// par les navigateurs, et on ne veut pas démarrer tout seul à l'ouverture). L'élément
		// <audio> applique resumeSec au chargement des métadonnées → reprise à la bonne seconde.
		if (
			typeof s.positionSec === 'number' &&
			this.currentIndex >= 0 &&
			this.currentIndex < this.queue.length
		) {
			this.positionSec = s.positionSec;
			const cur = this.queue[this.currentIndex];
			if (cur) cur.resumeSec = s.positionSec;
		}
	}

	get current(): Track | null {
		return this.currentIndex >= 0 && this.currentIndex < this.queue.length
			? this.queue[this.currentIndex]
			: null;
	}

	private writeNow() {
		if (!browser) return;
		try {
			// Les fichiers locaux (URLs blob:) ne survivent pas au rechargement : on les exclut
			// de la persistance pour ne pas restaurer des pistes mortes, et on réaligne l'index.
			const kept = this.queue
				.map((t, i) => ({ t, i }))
				.filter(({ t }) => !t.streamUrl.startsWith('blob:'));
			const queue = kept.map(({ t }) => t);
			const currentIndex =
				this.currentIndex >= 0 ? kept.findIndex(({ i }) => i === this.currentIndex) : -1;
			const data: PersistedPlayer = {
				queue,
				currentIndex,
				positionSec: currentIndex >= 0 ? this.positionSec : 0,
				volume: this.volume,
				repeat: this.repeat,
				shuffle: this.shuffle,
				// On persiste la vitesse « de base » (musique), pas la surcharge podcast transitoire.
				playbackRate: this.baseRate
			};
			localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
		} catch {
			/* quota / mode privé : la persistance est un confort, pas critique. */
		}
	}

	/** Sauvegarde périodique de l'état de lecture. Appelée depuis un effect du layout qui suit
	 * file/index/position/réglages. La position changeant ~4×/s en lecture, on NE réarme PAS le
	 * minuteur à chaque appel (sinon il serait sans cesse repoussé et rien ne serait jamais
	 * sauvé) : un premier appel programme une écriture ~800 ms plus tard, capturant l'état le
	 * plus récent, puis le cycle recommence. No-op côté serveur. */
	persist() {
		if (!browser || this.saveTimer) return;
		this.saveTimer = setTimeout(() => {
			this.saveTimer = undefined;
			this.writeNow();
		}, 800);
	}

	/** Sauvegarde immédiate (app mise en arrière-plan / fermée) pour ne pas perdre les
	 * dernières secondes de position entre deux tics de l'anti-rebond. */
	saveNow() {
		if (!browser) return;
		clearTimeout(this.saveTimer);
		this.saveTimer = undefined;
		this.writeNow();
	}

	/** Add to the end of the queue without interrupting current playback. */
	enqueue(track: Track) {
		this.queue.push(track);
		if (this.currentIndex === -1) this.currentIndex = 0;
	}

	/** « Lire ensuite » : insère le titre juste après le titre courant (déplace une éventuelle
	 * occurrence existante plutôt que de la dupliquer). */
	playNext(track: Track) {
		const existing = this.queue.findIndex((t) => t.id === track.id);
		if (existing !== -1) {
			if (existing === this.currentIndex) return; // déjà le titre courant
			this.queue.splice(existing, 1);
			if (existing < this.currentIndex) this.currentIndex -= 1;
		}
		const at = this.currentIndex === -1 ? this.queue.length : this.currentIndex + 1;
		this.queue.splice(at, 0, track);
		if (this.currentIndex === -1) this.currentIndex = 0;
	}

	/** Insère plusieurs titres juste après le titre courant, dans l'ordre (« Lire ensuite »
	 * pour un album entier). */
	queueNext(tracks: Track[]) {
		if (tracks.length === 0) return;
		const at = this.currentIndex === -1 ? this.queue.length : this.currentIndex + 1;
		this.queue.splice(at, 0, ...tracks);
		if (this.currentIndex === -1) this.currentIndex = 0;
	}

	/** Déplace un titre dans la file (réordonnancement), en gardant le titre courant en lecture. */
	moveInQueue(from: number, to: number) {
		if (
			from === to ||
			from < 0 ||
			to < 0 ||
			from >= this.queue.length ||
			to >= this.queue.length
		)
			return;
		const curId = this.current?.id;
		const [item] = this.queue.splice(from, 1);
		this.queue.splice(to, 0, item);
		if (curId) this.currentIndex = this.queue.findIndex((t) => t.id === curId);
	}

	/** Remplace toute la file par une nouvelle liste et démarre au début (albums, « Tout lire »,
	 * « Titres populaires »…) — évite l'empilement des lectures précédentes dans la file. */
	playCollection(tracks: Track[]) {
		this.queue = tracks.slice();
		this.currentIndex = tracks.length > 0 ? 0 : -1;
		this.positionSec = 0;
		this.playing = tracks.length > 0;
		this.errorMessage = '';
	}

	/** Enchaînement à la fin d'un titre (lecture naturellement terminée) : on RETIRE le titre
	 * fini de la file (les titres lus ne s'y accumulent pas) puis on joue le suivant. Le bouton
	 * « suivant » manuel, lui, ne retire rien (voir next()). */
	advanceEnded() {
		if (this.queue.length === 0) return;
		// Répétition « tout » : on boucle sans rien retirer (sinon la file finirait vide).
		if (this.repeat === 'all') {
			this.next();
			return;
		}
		const finished = this.currentIndex;

		// Choix du prochain AVANT retrait, pour gérer aléatoire/répétition proprement.
		if (this.shuffle && this.queue.length > 2) {
			// Un autre titre au hasard (hors celui qui vient de finir).
			let pick: number;
			do {
				pick = Math.floor(Math.random() * this.queue.length);
			} while (pick === finished);
			// Retire le fini ; ajuste l'index du choix s'il était après.
			this.queue.splice(finished, 1);
			this.currentIndex = pick > finished ? pick - 1 : pick;
		} else {
			this.queue.splice(finished, 1);
			// Après retrait, l'index pointe déjà sur le titre suivant (décalé à la place du fini).
			// (Le cas répétition « tout » est traité plus haut par un retour anticipé.)
			if (this.currentIndex >= this.queue.length) {
				// C'était le dernier : file épuisée.
				this.playing = false;
				this.currentIndex = this.queue.length > 0 ? this.queue.length - 1 : -1;
				return;
			}
		}

		if (this.queue.length === 0) {
			this.currentIndex = -1;
			this.playing = false;
			return;
		}
		this.positionSec = this.queue[this.currentIndex].resumeSec ?? 0;
		this.playing = true;
	}

	/** Play a track immediately: jump to it in the queue (adding it if new). */
	playNow(track: Track) {
		const idx = this.queue.findIndex((t) => t.id === track.id);
		if (idx === -1) {
			this.queue.push(track);
			this.currentIndex = this.queue.length - 1;
		} else {
			this.currentIndex = idx;
		}
		this.positionSec = track.resumeSec ?? 0;
		this.playing = true;
		this.errorMessage = '';
	}

	/** Saute directement à un morceau déjà présent dans la file (clic dans la Queue Bus). */
	jumpTo(index: number) {
		if (index < 0 || index >= this.queue.length) return;
		this.currentIndex = index;
		this.positionSec = this.queue[index].resumeSec ?? 0;
		this.playing = true;
		this.errorMessage = '';
	}

	removeFromQueue(id: string) {
		const idx = this.queue.findIndex((t) => t.id === id);
		if (idx === -1) return;
		this.queue.splice(idx, 1);
		if (idx < this.currentIndex) this.currentIndex -= 1;
		else if (idx === this.currentIndex) this.currentIndex = Math.min(this.currentIndex, this.queue.length - 1);
	}

	/** Vide la file d'attente SANS interrompre la lecture en cours : on ne retire que les
	 * titres à venir/passés, le titre courant reste en lecture (seul dans la file). */
	clearQueue() {
		const cur = this.current;
		if (cur) {
			this.queue = [cur];
			this.currentIndex = 0;
		} else {
			this.queue = [];
			this.currentIndex = -1;
			this.playing = false;
		}
	}

	/** Advance to the next track. Shuffle picks a random other track; otherwise it steps
	 * forward, wrapping to the start when repeat is 'all' and stopping at the end otherwise.
	 * Repeat-'one' is handled at the <audio> layer (restart same track on end), not here — so
	 * the manual "next" button always skips even when repeating one. */
	next() {
		if (this.queue.length === 0) return;

		let nextIndex: number;
		if (this.shuffle && this.queue.length > 1) {
			do {
				nextIndex = Math.floor(Math.random() * this.queue.length);
			} while (nextIndex === this.currentIndex);
		} else {
			nextIndex = this.currentIndex + 1;
			if (nextIndex >= this.queue.length) {
				if (this.repeat === 'all') nextIndex = 0;
				else {
					this.playing = false;
					return;
				}
			}
		}

		this.currentIndex = nextIndex;
		this.positionSec = this.queue[nextIndex].resumeSec ?? 0;
		this.playing = true;
	}

	prev() {
		if (this.currentIndex > 0) {
			this.currentIndex -= 1;
			this.positionSec = 0;
			this.playing = true;
		}
	}

	togglePlay() {
		this.playing = !this.playing;
	}

	pause() {
		this.playing = false;
	}

	cycleRepeat() {
		this.repeat = this.repeat === 'off' ? 'all' : this.repeat === 'all' ? 'one' : 'off';
	}

	toggleShuffle() {
		this.shuffle = !this.shuffle;
	}

	/** Passe à la vitesse de lecture suivante (boucle sur PLAYBACK_RATES). Sur un podcast, la
	 * vitesse est mémorisée pour ce podcast ; sinon elle devient la vitesse de base (musique). */
	cycleSpeed() {
		const i = PLAYBACK_RATES.indexOf(this.playbackRate as (typeof PLAYBACK_RATES)[number]);
		const next = PLAYBACK_RATES[(i + 1) % PLAYBACK_RATES.length];
		this.playbackRate = next;
		const podcastId = this.current?.podcastMeta?.podcastId;
		if (podcastId != null) podcastSpeeds.set(podcastId, next);
		else this.baseRate = next;
	}

	/** Applique la bonne vitesse au titre courant : vitesse mémorisée du podcast (défaut 1×),
	 * sinon la vitesse de base pour la musique. Appelé à chaque changement de piste. */
	applyRateForCurrent() {
		const podcastId = this.current?.podcastMeta?.podcastId;
		this.playbackRate =
			podcastId != null ? (podcastSpeeds.get(podcastId) ?? 1) : this.baseRate;
	}
}

export const player = new PlayerStore();

if (import.meta.env.DEV && typeof window !== 'undefined') {
	// @ts-expect-error debug-only hook, dev builds only
	window.__player = player;
}
