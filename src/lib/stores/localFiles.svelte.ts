import type { Track } from '$lib/types';

const AUDIO_EXT = /\.(mp3|flac|ogg|oga|m4a|m4b|aac|wav|opus|wma|aiff?|alac)$/i;

/**
 * Fichiers audio choisis depuis l'appareil (téléphone, ou NAS monté/accessible via le
 * sélecteur du système). Purement local et éphémère : les URLs blob ne survivent pas au
 * rechargement, donc rien n'est persisté ici — l'utilisateur re-sélectionne au besoin.
 * Aucune dépendance à un serveur : marche même sans Jellyfin.
 */
class LocalFilesStore {
	tracks = $state<Track[]>([]);

	add(files: FileList | File[]) {
		const list = Array.from(files).filter(
			(f) => f.type.startsWith('audio/') || AUDIO_EXT.test(f.name)
		);
		for (const f of list) {
			const id = `local-${f.name}-${f.size}`;
			if (this.tracks.some((t) => t.id === id)) continue;
			this.tracks.push({
				id,
				source: 'local',
				title: f.name.replace(/\.[^.]+$/, ''),
				subtitle: 'Fichier local',
				streamUrl: URL.createObjectURL(f)
			});
		}
	}

	remove(id: string) {
		this.tracks = this.tracks.filter((t) => t.id !== id);
	}

	clear() {
		// On ne révoque PAS les URLs : un morceau peut être en cours de lecture dans le player.
		// Les blobs sont libérés au déchargement de la page de toute façon.
		this.tracks = [];
	}
}

export const localFiles = new LocalFilesStore();
