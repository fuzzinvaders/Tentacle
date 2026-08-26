import { browser } from '$app/environment';

export type ListenBrainzConnection = {
	/** Personal API token (from listenbrainz.org/profile). */
	token: string;
	/** Resolved from the token via /1/validate-token. */
	userName: string;
};

const STORAGE_KEY = 'tentacle:listenbrainz';

function loadStored(): ListenBrainzConnection | null {
	if (!browser) return null;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		if (parsed && typeof parsed.token === 'string' && typeof parsed.userName === 'string') {
			return parsed as ListenBrainzConnection;
		}
	} catch {
		// ignore corrupt storage
	}
	return null;
}

class ListenBrainzStore {
	connection = $state<ListenBrainzConnection | null>(loadStored());

	get connected() {
		return this.connection !== null;
	}

	connect(conn: ListenBrainzConnection) {
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

export const listenbrainz = new ListenBrainzStore();
