import { browser } from '$app/environment';
import type { RadioStation } from '$lib/types';

const STORAGE_KEY = 'tentacle:radios';

function loadStored(): RadioStation[] {
	if (!browser) return [];
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		if (Array.isArray(parsed)) {
			return parsed.filter(
				(s) => s && typeof s.id === 'string' && typeof s.name === 'string' && typeof s.streamUrl === 'string'
			);
		}
	} catch {
		// ignore corrupt storage
	}
	return [];
}

class RadiosStore {
	stations = $state<RadioStation[]>(loadStored());

	has(streamUrl: string): boolean {
		return this.stations.some((s) => s.streamUrl === streamUrl);
	}

	add(station: RadioStation) {
		if (this.has(station.streamUrl)) return;
		this.stations.push(station);
		this.persist();
	}

	remove(id: string) {
		this.stations = this.stations.filter((s) => s.id !== id);
		this.persist();
	}

	/** Remplace toutes les stations (hydratation depuis le profil serveur). */
	replaceAll(stations: RadioStation[]) {
		this.stations = Array.isArray(stations) ? stations : [];
		this.persist();
	}

	/** Recharge depuis le localStorage (synchro inter-onglets). */
	hydrate() {
		this.stations = loadStored();
	}

	private persist() {
		if (browser) localStorage.setItem(STORAGE_KEY, JSON.stringify(this.stations));
	}
}

export const radios = new RadiosStore();
