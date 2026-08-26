import { browser } from '$app/environment';

export type JellyfinConnection = {
	baseUrl: string;
	token: string;
	userId: string;
	serverName?: string;
};

const STORAGE_KEY = 'tentacle:jellyfin';

function loadStored(): JellyfinConnection | null {
	if (!browser) return null;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		if (parsed && typeof parsed.baseUrl === 'string' && typeof parsed.token === 'string') {
			return parsed as JellyfinConnection;
		}
	} catch {
		// ignore corrupt storage
	}
	return null;
}

class JellyfinStore {
	connection = $state<JellyfinConnection | null>(loadStored());

	get connected() {
		return this.connection !== null;
	}

	connect(conn: JellyfinConnection) {
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

export const jellyfin = new JellyfinStore();
