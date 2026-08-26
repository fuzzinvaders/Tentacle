/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />
import { build, files, version } from '$service-worker';

// Service worker volontairement minimal et prudent : il ne met en cache que les actifs
// STATIQUES et HASHÉS (JS/CSS du build + fichiers de `static/`), immuables par construction.
// Il n'intercepte JAMAIS les pages (SSR/auth), l'API (/api), ni les flux audio externes —
// le réseau normal s'en charge. Objectif : robustesse au chargement (coquille dispo même
// réseau capricieux) sans jamais servir de contenu authentifié périmé ni casser la lecture.

const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE = `tentacle-cache-${version}`;
const PRECACHE = [...build, ...files];
const PRECACHE_SET = new Set(PRECACHE);

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll(PRECACHE))
			.then(() => sw.skipWaiting())
	);
});

sw.addEventListener('activate', (event) => {
	// Purge les caches des versions précédentes.
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
			.then(() => sw.clients.claim())
	);
});

sw.addEventListener('fetch', (event) => {
	const req = event.request;
	if (req.method !== 'GET') return;

	const url = new URL(req.url);
	if (url.origin !== location.origin) return; // flux/API externes : jamais interceptés

	// Cache-first UNIQUEMENT pour les actifs précachés (hashés, immuables). On rafraîchit le
	// cache en arrière-plan si le réseau répond, sans jamais bloquer la réponse.
	if (PRECACHE_SET.has(url.pathname)) {
		event.respondWith(
			caches.open(CACHE).then(async (cache) => {
				const cached = await cache.match(req);
				const network = fetch(req)
					.then((res) => {
						if (res.ok) cache.put(req, res.clone());
						return res;
					})
					.catch(() => cached);
				return cached ?? network;
			})
		);
	}
	// Tout le reste (pages, /api, audio, pochettes) : réseau normal, non intercepté.
});
