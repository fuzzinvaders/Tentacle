import { jellyfin, type JellyfinConnection } from '$lib/stores/jellyfin.svelte';
import { pinepods } from '$lib/stores/pinepods.svelte';
import { listenbrainz, type ListenBrainzConnection } from '$lib/stores/listenbrainz.svelte';
import { lastfm, type LastfmConnection } from '$lib/stores/lastfm.svelte';
import { lidarr, type LidarrConnection } from '$lib/stores/lidarr.svelte';
import { settings, type Settings } from '$lib/stores/settings.svelte';
import { radios } from '$lib/stores/radios.svelte';
import { isDemo } from '$lib/demo';
import type { PinePodsConnection, RadioStation } from '$lib/types';

/**
 * Synchronisation du profil utilisateur (connexions + préférences + radios)
 * avec le serveur, pour que la config suive l'utilisateur d'un navigateur à
 * l'autre sur la version web. Sur mobile (app statique, sans serveur), rien de
 * tout ceci n'est déclenché : les stores restent en localStorage seul.
 *
 * ⚠️ Le profil contient les tokens/clés API des sources : il est stocké côté
 * serveur dans le fichier des comptes (DATA_DIR/users.json) et n'est servi
 * qu'à son propriétaire authentifié via /api/profile.
 */

export type Profile = {
	jellyfin: JellyfinConnection | null;
	pinepods: PinePodsConnection | null;
	listenbrainz: ListenBrainzConnection | null;
	lastfm: LastfmConnection | null;
	lidarr: LidarrConnection | null;
	settings: Settings;
	radios: RadioStation[];
};

/**
 * État de synchro exposé à l'UI :
 * - error  : la dernière sauvegarde/chargement a échoué (badge « non synchronisé ») ;
 * - loaded : le profil serveur a fini de charger (web) → évite le flash de config
 *   locale/vide avant hydratation. Reste false uniquement pendant ce court instant.
 */
export const syncState = $state<{ error: boolean; loaded: boolean }>({ error: false, loaded: false });

/** Recharge tous les stores synchronisés depuis le localStorage (synchro inter-onglets). */
export function hydrateFromLocalStorage() {
	jellyfin.hydrate();
	pinepods.hydrate();
	listenbrainz.hydrate();
	lastfm.hydrate();
	lidarr.hydrate();
	settings.hydrate();
	radios.hydrate();
}

/** Lit l'état courant de tous les stores synchronisés (déclenche le suivi réactif). */
export function buildProfile(): Profile {
	return {
		jellyfin: jellyfin.connection,
		pinepods: pinepods.connection,
		listenbrainz: listenbrainz.connection,
		lastfm: lastfm.connection,
		lidarr: lidarr.connection,
		settings: settings.values,
		radios: radios.stations
	};
}

export type Connections = Pick<
	Profile,
	'jellyfin' | 'pinepods' | 'listenbrainz' | 'lastfm' | 'lidarr'
>;

/**
 * Connexions aux sources (URL des serveurs, jetons, clés API) pour l'export d'une sauvegarde.
 * La connexion de démonstration n'en fait pas partie : c'est un artefact local, pas un serveur.
 */
export function buildConnections(): Connections {
	const jf = jellyfin.connection;
	return {
		jellyfin: jf && !isDemo(jf) ? jf : null,
		pinepods: pinepods.connection,
		listenbrainz: listenbrainz.connection,
		lastfm: lastfm.connection,
		lidarr: lidarr.connection
	};
}

const isStr = (v: unknown): v is string => typeof v === 'string';
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';

/**
 * Applique les connexions d'une sauvegarde importée. Contrairement à `applyProfile`, c'est
 * ADDITIF : une source absente du fichier n'est pas déconnectée (une sauvegarde faite sans les
 * identifiants ne doit pas vider ceux déjà saisis sur l'appareil).
 *
 * Le fichier vient de l'extérieur : chaque connexion est validée (forme + chaînes non vides)
 * avant d'être appliquée, plutôt que d'écrire n'importe quoi dans le stockage.
 *
 * `native` : Last.fm et Lidarr passent par le serveur Tentacle (signature / relais, voir la
 * doc) et n'existent donc pas dans l'application Android — les connecter y laisserait une
 * source « connectée » qui ne peut jamais fonctionner.
 *
 * Renvoie les noms des sources effectivement connectées.
 */
export function applyConnections(c: unknown, opts: { native: boolean }): string[] {
	if (!isObj(c)) return [];
	const done: string[] = [];

	const jf = c.jellyfin;
	if (isObj(jf) && isStr(jf.baseUrl) && jf.baseUrl && isStr(jf.token) && isStr(jf.userId)) {
		const conn: JellyfinConnection = {
			baseUrl: jf.baseUrl,
			token: jf.token,
			userId: jf.userId,
			serverName: isStr(jf.serverName) ? jf.serverName : undefined
		};
		if (!isDemo(conn)) {
			jellyfin.connect(conn);
			done.push('Jellyfin');
		}
	}

	const pp = c.pinepods;
	if (isObj(pp) && isStr(pp.baseUrl) && pp.baseUrl && isStr(pp.apiKey) && typeof pp.userId === 'number') {
		pinepods.connect({ baseUrl: pp.baseUrl, apiKey: pp.apiKey, userId: pp.userId });
		done.push('PinePods');
	}

	const lb = c.listenbrainz;
	if (isObj(lb) && isStr(lb.token) && lb.token && isStr(lb.userName)) {
		listenbrainz.connect({ token: lb.token, userName: lb.userName });
		done.push('ListenBrainz');
	}

	if (!opts.native) {
		const lf = c.lastfm;
		if (
			isObj(lf) &&
			isStr(lf.apiKey) &&
			isStr(lf.secret) &&
			isStr(lf.sessionKey) &&
			isStr(lf.username)
		) {
			lastfm.connect({
				apiKey: lf.apiKey,
				secret: lf.secret,
				sessionKey: lf.sessionKey,
				username: lf.username
			});
			done.push('Last.fm');
		}

		const ld = c.lidarr;
		if (isObj(ld) && isStr(ld.baseUrl) && ld.baseUrl && isStr(ld.apiKey)) {
			lidarr.connect({ baseUrl: ld.baseUrl, apiKey: ld.apiKey });
			done.push('Lidarr');
		}
	}

	return done;
}

/** Hydrate les stores depuis un profil serveur (écrase l'état local courant). */
function applyProfile(p: Partial<Profile> | null) {
	if (!p || typeof p !== 'object') return;

	if (p.jellyfin) jellyfin.connect(p.jellyfin);
	else jellyfin.disconnect();

	if (p.pinepods) pinepods.connect(p.pinepods);
	else pinepods.disconnect();

	if (p.listenbrainz) listenbrainz.connect(p.listenbrainz);
	else listenbrainz.disconnect();

	if (p.lastfm) lastfm.connect(p.lastfm);
	else lastfm.disconnect();

	if (p.lidarr) lidarr.connect(p.lidarr);
	else lidarr.disconnect();

	if (p.settings) settings.replaceAll(p.settings);
	if (Array.isArray(p.radios)) radios.replaceAll(p.radios);
}

// Drapeaux de contrôle NON réactifs (ne doivent pas créer de dépendance dans
// l'effect d'auto-sauvegarde du layout).
let ready = false;
let saveTimer: ReturnType<typeof setTimeout> | undefined;

async function saveNow() {
	try {
		const res = await fetch('/api/profile', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(buildProfile())
		});
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		syncState.error = false;
	} catch (err) {
		syncState.error = true;
		console.warn('[profil] Sauvegarde de la configuration échouée :', err);
	}
}

/**
 * Charge le profil serveur au démarrage (web authentifié uniquement) :
 * - profil existant → on hydrate les stores ;
 * - profil vide (première connexion) → on pousse la config locale actuelle
 *   (migration douce du localStorage existant vers le serveur).
 * Arme ensuite l'auto-sauvegarde.
 */
export async function loadProfile(): Promise<void> {
	try {
		const res = await fetch('/api/profile');
		if (!res.ok) return; // pas de serveur (mobile) ou non authentifié → localStorage seul
		const { profile } = (await res.json()) as { profile: Profile | null };
		if (profile) {
			applyProfile(profile); // ready encore false → l'effect ne re-sauvegarde pas ce qu'on vient d'appliquer
			syncState.error = false;
		} else {
			ready = true;
			await saveNow(); // première fois : la config locale devient le profil serveur
		}
	} catch (err) {
		syncState.error = true;
		console.warn('[profil] Chargement de la configuration échoué :', err);
	} finally {
		ready = true;
		syncState.loaded = true;
	}
}

/** Planifie une sauvegarde (anti-rebond). No-op tant que loadProfile n'a pas fini. */
export function scheduleSave() {
	if (!ready) return;
	clearTimeout(saveTimer);
	saveTimer = setTimeout(saveNow, 800);
}

/**
 * Efface la config locale (localStorage + état mémoire). Appelé sur le web quand
 * personne n'est authentifié (page de connexion), pour qu'un navigateur partagé
 * ne laisse pas la config d'un utilisateur fuiter dans le profil du suivant.
 * NE PAS appeler sur mobile (là, le localStorage EST la source de vérité).
 */
export function clearLocalProfile() {
	ready = false;
	clearTimeout(saveTimer);
	syncState.error = false;
	syncState.loaded = false;
	jellyfin.disconnect();
	pinepods.disconnect();
	listenbrainz.disconnect();
	lastfm.disconnect();
	lidarr.disconnect();
	settings.replaceAll({});
	radios.replaceAll([]);
}
