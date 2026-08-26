import { browser } from '$app/environment';
import type { JellyfinItem } from '$lib/types';

const STORAGE_KEY = 'tentacle:downloads';
const MANIFEST_KEY = 'tentacle:download-albums';

/** Métadonnées d'un album téléchargé (liste complète des titres) pour l'affichage hors-ligne
 * dans la catégorie « Téléchargés » — sans dépendre du réseau. */
export type AlbumManifest = {
	albumId: string;
	name: string;
	artist: string;
	artworkUrl?: string;
	tracks: JellyfinItem[];
};

/** Un titre Jellyfin téléchargé sur l'appareil (lecture hors-ligne). `path` est l'URI de
 * fichier natif renvoyée par Filesystem (à passer à Capacitor.convertFileSrc pour la lecture). */
export type DownloadRecord = {
	id: string; // ItemId Jellyfin (sans préfixe)
	title: string;
	subtitle: string;
	artworkUrl?: string;
	path: string;
	durationSec?: number;
	albumId?: string; // pour le badge « téléchargé » sur les cartes d'album + le filtre
	sizeBytes?: number; // taille du fichier local (espace disque)
};

/** Reconstruit un album (façon manifeste) à partir de ses titres téléchargés, quand aucun
 * manifeste n'existe. Le nom d'album/l'artiste sont extraits du sous-titre des records
 * (« artiste · album », voir downloadTrack). Les titres deviennent des JellyfinItem minimaux
 * (Id + Name suffisent : la lecture passe par localSrc(Id) et l'affichage par Name). */
function albumFromRecords(albumId: string, recs: DownloadRecord[]): AlbumManifest {
	const [artist, album] = (recs[0]?.subtitle ?? '').split(' · ');
	return {
		albumId,
		name: album || recs[0]?.title || 'Album',
		artist: artist || '',
		artworkUrl: recs.find((r) => r.artworkUrl)?.artworkUrl,
		tracks: recs.map(
			(r): JellyfinItem => ({
				Id: r.id,
				Name: r.title,
				Type: 'Audio',
				AlbumId: albumId,
				Artists: artist ? [artist] : undefined,
				RunTimeTicks: r.durationSec ? r.durationSec * 10_000_000 : undefined
			})
		)
	};
}

function loadKey<T>(key: string): T {
	if (!browser) return {} as T;
	try {
		const raw = localStorage.getItem(key);
		const data = raw ? JSON.parse(raw) : {};
		return (data && typeof data === 'object' ? data : {}) as T;
	} catch {
		return {} as T;
	}
}

/**
 * Registre des téléchargements hors-ligne (mobile uniquement). Persisté en localStorage :
 * ne contient QUE des métadonnées + le chemin de fichier local, jamais l'audio lui-même.
 */
class DownloadsStore {
	map = $state<Record<string, DownloadRecord>>(loadKey('tentacle:downloads'));
	manifests = $state<Record<string, AlbumManifest>>(loadKey(MANIFEST_KEY));

	get list(): DownloadRecord[] {
		return Object.values(this.map);
	}

	/** Albums téléchargés (au moins un titre présent), pour la catégorie « Téléchargés ».
	 * On combine deux sources pour qu'AUCUN téléchargement ne soit invisible :
	 *  1. les manifestes (album téléchargé en entier → liste complète, titres manquants grisés) ;
	 *  2. les titres téléchargés isolément (ou avant l'existence des manifestes), regroupés par
	 *     album depuis le registre — sans quoi ces albums n'apparaîtraient jamais dans la liste. */
	get albums(): AlbumManifest[] {
		const out: AlbumManifest[] = [];
		const seen = new Set<string>();
		for (const m of Object.values(this.manifests)) {
			if (m.tracks.some((t) => this.has(t.Id))) {
				out.push(m);
				seen.add(m.albumId);
			}
		}
		// Records restants (albumId sans manifeste), regroupés par album.
		const byAlbum = new Map<string, DownloadRecord[]>();
		for (const rec of Object.values(this.map)) {
			const key = rec.albumId || rec.id; // titre isolé sans album → sa propre entrée
			if (seen.has(key)) continue;
			(byAlbum.get(key) ?? byAlbum.set(key, []).get(key)!).push(rec);
		}
		for (const [albumId, recs] of byAlbum) out.push(albumFromRecords(albumId, recs));
		return out;
	}

	getManifest(albumId: string): AlbumManifest | undefined {
		return this.manifests[albumId];
	}

	/** Album hors-ligne complet à ouvrir : manifeste si présent (liste complète), sinon
	 * reconstruit depuis les titres téléchargés de cet album. */
	getAlbum(albumId: string): AlbumManifest | undefined {
		const m = this.manifests[albumId];
		if (m && m.tracks.some((t) => this.has(t.Id))) return m;
		const recs = Object.values(this.map).filter((r) => (r.albumId || r.id) === albumId);
		return recs.length ? albumFromRecords(albumId, recs) : undefined;
	}

	setManifest(m: AlbumManifest) {
		this.manifests[m.albumId] = m;
		this.saveManifests();
	}

	dropManifest(albumId: string) {
		delete this.manifests[albumId];
		this.saveManifests();
	}

	has(id: string): boolean {
		return id in this.map;
	}

	/** Un album a-t-il au moins un titre téléchargé ? (badge sur les cartes) */
	albumHasDownloads(albumId: string): boolean {
		if (!albumId) return false;
		for (const r of Object.values(this.map)) if (r.albumId === albumId) return true;
		return false;
	}

	/** Espace disque total occupé par les téléchargements (octets). */
	get totalSize(): number {
		return Object.values(this.map).reduce((s, r) => s + (r.sizeBytes ?? 0), 0);
	}

	get(id: string): DownloadRecord | undefined {
		return this.map[id];
	}

	add(rec: DownloadRecord) {
		this.map[rec.id] = rec;
		this.save();
	}

	remove(id: string) {
		delete this.map[id];
		this.save();
	}

	private save() {
		if (!browser) return;
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(this.map));
		} catch {
			/* quota : la lecture hors-ligne reste fonctionnelle via les fichiers déjà écrits */
		}
	}

	private saveManifests() {
		if (!browser) return;
		try {
			localStorage.setItem(MANIFEST_KEY, JSON.stringify(this.manifests));
		} catch {
			/* quota : sans conséquence sur les fichiers déjà téléchargés */
		}
	}
}

export const downloads = new DownloadsStore();
