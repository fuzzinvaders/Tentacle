/**
 * Artistes proches d'un artiste d'après Deezer (proxy serveur `/api/artist-similar`), du plus
 * au moins proche. Renvoie [] si indisponible (build mobile sans serveur, erreur réseau) :
 * l'appelant se rabat sur les artistes similaires de Jellyfin.
 */
export async function fetchSimilarArtistNames(name: string): Promise<string[]> {
	try {
		const res = await fetch(`/api/artist-similar?name=${encodeURIComponent(name)}`);
		if (!res.ok) return [];
		const data = (await res.json()) as { artists?: unknown };
		return Array.isArray(data.artists)
			? data.artists.filter((a): a is string => typeof a === 'string' && a.trim() !== '')
			: [];
	} catch {
		return [];
	}
}
