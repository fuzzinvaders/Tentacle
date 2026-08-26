export class ApiError extends Error {
	constructor(
		message: string,
		public status?: number
	) {
		super(message);
		this.name = 'ApiError';
	}
}

const REQUEST_TIMEOUT_MS = 20000;

export async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
	try {
		return await fetch(url, { ...init, signal: controller.signal });
	} catch (err) {
		if (err instanceof DOMException && err.name === 'AbortError') {
			throw new ApiError(`Pas de réponse sur ${url} (délai dépassé).`);
		}
		throw new ApiError(
			`Impossible de joindre le serveur sur ${url} (réseau/CORS) : ${err instanceof Error ? err.message : err}`
		);
	} finally {
		clearTimeout(timeout);
	}
}
