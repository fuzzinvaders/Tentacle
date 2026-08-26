export type ToastKind = 'info' | 'error';
export type Toast = { id: number; message: string; kind: ToastKind };

/**
 * Petits retours visuels éphémères (« Ajouté à la file », erreurs…). Un seul store global,
 * consommé par ToastHost monté une fois dans le layout. Les toasts disparaissent tout seuls.
 */
class ToastStore {
	items = $state<Toast[]>([]);
	private nextId = 1;
	private timers = new Map<number, ReturnType<typeof setTimeout>>();

	private push(message: string, kind: ToastKind, durationMs: number) {
		const id = this.nextId++;
		this.items = [...this.items, { id, message, kind }];
		this.timers.set(
			id,
			setTimeout(() => this.dismiss(id), durationMs)
		);
	}

	info(message: string) {
		this.push(message, 'info', 2600);
	}

	error(message: string) {
		this.push(message, 'error', 4200);
	}

	dismiss(id: number) {
		const t = this.timers.get(id);
		if (t) {
			clearTimeout(t);
			this.timers.delete(id);
		}
		this.items = this.items.filter((it) => it.id !== id);
	}
}

export const toasts = new ToastStore();
