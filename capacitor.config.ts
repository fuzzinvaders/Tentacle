import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
	appId: 'space.fuzzonaut.tentacle',
	appName: 'Tentacle',
	// Sortie du build statique mobile (npm run build:mobile) — pas de couche
	// d'authentification web ici, l'app tourne en local sur l'appareil.
	webDir: 'build-mobile'
};

export default config;
