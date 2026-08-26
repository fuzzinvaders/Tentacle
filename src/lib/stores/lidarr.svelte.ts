import { browser } from '$app/environment';

export type LidarrConnection = {
	baseUrl: string;
	apiKey: string;
};

const STORAGE_KEY = 'tentacle:lidarr';

function loadStored(): LidarrConnection | null {
	if (!browser) return null;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		if (parsed && typeof parsed.baseUrl === 'string' && typeof parsed.apiKey === 'string') {
			return parsed as LidarrConnection;
		}
	} catch {
		// ignore corrupt storage
	}
	return null;
}

class LidarrStore {
	connection = $state<LidarrConnection | null>(loadStored());

	get connected() {
		return this.connection !== null;
	}

	connect(conn: LidarrConnection) {
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

export const lidarr = new LidarrStore();
