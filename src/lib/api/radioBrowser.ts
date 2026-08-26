import type { RadioBrowserStation } from '$lib/types';
import { ApiError, fetchWithTimeout } from '$lib/http';

/**
 * Radio Browser (https://api.radio-browser.info) : annuaire communautaire de radios,
 * gratuit et sans clé API. L'API est servie par plusieurs miroirs — on les essaie dans
 * l'ordre et on mémorise le premier qui répond pour la suite de la session.
 */
const MIRRORS = [
	'https://de1.api.radio-browser.info',
	'https://de2.api.radio-browser.info',
	'https://fi1.api.radio-browser.info'
];

let workingMirror: string | null = null;

async function radioBrowserGet(path: string): Promise<Response> {
	const candidates = workingMirror
		? [workingMirror, ...MIRRORS.filter((m) => m !== workingMirror)]
		: MIRRORS;
	let lastError: unknown = null;
	for (const mirror of candidates) {
		try {
			const res = await fetchWithTimeout(`${mirror}${path}`, {
				headers: { 'User-Agent': 'Tentacle/0.1' }
			});
			if (res.ok) {
				workingMirror = mirror;
				return res;
			}
			lastError = new ApiError(`Radio Browser a répondu ${res.status}.`, res.status);
		} catch (err) {
			lastError = err;
		}
	}
	throw lastError instanceof Error
		? lastError
		: new ApiError('Aucun miroir Radio Browser ne répond.');
}

/** Recherche par nom, triée par votes (les stations mortes sont exclues). */
export async function searchStations(term: string, limit = 30): Promise<RadioBrowserStation[]> {
	const params = new URLSearchParams({
		name: term,
		limit: String(limit),
		hidebroken: 'true',
		order: 'votes',
		reverse: 'true'
	});
	const res = await radioBrowserGet(`/json/stations/search?${params}`);
	return (await res.json()) as RadioBrowserStation[];
}

/** Signale une écoute à Radio Browser (compteur de popularité). Best-effort, jamais bloquant. */
export function reportStationClick(stationUuid: string): void {
	radioBrowserGet(`/json/url/${stationUuid}`).catch(() => {});
}
