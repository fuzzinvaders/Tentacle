import { describe, it, expect } from 'vitest';
import { mapLimit } from './concurrency';

describe('mapLimit', () => {
	it('préserve l’ordre des résultats', async () => {
		const out = await mapLimit([1, 2, 3, 4, 5], 2, async (n) => n * 10);
		expect(out).toEqual([10, 20, 30, 40, 50]);
	});

	it('ne dépasse jamais la limite de concurrence', async () => {
		let active = 0;
		let maxActive = 0;
		await mapLimit(Array.from({ length: 20 }, (_, i) => i), 4, async () => {
			active++;
			maxActive = Math.max(maxActive, active);
			await new Promise((r) => setTimeout(r, 5));
			active--;
		});
		expect(maxActive).toBeLessThanOrEqual(4);
	});

	it('passe la bonne valeur et le bon index', async () => {
		const out = await mapLimit(['a', 'b', 'c'], 3, async (item, i) => `${i}:${item}`);
		expect(out).toEqual(['0:a', '1:b', '2:c']);
	});

	it('gère une liste vide', async () => {
		expect(await mapLimit([], 4, async (x) => x)).toEqual([]);
	});
});
