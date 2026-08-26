#!/usr/bin/env node
// Build web statique pour l'app mobile (Capacitor) : pas de serveur, donc pas
// de couche d'authentification web (l'ecran de verrouillage du telephone suffit).
//
// Deux fichiers server-only rendent l'auth web incompatible avec une sortie 100%
// statique (adapter-static + fallback SPA, sans backend au runtime) :
// - hooks.server.ts intercepte CHAQUE requete (y compris celle qu'adapter-static
//   emet pour generer la page de repli) et redirige vers /setup ou /login, ce qui
//   fait echouer la generation statique (redirection au lieu d'un 200).
// - +layout.server.ts charge l'utilisateur connecte via un appel serveur, qui n'a
//   personne pour repondre une fois l'app packagee sans backend.
// Les deux sont donc retires le temps du build, puis toujours restaures ensuite.
//
// Usage : npm run build:mobile

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, renameSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARGETS = [
	join(root, 'src', 'routes', '+layout.server.ts'),
	join(root, 'src', 'hooks.server.ts')
];

function disabledPath(p) {
	return `${p}.disabled`;
}

// Auto-guerison : si un run precedent a ete interrompu avant la restauration.
for (const p of TARGETS) {
	const d = disabledPath(p);
	if (existsSync(d) && !existsSync(p)) {
		renameSync(d, p);
		console.log(`[build-mobile] ${p} restaure (run precedent interrompu).`);
	}
}

for (const p of TARGETS) {
	if (!existsSync(p)) {
		console.error(`[build-mobile] ${p} introuvable, build annule.`);
		process.exit(1);
	}
}

for (const p of TARGETS) renameSync(p, disabledPath(p));
console.log('[build-mobile] Couche auth (hooks + layout server) desactivee pour ce build.');

try {
	const res = spawnSync('npm run build', {
		stdio: 'inherit',
		shell: true,
		env: { ...process.env, BUILD_TARGET: 'mobile' }
	});
	process.exitCode = res.status ?? 1;
} finally {
	for (const p of TARGETS) renameSync(disabledPath(p), p);
	console.log('[build-mobile] Couche auth restauree.');
}
