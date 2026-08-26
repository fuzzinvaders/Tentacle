import adapterNode from '@sveltejs/adapter-node';
import adapterStatic from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// BUILD_TARGET=mobile produces a fully static SPA build (no server, no auth
// route data) for packaging with Capacitor — see scripts/build-mobile.mjs.
const isMobileBuild = process.env.BUILD_TARGET === 'mobile';

// Version affichée dans l'app (pied de page). Le commit et la date de build
// proviennent en priorité de variables d'environnement fournies par la CI
// (le build de l'image Docker tourne dans node:alpine SANS git, .git étant
// exclu par .dockerignore), sinon on interroge git localement (builds locaux
// et build mobile), sinon on retombe sur des valeurs neutres.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));

function gitShortSha(): string {
	try {
		return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
			.toString()
			.trim();
	} catch {
		return '';
	}
}

const appCommit = process.env.SOURCE_COMMIT?.trim() || gitShortSha() || 'dev';
const appBuildDate = process.env.SOURCE_DATE?.trim() || new Date().toISOString().slice(0, 10);

export default defineConfig({
	define: {
		__APP_VERSION__: JSON.stringify(pkg.version),
		__APP_COMMIT__: JSON.stringify(appCommit),
		__APP_BUILD_DATE__: JSON.stringify(appBuildDate)
	},
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) => filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: isMobileBuild
				? adapterStatic({ pages: 'build-mobile', assets: 'build-mobile', fallback: 'index.html', strict: true })
				: adapterNode()
		})
	]
});
