import { contextMenu, type ContextMenuItem } from '$lib/stores/contextMenu.svelte';

type Payload = { items: ContextMenuItem[]; title?: string };

/**
 * Action Svelte : ouvre le menu contextuel global au clic droit (bureau) ou à l'appui long
 * (tactile) sur l'élément. `get` fournit les actions à la demande (état à jour au moment du clic).
 *
 * Usage : <li use:contextTrigger={() => ({ items, title })}>
 */
export function contextTrigger(node: HTMLElement, get: () => Payload) {
	let getPayload = get;
	const LONG_PRESS_MS = 500;
	const MOVE_TOLERANCE = 10;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let sx = 0;
	let sy = 0;
	let fired = false;

	function openAt(x: number, y: number) {
		const { items, title } = getPayload();
		if (items.length > 0) contextMenu.open(x, y, items, title ?? '');
	}

	function onContext(e: MouseEvent) {
		e.preventDefault();
		openAt(e.clientX, e.clientY);
	}

	function onTouchStart(e: TouchEvent) {
		if (e.touches.length !== 1) return;
		const t = e.touches[0];
		sx = t.clientX;
		sy = t.clientY;
		fired = false;
		timer = setTimeout(() => {
			fired = true;
			openAt(sx, sy);
		}, LONG_PRESS_MS);
	}

	function cancel() {
		clearTimeout(timer);
		timer = undefined;
	}

	function onTouchMove(e: TouchEvent) {
		const t = e.touches[0];
		if (!t) return;
		if (Math.abs(t.clientX - sx) > MOVE_TOLERANCE || Math.abs(t.clientY - sy) > MOVE_TOLERANCE) cancel();
	}

	// Empêche le « click » fantôme qui suit un appui long ayant ouvert le menu.
	function onClickCapture(e: MouseEvent) {
		if (fired) {
			e.preventDefault();
			e.stopPropagation();
			fired = false;
		}
	}

	node.addEventListener('contextmenu', onContext);
	node.addEventListener('touchstart', onTouchStart, { passive: true });
	node.addEventListener('touchmove', onTouchMove, { passive: true });
	node.addEventListener('touchend', cancel);
	node.addEventListener('touchcancel', cancel);
	node.addEventListener('click', onClickCapture, true);

	return {
		update(next: () => Payload) {
			getPayload = next;
		},
		destroy() {
			cancel();
			node.removeEventListener('contextmenu', onContext);
			node.removeEventListener('touchstart', onTouchStart);
			node.removeEventListener('touchmove', onTouchMove);
			node.removeEventListener('touchend', cancel);
			node.removeEventListener('touchcancel', cancel);
			node.removeEventListener('click', onClickCapture, true);
		}
	};
}
