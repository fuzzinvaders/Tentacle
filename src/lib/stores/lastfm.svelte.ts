import { browser } from '$app/environment';

/** Clé API + secret partagé créés par l'utilisateur sur last.fm/api/account/create (une app
 * par installation auto-hébergée), plus la clé de session obtenue via le mini-flux
 * d'autorisation (auth.getToken → l'utilisateur autorise sur last.fm → auth.getSession). */
export type LastfmConnection = {
	apiKey: string;
	secret: string;
	sessionKey: string;
	username: string;
};

const STORAGE_KEY = 'tentacle:lastfm';

function loadStored(): LastfmConnection | null {
	if (!browser) return null;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		if (
			parsed &&
			typeof parsed.apiKey === 'string' &&
			typeof parsed.secret === 'string' &&
			typeof parsed.sessionKey === 'string' &&
			typeof parsed.username === 'string'
		) {
			return parsed as LastfmConnection;
		}
	} catch {
		// ignore corrupt storage
	}
	return null;
}

class LastfmStore {
	connection = $state<LastfmConnection | null>(loadStored());

	get connected() {
		return this.connection !== null;
	}

	connect(conn: LastfmConnection) {
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

export const lastfm = new LastfmStore();
