import { browser } from '$app/environment';

const STORAGE_KEY = 'tentacle:diagnostics';
/** Tampon circulaire : on garde les N derniers événements, les plus anciens sont écartés. */
const MAX_ENTRIES = 250;

export type DiagKind =
	| 'piste' // changement de piste
	| 'lecture' // demande de lecture (interface, Bluetooth, effet)
	| 'pause'
	| 'erreur'
	| 'blocage' // chien de garde : position figée
	| 'etat' // réconciliation d'état (pause externe détectée)
	| 'fondu' // fondu enchaîné
	| 'info';

export type DiagEntry = {
	/** Horodatage absolu (ms). Absolu et non relatif : un trajet en voiture peut traverser
	 * plusieurs redémarrages de l'app, et l'heure réelle est ce qui permet de recoller. */
	at: number;
	kind: DiagKind;
	msg: string;
};

function load(): DiagEntry[] {
	if (!browser) return [];
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		const data = raw ? JSON.parse(raw) : [];
		return Array.isArray(data) ? (data as DiagEntry[]) : [];
	} catch {
		return [];
	}
}

/**
 * Journal des événements de lecture, consultable et copiable depuis la Configuration.
 *
 * Raison d'être : quand la lecture déraille (typiquement en Bluetooth en voiture), il ne restait
 * AUCUNE trace exploitable — deux `console.warn` invisibles sur un téléphone. Impossible de
 * distinguer une perte de focus audio d'une erreur réseau ou d'un blocage de flux. Ce journal
 * transforme « j'ai encore des soucis de lecture » en données.
 *
 * Persisté (anti-rebond) parce que l'app peut être tuée par le système pendant un trajet : sans
 * ça, les événements les plus intéressants seraient justement ceux qu'on perdrait.
 *
 * ⚠️ N'enregistrer que des événements DISCRETS. Surtout pas depuis `timeupdate` (4×/s), qui
 * noierait le journal et userait le stockage.
 */
class DiagnosticsStore {
	entries = $state<DiagEntry[]>(load());

	private saveTimer: ReturnType<typeof setTimeout> | undefined;

	log(kind: DiagKind, msg: string) {
		this.entries.push({ at: Date.now(), kind, msg });
		if (this.entries.length > MAX_ENTRIES) {
			this.entries = this.entries.slice(-MAX_ENTRIES);
		}
		this.scheduleSave();
	}

	clear() {
		this.entries = [];
		if (!browser) return;
		try {
			localStorage.removeItem(STORAGE_KEY);
		} catch {
			/* sans conséquence */
		}
	}

	/** Rapport texte prêt à être collé dans une conversation ou un ticket. */
	report(): string {
		if (this.entries.length === 0) return 'Journal de lecture vide.';
		const lines = this.entries.map((e) => {
			const t = new Date(e.at);
			const hh = String(t.getHours()).padStart(2, '0');
			const mm = String(t.getMinutes()).padStart(2, '0');
			const ss = String(t.getSeconds()).padStart(2, '0');
			return `${hh}:${mm}:${ss}  [${e.kind}] ${e.msg}`;
		});
		const first = new Date(this.entries[0].at).toLocaleString();
		return [
			`Journal de lecture Tentacle — ${this.entries.length} événement(s), depuis le ${first}.`,
			'',
			...lines
		].join('\n');
	}

	private scheduleSave() {
		if (!browser || this.saveTimer) return;
		this.saveTimer = setTimeout(() => {
			this.saveTimer = undefined;
			try {
				localStorage.setItem(STORAGE_KEY, JSON.stringify(this.entries));
			} catch {
				/* quota : le journal est un confort de débogage, jamais critique */
			}
		}, 1500);
	}
}

export const diagnostics = new DiagnosticsStore();
