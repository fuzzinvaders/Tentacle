import { browser } from '$app/environment';

const STORAGE_KEY = 'tentacle:alarm';

/** Réveil programmé (mobile uniquement — notification locale planifiée, voir alarm.ts).
 * `days` : 0 (dimanche) à 6 (samedi) ; vide = tous les jours. `radioStationId` : '' = pas de
 * source précise, on se contente de reprendre la dernière lecture connue au moment du tap. */
export type AlarmSettings = {
	enabled: boolean;
	hour: number;
	minute: number;
	days: number[];
	radioStationId: string;
};

const DEFAULTS: AlarmSettings = {
	enabled: false,
	hour: 7,
	minute: 0,
	days: [],
	radioStationId: ''
};

function loadStored(): AlarmSettings {
	if (!browser) return { ...DEFAULTS };
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return { ...DEFAULTS };
		return { ...DEFAULTS, ...JSON.parse(raw) };
	} catch {
		return { ...DEFAULTS };
	}
}

class AlarmStore {
	values = $state<AlarmSettings>(loadStored());

	set<K extends keyof AlarmSettings>(key: K, value: AlarmSettings[K]) {
		this.values[key] = value;
		this.save();
	}

	private save() {
		if (!browser) return;
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(this.values));
		} catch {
			/* quota / mode privé : confort, non critique */
		}
	}
}

export const alarm = new AlarmStore();
