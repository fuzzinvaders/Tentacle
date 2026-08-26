// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	KOFI,
	LICENCE_ID,
	LICENCE_URL,
	LICENCE_LABEL,
	FREE_LABEL,
	DONATION_LABEL,
	SUPPORT_LABEL,
	supportEnabled,
	kofiUrl
} from './support';

/**
 * La licence est annoncée, et le widget de dons ne s'invite pas n'importe où.
 * Même garde-fou que dans le projet frère PresetBook : ces promesses-là ne doivent pas pouvoir
 * disparaître par accident au fil des refontes.
 */
const racine = join(import.meta.dirname, '..', '..');
const lire = (p: string) => readFileSync(join(racine, p), 'utf8');

describe('licence', () => {
	const licence = lire('LICENSE');

	it('le fichier LICENSE est présent et entier', () => {
		expect(licence.length).toBeGreaterThan(30_000);
		expect(licence).toContain('How to Apply These Terms');
	});

	it("c'est bien l'AGPL v3", () => {
		expect(licence).toContain('GNU AFFERO GENERAL PUBLIC LICENSE');
		expect(licence).toContain('Version 3, 19 November 2007');
	});

	it("l'article réseau y est — c'est la clause qui compte pour une app auto-hébergée", () => {
		expect(licence).toContain('13. Remote Network Interaction');
	});

	it('package.json déclare la même licence', () => {
		const pkg = JSON.parse(lire('package.json'));
		expect(pkg.license).toBe('AGPL-3.0-or-later');
	});

	it.each([
		'src/hooks.server.ts',
		'src/lib/api/jellyfin.ts',
		'src/lib/stores/player.svelte.ts',
		'src/lib/support.ts',
		'src/routes/+layout.svelte'
	])('%s porte son en-tête SPDX', (f) => {
		expect(lire(f)).toContain('SPDX-License-Identifier: AGPL-3.0-or-later');
	});
});

describe('soutien', () => {
	it('les libellés disent les trois choses : licence, gratuité, don non exigé', () => {
		expect(LICENCE_LABEL).toContain(LICENCE_ID);
		expect(FREE_LABEL).toMatch(/[Gg]ratuit/);
		expect(DONATION_LABEL).toContain('bienvenus, jamais demandés');
	});

	it('le lien de licence pointe vers le texte officiel', () => {
		expect(LICENCE_URL).toContain('gnu.org/licenses/agpl-3.0');
	});

	it("l'URL de don est construite depuis le seul identifiant Ko-fi", () => {
		expect(kofiUrl()).toBe(`https://ko-fi.com/${KOFI}`);
		expect(supportEnabled).toBe(KOFI.length > 0);
	});

	const layout = lire('src/routes/+layout.svelte');

	it('le pied de page affiche licence, gratuité et soutien', () => {
		// On vérifie que le layout référence les CONSTANTES et non des textes recopiés : c'est
		// justement ce qui garantit qu'une formulation ne peut pas divergier d'un endroit à l'autre.
		for (const c of [
			'LICENCE_URL',
			'LICENCE_LABEL',
			'FREE_LABEL',
			'DONATION_LABEL',
			'SUPPORT_LABEL',
			'kofiUrl()'
		]) {
			expect(layout).toContain(c);
		}
		// Et le libellé lui-même n'est pas vide, sinon le bouton n'aurait pas de texte.
		expect(SUPPORT_LABEL.length).toBeGreaterThan(0);
	});

	it("le widget tiers ne s'affiche jamais aux côtés d'un champ de mot de passe", () => {
		// La garde `isAuthPage` doit précéder l'injection du script dans mountKofi.
		const debut = layout.indexOf('function mountKofi');
		const injection = layout.indexOf('KOFI_WIDGET_SRC', debut);
		const gardeAuth = layout.indexOf('isAuthPage', debut);
		expect(debut).toBeGreaterThan(-1);
		expect(gardeAuth).toBeGreaterThan(debut);
		expect(gardeAuth).toBeLessThan(injection);
	});

	it("le widget tiers est exclu de l'application mobile", () => {
		const debut = layout.indexOf('function mountKofi');
		const injection = layout.indexOf('KOFI_WIDGET_SRC', debut);
		const gardeNatif = layout.indexOf('Capacitor.isNativePlatform()', debut);
		expect(gardeNatif).toBeGreaterThan(debut);
		expect(gardeNatif).toBeLessThan(injection);
	});

	it('le lien du pied de page ne dépend pas du script tiers', () => {
		// Le lien est rendu à partir de kofiUrl(), donc il survit à un échec de chargement.
		expect(layout).toContain('href={kofiUrl()}');
	});
});
