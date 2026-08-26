// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Licence et soutien — source unique de vérité.
 *
 * L'interface ET les tests lisent ces constantes, pour qu'une formulation ne puisse pas
 * divergier d'un endroit à l'autre.
 *
 * Le principe, repris tel quel du projet frère PresetBook (deux projets distincts, même
 * intention) : le logiciel est libre et gratuit, et les dons sont **bienvenus, jamais
 * demandés** — rien n'est bridé, rien n'expire, aucune fonction n'attend un paiement.
 */

/** Identifiant Ko-fi. Le VIDER retire le soutien partout : widget et lien du pied de page. */
export const KOFI = 'talva';

export const LICENCE_ID = 'AGPL-3.0';
export const LICENCE_URL = 'https://www.gnu.org/licenses/agpl-3.0.html';

/** Les trois choses que le pied de page doit dire, dans cet ordre. */
export const LICENCE_LABEL = `logiciel libre sous ${LICENCE_ID}`;
export const FREE_LABEL = 'Gratuit, et le restera.';
export const DONATION_LABEL = 'Les dons sont bienvenus, jamais demandés.';
export const SUPPORT_LABEL = 'Me soutenir';

export const supportEnabled = KOFI.length > 0;

export function kofiUrl(): string {
	return `https://ko-fi.com/${KOFI}`;
}

/** Script du widget flottant, servi par Ko-fi (tiers). */
export const KOFI_WIDGET_SRC = 'https://storage.ko-fi.com/cdn/scripts/overlay-widget.js';
