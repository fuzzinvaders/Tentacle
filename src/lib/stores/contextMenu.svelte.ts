/** Une entrée du menu contextuel. `danger` colore l'action en rouge (ex. retrait). */
export type ContextMenuItem = {
	label: string;
	icon?: string;
	danger?: boolean;
	run: () => void;
};

/**
 * Menu contextuel global : ouvert par clic droit (bureau) ou appui long (tactile) sur un
 * titre/album, il regroupe les actions éparses (Lire, Lire ensuite, File, Favori, Aller à…).
 * Une seule instance <ContextMenu> est montée dans le layout ; les sites d'appel fournissent
 * la position et la liste d'actions.
 */
class ContextMenuStore {
	visible = $state(false);
	x = $state(0);
	y = $state(0);
	title = $state('');
	items = $state<ContextMenuItem[]>([]);

	open(x: number, y: number, items: ContextMenuItem[], title = '') {
		this.x = x;
		this.y = y;
		this.items = items;
		this.title = title;
		this.visible = true;
	}

	close() {
		this.visible = false;
		this.items = [];
	}
}

export const contextMenu = new ContextMenuStore();
