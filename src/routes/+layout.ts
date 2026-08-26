// L'app reste rendue côté client (comme avant la bascule SSR), mais le serveur
// gère désormais l'authentification via les hooks. Pas de prérendu (contenu dynamique).
export const prerender = false;
export const ssr = false;
