import { ApiError } from '$lib/http';
import type { LidarrConnection } from '$lib/stores/lidarr.svelte';

export { ApiError as LidarrApiError };

/**
 * Client Lidarr. Toutes les requêtes passent par notre proxy serveur
 * (/api/lidarr) car l'API Lidarr n'envoie pas d'en-têtes CORS.
 * Endpoints vérifiés sur la spec OpenAPI officielle (Lidarr.Api.V1).
 */

type ProxyPayload = { status: number; data: unknown };

async function lidarrFetch<T>(
	conn: LidarrConnection,
	path: string,
	init: { method?: 'GET' | 'POST' | 'PUT'; body?: unknown } = {}
): Promise<T> {
	const res = await fetch('/api/lidarr', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			baseUrl: conn.baseUrl,
			apiKey: conn.apiKey,
			path,
			method: init.method ?? 'GET',
			body: init.body
		})
	});
	const payload = (await res.json().catch(() => null)) as (ProxyPayload & { message?: string }) | null;
	if (!res.ok) {
		throw new ApiError(payload?.message ?? `Proxy Lidarr en erreur (HTTP ${res.status}).`, res.status);
	}
	if (!payload || payload.status === 401) {
		throw new ApiError('Clé API refusée par Lidarr.', 401);
	}
	if (payload.status >= 400) {
		throw new ApiError(`Lidarr a répondu ${payload.status} sur ${path}.`, payload.status);
	}
	return payload.data as T;
}

/** Vérifie URL + clé API — `GET /api/v1/system/status`. Renvoie la version. */
export async function testConnection(conn: LidarrConnection): Promise<string> {
	const data = await lidarrFetch<{ version?: string }>(conn, '/api/v1/system/status');
	return data.version ?? 'inconnue';
}

type LidarrDefaults = { rootFolderPath: string; qualityProfileId: number; metadataProfileId: number };

/** Premier dossier racine + premiers profils — requis pour ajouter un artiste/album. */
async function getDefaults(conn: LidarrConnection): Promise<LidarrDefaults> {
	const [roots, quality, metadata] = await Promise.all([
		lidarrFetch<{ path?: string }[]>(conn, '/api/v1/rootfolder'),
		lidarrFetch<{ id?: number }[]>(conn, '/api/v1/qualityprofile'),
		lidarrFetch<{ id?: number }[]>(conn, '/api/v1/metadataprofile')
	]);
	const rootFolderPath = roots?.[0]?.path;
	const qualityProfileId = quality?.[0]?.id;
	const metadataProfileId = metadata?.[0]?.id;
	if (!rootFolderPath || !qualityProfileId || !metadataProfileId) {
		throw new ApiError('Lidarr sans dossier racine ou profil configuré — configure-les dans Lidarr d’abord.');
	}
	return { rootFolderPath, qualityProfileId, metadataProfileId };
}

type LidarrAlbum = {
	id?: number;
	title?: string;
	foreignAlbumId?: string;
	monitored?: boolean;
	artist?: Record<string, unknown> & { id?: number };
	[key: string]: unknown;
};

export type EnsureAlbumResult = { status: 'added' | 'exists'; title: string };

/**
 * Garantit que l'album (release group MusicBrainz) est suivi dans Lidarr et
 * qu'une recherche est lancée :
 * - album inconnu → ajout complet (artiste implicite via l'objet du lookup,
 *   avec dossier racine + profils par défaut) et recherche automatique ;
 * - album déjà présent → re-monitoré si besoin puis commande AlbumSearch.
 */
export async function ensureAlbum(conn: LidarrConnection, releaseGroupMbid: string): Promise<EnsureAlbumResult> {
	const results = await lidarrFetch<LidarrAlbum[]>(
		conn,
		`/api/v1/album/lookup?term=${encodeURIComponent(`lidarr:${releaseGroupMbid}`)}`
	);
	const album = results?.find((a) => a.foreignAlbumId === releaseGroupMbid) ?? results?.[0];
	if (!album) throw new ApiError('Album introuvable côté Lidarr (lookup vide).');
	const title = String(album.title ?? 'Album');

	// Déjà en bibliothèque : l'objet du lookup porte un id > 0.
	if (album.id && album.id > 0) {
		await lidarrFetch(conn, '/api/v1/album/monitor', {
			method: 'PUT',
			body: { albumIds: [album.id], monitored: true }
		}).catch(() => {}); // déjà monitoré → sans conséquence
		await lidarrFetch(conn, '/api/v1/command', {
			method: 'POST',
			body: { name: 'AlbumSearch', albumIds: [album.id] }
		});
		return { status: 'exists', title };
	}

	const defaults = await getDefaults(conn);
	await lidarrFetch(conn, '/api/v1/album', {
		method: 'POST',
		body: {
			...album,
			monitored: true,
			artist: {
				...album.artist,
				rootFolderPath: defaults.rootFolderPath,
				qualityProfileId: defaults.qualityProfileId,
				metadataProfileId: defaults.metadataProfileId,
				monitored: true,
				// Ne pas aspirer toute la discographie : seul cet album nous intéresse.
				monitorNewItems: 'none',
				addOptions: { monitor: 'none', searchForMissingAlbums: false }
			},
			addOptions: { searchForNewAlbum: true }
		}
	});
	return { status: 'added', title };
}
