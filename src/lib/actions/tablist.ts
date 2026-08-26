/**
 * Navigation clavier d'un groupe d'onglets (motif ARIA « tablist »).
 *
 * À poser sur le conteneur `role="tablist"` ; ses enfants `role="tab"` deviennent
 * navigables aux flèches, comme l'attendent les lecteurs d'écran :
 *   ← / →  (ou ↑ / ↓ si l'orientation est verticale) : onglet précédent / suivant, en boucle
 *   Début / Fin : premier / dernier onglet
 *
 * L'onglet atteint reçoit le focus ET est activé (`click()`), ce qui correspond au
 * comportement « activation automatique » recommandé quand changer d'onglet est peu coûteux.
 *
 * Le `tabindex` reste géré par le composant appelant (`tabindex={actif ? 0 : -1}`) : c'est
 * lui qui connaît l'onglet actif, et la valeur suit donc naturellement l'état réactif.
 */
export function tablist(node: HTMLElement, orientation: 'horizontal' | 'vertical' = 'horizontal') {
	let axis = orientation;

	const prevKey = () => (axis === 'vertical' ? 'ArrowUp' : 'ArrowLeft');
	const nextKey = () => (axis === 'vertical' ? 'ArrowDown' : 'ArrowRight');

	function onKeyDown(e: KeyboardEvent) {
		const keys = [prevKey(), nextKey(), 'Home', 'End'];
		if (!keys.includes(e.key)) return;

		const tabs = Array.from(node.querySelectorAll<HTMLElement>('[role="tab"]')).filter(
			(t) => !t.hasAttribute('disabled')
		);
		if (tabs.length === 0) return;

		// L'onglet de départ : celui qui a le focus, sinon l'onglet sélectionné.
		const active = document.activeElement as HTMLElement | null;
		let index = active ? tabs.indexOf(active) : -1;
		if (index === -1) index = tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true');
		if (index === -1) index = 0;

		let target = index;
		if (e.key === 'Home') target = 0;
		else if (e.key === 'End') target = tabs.length - 1;
		else if (e.key === prevKey()) target = (index - 1 + tabs.length) % tabs.length;
		else if (e.key === nextKey()) target = (index + 1) % tabs.length;

		e.preventDefault();
		tabs[target].focus();
		tabs[target].click();
	}

	node.addEventListener('keydown', onKeyDown);

	return {
		update(next: 'horizontal' | 'vertical' = 'horizontal') {
			axis = next;
		},
		destroy() {
			node.removeEventListener('keydown', onKeyDown);
		}
	};
}
