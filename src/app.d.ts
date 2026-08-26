// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { SafeUser } from '$lib/server/users';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			user: SafeUser | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}

	// Constantes injectées au build par Vite (`define` dans vite.config.ts) :
	// version de l'app affichée dans le pied de page.
	const __APP_VERSION__: string;
	const __APP_COMMIT__: string;
	const __APP_BUILD_DATE__: string;
}

export {};
