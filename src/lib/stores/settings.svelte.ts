import { browser } from '$app/environment';
import type { SpaceId } from '$lib/stores/ui.svelte';

const STORAGE_KEY = 'tentacle:settings';

export type PodcastsSubTab = 'abonnements' | 'recents' | 'encours' | 'suivre' | 'recherche';
/** Source des podcasts : PinePods (serveur) ou flux RSS gérés directement dans l'app. */
export type PodcastSource = 'pinepods' | 'local';
export type EpisodeSortOrder = 'desc' | 'asc';
export type ThemeId = 'tentacle' | 'terminus' | 'nocturne';
/** Qualité de streaming Jellyfin : 'max' = direct/320, sinon plafond en kbps (transcode). */
export type StreamQuality = 'max' | 'high' | 'medium' | 'low';

const VALID_THEMES: readonly string[] = ['tentacle', 'terminus', 'nocturne'];

/** Plafond de débit (bit/s) par niveau — 'max' laisse le direct-play sans transcodage forcé. */
export const STREAM_BITRATE: Record<StreamQuality, number> = {
	max: 320_000,
	high: 256_000,
	medium: 192_000,
	low: 128_000
};

/** Fréquences centrales (Hz) de l'égaliseur 5 bandes. */
export const EQ_FREQUENCIES = [60, 230, 910, 3600, 14000] as const;
/** Gain d'une bande borné à ±12 dB. */
export const EQ_GAIN_LIMIT = 12;

export type Settings = {
	hideCompletedEpisodes: boolean;
	episodeSortOrder: EpisodeSortOrder;
	defaultPodcastsTab: PodcastsSubTab;
	/** Choix explicite de l'utilisateur : PinePods ou podcasts locaux (RSS gérés dans l'app). */
	podcastSource: PodcastSource;
	/** Espace ouvert au lancement. Renommé depuis `defaultSpace`, qui n'était jamais lu et
	 * dont la valeur persistée ('podcasts') aurait brusquement changé l'écran de démarrage de
	 * tous les installs existants au moment de le câbler. Nouveau nom = nouveau défaut neutre. */
	startupSpace: SpaceId;
	autoplayQueue: boolean;
	theme: ThemeId;
	streamQuality: StreamQuality;
	audioFade: boolean;
	/** Égaliseur (expérimental) : n'agit que sur les sources Jellyfin/local. */
	eqEnabled: boolean;
	/** Gain (dB) de chacune des 5 bandes EQ_FREQUENCIES. */
	eqBands: number[];
	/** Lecture sans fin : à la fin de la file Jellyfin, enchaîner un mix de titres similaires. */
	endlessPlayback: boolean;
	/** Normalisation du volume (ReplayGain) : gain auto par titre (Jellyfin/local). */
	volumeNormalization: boolean;
	/** Durée du fondu enchaîné entre titres (s ; 0 = désactivé). Musique Jellyfin/local. */
	crossfadeSec: number;
};

const DEFAULTS: Settings = {
	hideCompletedEpisodes: false,
	episodeSortOrder: 'desc',
	defaultPodcastsTab: 'encours',
	podcastSource: 'pinepods',
	startupSpace: 'home',
	autoplayQueue: true,
	theme: 'terminus',
	streamQuality: 'max',
	audioFade: true,
	eqEnabled: false,
	eqBands: [0, 0, 0, 0, 0],
	endlessPlayback: false,
	volumeNormalization: false,
	crossfadeSec: 0
};

function loadStored(): Settings {
	if (!browser) return { ...DEFAULTS };
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return { ...DEFAULTS };
		const merged: Settings = { ...DEFAULTS, ...JSON.parse(raw) };
		// Migration : l'ancien thème « phosphore » est remplacé par « nocturne » ;
		// toute valeur inconnue retombe sur le défaut (le CSS du thème n'existe plus).
		const theme = merged.theme as string;
		if (theme === 'phosphore') merged.theme = 'nocturne';
		else if (!VALID_THEMES.includes(theme)) merged.theme = DEFAULTS.theme;
		return merged;
	} catch {
		return { ...DEFAULTS };
	}
}

class SettingsStore {
	values = $state<Settings>(loadStored());

	set<K extends keyof Settings>(key: K, value: Settings[K]) {
		this.values[key] = value;
		if (browser) localStorage.setItem(STORAGE_KEY, JSON.stringify(this.values));
	}

	/** Remplace tous les réglages (hydratation depuis le profil serveur). */
	replaceAll(values: Partial<Settings>) {
		this.values = { ...DEFAULTS, ...values };
		if (browser) localStorage.setItem(STORAGE_KEY, JSON.stringify(this.values));
	}

	/** Recharge depuis le localStorage (synchro inter-onglets). */
	hydrate() {
		this.values = loadStored();
	}
}

export const settings = new SettingsStore();
