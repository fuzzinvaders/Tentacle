/**
 * Applique `fn` à chaque élément avec au plus `limit` opérations simultanées,
 * en préservant l'ordre des résultats. Utile pour ne pas ouvrir des dizaines
 * de requêtes d'un coup (ex. correspondance des pistes d'une playlist).
 */
export async function mapLimit<T, R>(
	items: T[],
	limit: number,
	fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
	const results = new Array<R>(items.length);
	let next = 0;
	const workerCount = Math.max(1, Math.min(limit, items.length));
	const workers = Array.from({ length: workerCount }, async () => {
		while (true) {
			const i = next++;
			if (i >= items.length) break;
			results[i] = await fn(items[i], i);
		}
	});
	await Promise.all(workers);
	return results;
}
