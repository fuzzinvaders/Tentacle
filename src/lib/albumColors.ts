export type AlbumColors = { top: string; bottom: string; accent: string };

/**
 * Extrait des couleurs d'une pochette pour teinter l'écran plein écran :
 * - top/bottom : dégradé sombre dérivé de la couleur moyenne ;
 * - accent : la teinte la plus « vive » (saturée, ni trop claire ni trop sombre).
 * Renvoie null si l'image ne peut pas être lue (canvas « tainted » faute de CORS,
 * erreur de chargement, hors navigateur) → l'appelant garde le thème par défaut.
 */
export async function extractAlbumColors(url: string): Promise<AlbumColors | null> {
	if (typeof document === 'undefined') return null;
	return new Promise((resolve) => {
		const img = new Image();
		img.crossOrigin = 'anonymous';
		img.onload = () => {
			try {
				const S = 24;
				const canvas = document.createElement('canvas');
				canvas.width = S;
				canvas.height = S;
				const ctx = canvas.getContext('2d', { willReadFrequently: true });
				if (!ctx) return resolve(null);
				ctx.drawImage(img, 0, 0, S, S);
				const { data } = ctx.getImageData(0, 0, S, S);

				let rs = 0;
				let gs = 0;
				let bs = 0;
				let n = 0;
				let best = { score: -1, r: 180, g: 150, b: 90 };
				for (let i = 0; i < data.length; i += 4) {
					const r = data[i];
					const g = data[i + 1];
					const b = data[i + 2];
					if (data[i + 3] < 128) continue;
					rs += r;
					gs += g;
					bs += b;
					n++;
					const max = Math.max(r, g, b);
					const min = Math.min(r, g, b);
					const sat = max === 0 ? 0 : (max - min) / max;
					const lum = (max + min) / 2 / 255;
					// Favorise les couleurs saturées et de luminosité moyenne (jolies en accent).
					const score = sat * (1 - Math.abs(lum - 0.55) * 1.4);
					if (score > best.score) best = { score, r, g, b };
				}
				if (n === 0) return resolve(null);
				const ar = rs / n;
				const ag = gs / n;
				const ab = bs / n;
				const scale = (v: number, f: number) => Math.round(Math.min(255, v * f));
				resolve({
					top: `rgb(${scale(ar, 0.5)}, ${scale(ag, 0.5)}, ${scale(ab, 0.5)})`,
					bottom: `rgb(${scale(ar, 0.16)}, ${scale(ag, 0.16)}, ${scale(ab, 0.16)})`,
					accent: `rgb(${best.r}, ${best.g}, ${best.b})`
				});
			} catch {
				resolve(null); // canvas taint (CORS)
			}
		};
		img.onerror = () => resolve(null);
		img.src = url;
	});
}
