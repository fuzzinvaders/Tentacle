import { browser } from '$app/environment';
import type { PinePodsConnection } from '$lib/types';

const STORAGE_KEY = 'tentacle:pinepods';

function loadStored(): PinePodsConnection | null {
	if (!browser) return null;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		if (parsed && typeof parsed.baseUrl === 'string' && typeof parsed.apiKey === 'string') {
			return parsed as PinePodsConnection;
		}
	} catch {
		// ignore corrupt storage
	}
	return null;
}

class PinePodsStore {
	connection = $state<PinePodsConnection | null>(loadStored());

	get connected() {
		return this.connection !== null;
	}

	connect(conn: PinePodsConnection) {
		this.connection = conn;
		if (browser) localStorage.setItem(STORAGE_KEY, JSON.stringify(conn));
	}

	disconnect() {
		this.connection = null;
		if (browser) localStorage.removeItem(STORAGE_KEY);
	}

	/** Recharge depuis le localStorage (synchro inter-onglets). */
	hydrate() {
		this.connection = loadStored();
	}
}

export const pinepods = new PinePodsStore();
