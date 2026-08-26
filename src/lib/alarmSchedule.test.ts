import { describe, it, expect } from 'vitest';
import { nextOccurrence, upcomingOccurrences } from './alarmSchedule';

// Mercredi 15 juillet 2026, 08:00:00 (Date#getDay() === 3).
const WED_8AM = new Date(2026, 6, 15, 8, 0, 0);

describe('nextOccurrence', () => {
	it("aujourd'hui si l'heure n'est pas encore passée (tous les jours)", () => {
		const at = nextOccurrence(9, 30, [], WED_8AM);
		expect(at.getDate()).toBe(15);
		expect(at.getHours()).toBe(9);
		expect(at.getMinutes()).toBe(30);
	});

	it("demain si l'heure est déjà passée aujourd'hui (tous les jours)", () => {
		const at = nextOccurrence(7, 0, [], WED_8AM);
		expect(at.getDate()).toBe(16);
	});

	it('respecte les jours autorisés (prochain lundi, ex. jours ouvrés)', () => {
		// Jours ouvrés : lun(1)-ven(5). Mercredi 8h, réveil à 7h → jeudi (déjà passé aujourd'hui).
		const at = nextOccurrence(7, 0, [1, 2, 3, 4, 5], WED_8AM);
		expect(at.getDay()).toBe(4); // jeudi
		expect(at.getDate()).toBe(16);
	});

	it('saute au jour autorisé suivant si le jour courant n’est pas autorisé', () => {
		// Weekend seulement (0, 6) depuis un mercredi → samedi (jour 18).
		const at = nextOccurrence(9, 0, [0, 6], WED_8AM);
		expect(at.getDay()).toBe(6);
		expect(at.getDate()).toBe(18);
	});

	it('est toujours strictement après now', () => {
		const at = nextOccurrence(8, 0, [], WED_8AM); // pile la même heure → doit sauter à demain
		expect(at.getTime()).toBeGreaterThan(WED_8AM.getTime());
	});
});

describe('upcomingOccurrences', () => {
	it('retourne une occurrence par jour autorisé sur la fenêtre de 8 jours (aujourd’hui inclus)', () => {
		const occ = upcomingOccurrences(9, 0, [], WED_8AM);
		expect(occ).toHaveLength(8); // tous les jours, aujourd'hui (add=0) à +7 jours inclus
		expect(occ.every((d) => d > WED_8AM)).toBe(true);
	});

	it('filtre sur les jours ouvrés uniquement', () => {
		const occ = upcomingOccurrences(9, 0, [1, 2, 3, 4, 5], WED_8AM);
		expect(occ.every((d) => d.getDay() >= 1 && d.getDay() <= 5)).toBe(true);
	});
});
