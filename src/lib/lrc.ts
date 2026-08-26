export type LrcLine = { time: number; text: string };

// Un tag de temps LRC : [mm:ss], [mm:ss.xx] ou [mm:ss.xxx].
const TS = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

/**
 * Parse des paroles LRC synchronisées en lignes {time (s), text}, triées par temps.
 * Ignore les métadonnées ([ar:], [ti:]…) et les lignes sans horodatage. Une ligne peut
 * porter plusieurs tags de temps (refrains) → dupliquée pour chacun. Fonction pure (testée).
 */
export function parseLrc(lrc: string): LrcLine[] {
	const out: LrcLine[] = [];
	for (const raw of lrc.split(/\r?\n/)) {
		TS.lastIndex = 0;
		const times: number[] = [];
		let m: RegExpExecArray | null;
		let lastEnd = 0;
		while ((m = TS.exec(raw)) !== null) {
			const min = parseInt(m[1], 10);
			const sec = parseInt(m[2], 10);
			const frac = m[3] ? parseInt(m[3].padEnd(3, '0').slice(0, 3), 10) / 1000 : 0;
			times.push(min * 60 + sec + frac);
			lastEnd = m.index + m[0].length;
		}
		if (times.length === 0) continue;
		const text = raw.slice(lastEnd).trim();
		for (const t of times) out.push({ time: t, text });
	}
	out.sort((a, b) => a.time - b.time);
	return out;
}

/**
 * Index de la ligne active pour une position (s) : dernière ligne dont le temps ≤ position.
 * -1 avant la première ligne. Recherche dichotomique (appelée à chaque tick).
 */
export function currentLineIndex(lines: LrcLine[], posSec: number): number {
	let lo = 0;
	let hi = lines.length - 1;
	let res = -1;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		if (lines[mid].time <= posSec) {
			res = mid;
			lo = mid + 1;
		} else {
			hi = mid - 1;
		}
	}
	return res;
}
