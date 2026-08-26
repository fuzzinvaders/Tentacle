/**
 * Calcul pur des prochaines occurrences d'un réveil (heure + jours de la semaine),
 * séparé de la programmation native (@capacitor/local-notifications) pour rester
 * testable sans dépendance à Capacitor/au DOM.
 */

/** 0 = dimanche … 6 = samedi (Date#getDay()). Vide = tous les jours. */
export type AlarmDays = number[];

/** Date/heure de la PROCHAINE occurrence après `now` (strictement après, jamais `now` pile). */
export function nextOccurrence(hour: number, minute: number, days: AlarmDays, now: Date): Date {
	const allowedDays = days.length ? days : [0, 1, 2, 3, 4, 5, 6];
	for (let add = 0; add <= 7; add++) {
		const d = new Date(now);
		d.setDate(d.getDate() + add);
		d.setHours(hour, minute, 0, 0);
		if (d <= now) continue; // aujourd'hui mais déjà passé
		if (allowedDays.includes(d.getDay())) return d;
	}
	// Ne devrait jamais arriver (7 jours couvrent toute combinaison de jours autorisés non vide) —
	// repli défensif pour ne jamais renvoyer undefined.
	const fallback = new Date(now);
	fallback.setDate(fallback.getDate() + 1);
	fallback.setHours(hour, minute, 0, 0);
	return fallback;
}

/** Jusqu'à 7 occurrences à venir (une par jour autorisé dans les 7 prochains jours) — pour
 * pré-programmer une semaine de notifications sans dépendre d'une relance de l'app entre deux. */
export function upcomingOccurrences(hour: number, minute: number, days: AlarmDays, now: Date): Date[] {
	const allowedDays = days.length ? days : [0, 1, 2, 3, 4, 5, 6];
	const out: Date[] = [];
	for (let add = 0; add <= 7; add++) {
		const d = new Date(now);
		d.setDate(d.getDate() + add);
		d.setHours(hour, minute, 0, 0);
		if (d <= now) continue;
		if (allowedDays.includes(d.getDay())) out.push(d);
	}
	return out;
}
