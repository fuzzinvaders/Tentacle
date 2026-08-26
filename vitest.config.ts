import { defineConfig } from 'vitest/config';

// Config vitest volontairement autonome (sans le plugin SvelteKit) : les tests
// ne ciblent que des modules purs importés en relatif, donc aucune résolution
// $lib/$app/$env n'est nécessaire — plus simple et plus robuste.
export default defineConfig({
	test: {
		environment: 'node',
		include: ['src/**/*.test.ts']
	}
});
