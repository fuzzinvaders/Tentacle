import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { downloads, type DownloadRecord } from '$lib/stores/downloads.svelte';
import type { JellyfinConnection } from '$lib/stores/jellyfin.svelte';
import type { JellyfinItem, Track } from '$lib/types';
import { songStreamUrl, primaryImageUrl } from '$lib/api/jellyfin';

const TICKS_PER_SEC = 10_000_000;
const DIR = Directory.Data;
const fileName = (id: string) => `tentacle-${id}.mp3`;

/** Le hors-ligne n'est disponible que dans l'app native (Capacitor Filesystem). */
export function offlineSupported(): boolean {
	return Capacitor.isNativePlatform();
}

/** Télécharge un titre Jellyfin sur l'appareil (qualité max) et l'enregistre au registre. */
export async function downloadTrack(conn: JellyfinConnection, item: JellyfinItem): Promise<void> {
	if (!offlineSupported() || downloads.has(item.Id)) return;
	const url = songStreamUrl(conn, item.Id, 320_000);
	const res = await Filesystem.downloadFile({ url, path: fileName(item.Id), directory: DIR });
	if (!res.path) throw new Error('Téléchargement échoué');
	// Taille du fichier écrit (espace disque) — best-effort.
	let sizeBytes: number | undefined;
	try {
		const st = await Filesystem.stat({ path: fileName(item.Id), directory: DIR });
		sizeBytes = typeof st.size === 'number' ? st.size : undefined;
	} catch {
		/* stat indisponible : taille inconnue */
	}
	const artist = item.Artists?.length ? item.Artists.join(', ') : (item.AlbumArtist ?? '');
	const useAlbumArt = Boolean(item.AlbumId && item.AlbumPrimaryImageTag);
	const imageId = useAlbumArt ? item.AlbumId! : item.Id;
	const imageTag = useAlbumArt ? item.AlbumPrimaryImageTag : item.ImageTags?.Primary;
	downloads.add({
		id: item.Id,
		title: item.Name,
		subtitle: [artist, item.Album].filter(Boolean).join(' · '),
		artworkUrl: imageTag ? primaryImageUrl(conn, imageId, imageTag) : undefined,
		path: res.path,
		durationSec: item.RunTimeTicks ? Math.round(item.RunTimeTicks / TICKS_PER_SEC) : undefined,
		albumId: item.AlbumId,
		sizeBytes
	});
}

/** Supprime un titre téléchargé (fichier + registre). */
export async function removeDownload(id: string): Promise<void> {
	downloads.remove(id);
	if (offlineSupported()) {
		try {
			await Filesystem.deleteFile({ path: fileName(id), directory: DIR });
		} catch {
			/* fichier déjà absent : sans conséquence */
		}
	}
}

/** URI local jouable (convertFileSrc) pour un titre téléchargé, sinon null. */
export function localSrc(id: string): string | null {
	const rec = downloads.get(id);
	if (!rec) return null;
	return Capacitor.convertFileSrc(rec.path);
}

/** Identifiant d'élément déduit d'un nom de fichier `tentacle-<id>.mp3`, sinon null. */
function idFromFileName(name: string): string | null {
	const m = /^tentacle-(.+)\.mp3$/.exec(name);
	return m ? m[1] : null;
}

export type RepairReport = { adoptes: number; retires: number; sansMetadonnees: number };

/**
 * Réconcilie le registre des téléchargements avec les fichiers réellement présents.
 *
 * Le registre vit en localStorage, les fichiers sur le disque : les deux peuvent divergier.
 * Deux cas rencontrés en vrai :
 *  - **fichiers orphelins** — le registre a été vidé (réinstallation de l'app, stockage effacé)
 *    alors que les fichiers sont toujours là : les albums disparaissaient de « Téléchargés »
 *    bien que la musique soit sur l'appareil. On les réadopte, en récupérant les métadonnées
 *    depuis Jellyfin à partir de l'identifiant contenu dans le nom de fichier.
 *  - **entrées mortes** — le fichier a été supprimé par le système (nettoyage de stockage) mais
 *    l'entrée subsiste : la lecture échouait. On les retire.
 *
 * ⚠️ Un fichier laissé par un téléchargement INTERROMPU est indistinguable d'un fichier complet
 * (le nom et l'emplacement sont les mêmes). Il sera donc réadopté et pourra être tronqué ; il
 * suffit de le supprimer puis de le retélécharger. C'est le compromis assumé pour pouvoir
 * récupérer une bibliothèque hors-ligne entière après une réinstallation.
 */
export async function repairDownloads(conn: JellyfinConnection | null): Promise<RepairReport> {
	const report: RepairReport = { adoptes: 0, retires: 0, sansMetadonnees: 0 };
	if (!offlineSupported()) return report;

	const listing = await Filesystem.readdir({ path: '', directory: DIR });
	const present = new Map<string, string>(); // id → nom de fichier
	for (const entry of listing.files ?? []) {
		const name = typeof entry === 'string' ? entry : entry.name;
		const id = idFromFileName(name);
		if (id) present.set(id, name);
	}

	// 1. Entrées dont le fichier a disparu.
	for (const rec of downloads.list) {
		if (!present.has(rec.id)) {
			downloads.remove(rec.id);
			report.retires++;
		}
	}

	// 2. Fichiers présents mais absents du registre.
	const orphans = [...present.keys()].filter((id) => !downloads.has(id));
	if (orphans.length === 0) return report;

	// Sans connexion Jellyfin on ne peut pas retrouver titre/artiste : on ne devine pas, on
	// signale (l'utilisateur relancera la réparation une fois connecté).
	if (!conn) {
		report.sansMetadonnees = orphans.length;
		return report;
	}

	const { getItemsByIds } = await import('$lib/api/jellyfin');
	const items = await getItemsByIds(conn, orphans);
	const byId = new Map(items.map((i) => [i.Id, i]));

	for (const id of orphans) {
		const item = byId.get(id);
		if (!item) {
			report.sansMetadonnees++;
			continue;
		}
		let sizeBytes: number | undefined;
		try {
			const st = await Filesystem.stat({ path: fileName(id), directory: DIR });
			sizeBytes = typeof st.size === 'number' ? st.size : undefined;
		} catch {
			/* taille inconnue : sans conséquence sur la lecture */
		}
		const uri = await Filesystem.getUri({ path: fileName(id), directory: DIR });
		const artist = item.Artists?.length ? item.Artists.join(', ') : (item.AlbumArtist ?? '');
		const useAlbumArt = Boolean(item.AlbumId && item.AlbumPrimaryImageTag);
		const imageId = useAlbumArt ? item.AlbumId! : item.Id;
		const imageTag = useAlbumArt ? item.AlbumPrimaryImageTag : item.ImageTags?.Primary;
		downloads.add({
			id,
			title: item.Name,
			subtitle: [artist, item.Album].filter(Boolean).join(' · '),
			artworkUrl: imageTag ? primaryImageUrl(conn, imageId, imageTag) : undefined,
			path: uri.uri,
			durationSec: item.RunTimeTicks ? Math.round(item.RunTimeTicks / TICKS_PER_SEC) : undefined,
			albumId: item.AlbumId,
			sizeBytes
		});
		report.adoptes++;
	}
	return report;
}

/** Track hors-ligne pour lecture directe depuis le gestionnaire de téléchargements. */
export function downloadToTrack(rec: DownloadRecord): Track {
	return {
		id: `jellyfin-${rec.id}`,
		source: 'jellyfin',
		title: rec.title,
		subtitle: rec.subtitle,
		artworkUrl: rec.artworkUrl,
		streamUrl: Capacitor.convertFileSrc(rec.path),
		durationSec: rec.durationSec
	};
}
