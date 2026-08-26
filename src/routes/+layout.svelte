<script lang="ts">
	// SPDX-License-Identifier: AGPL-3.0-or-later
	import '../app.css';
	import { untrack } from 'svelte';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';
	import { ui, type SpaceId } from '$lib/stores/ui.svelte';
	import { player } from '$lib/stores/player.svelte';
	import { settings, EQ_FREQUENCIES, EQ_GAIN_LIMIT } from '$lib/stores/settings.svelte';
	import { listenbrainz } from '$lib/stores/listenbrainz.svelte';
	import { lastfm } from '$lib/stores/lastfm.svelte';
	import { jellyfin } from '$lib/stores/jellyfin.svelte';
	import { getRemoteSessions, playOnSession, getInstantMix, createPlaylist } from '$lib/api/jellyfin';
	import { songToTrack } from '$lib/jellyfinTrack';
	import { contextMenu } from '$lib/stores/contextMenu.svelte';
	import { tablist } from '$lib/actions/tablist';
	import { media } from '$lib/mediaSession';
	import { submitListen } from '$lib/api/listenbrainz';
	import { updateNowPlaying as lastfmUpdateNowPlaying, scrobble as lastfmScrobble } from '$lib/api/lastfm';
	import { sleep } from '$lib/stores/sleep.svelte';
	import { podcastSkips } from '$lib/stores/podcastSkips.svelte';
	import { isExternallyPaused } from '$lib/playbackState';
	import { diagnostics } from '$lib/stores/diagnostics.svelte';
	import { Capacitor } from '@capacitor/core';
	import {
		KOFI,
		KOFI_WIDGET_SRC,
		LICENCE_URL,
		LICENCE_LABEL,
		FREE_LABEL,
		DONATION_LABEL,
		SUPPORT_LABEL,
		supportEnabled,
		kofiUrl
	} from '$lib/support';
	import { formatTime } from '$lib/format';
	import PodcastProgressSync from '$lib/components/podcasts/PodcastProgressSync.svelte';
	import AlarmHandler from '$lib/components/shared/AlarmHandler.svelte';
	import ToastHost from '$lib/components/shared/ToastHost.svelte';
	import NowPlaying from '$lib/components/player/NowPlaying.svelte';
	import CommandPalette from '$lib/components/shared/CommandPalette.svelte';
	import ShortcutsHelp from '$lib/components/shared/ShortcutsHelp.svelte';
	import DemoInvite from '$lib/components/shared/DemoInvite.svelte';
	import ContextMenu from '$lib/components/shared/ContextMenu.svelte';
	import { toasts } from '$lib/stores/toasts.svelte';
	import { loadProfile, buildProfile, scheduleSave, clearLocalProfile, hydrateFromLocalStorage, syncState } from '$lib/profileSync.svelte';
	import type { LayoutData } from './$types';

	let { children, data }: { children: import('svelte').Snippet; data: LayoutData } = $props();

	// Lecteur repliable (web ET mobile) : boîtier complet quand ouvert, mini-lecteur (une
	// ligne) quand réduit. Ouvert par défaut sur grand écran, réduit sur téléphone pour
	// libérer l'espace. L'utilisateur bascule via le chevron du mini-lecteur / du boîtier.
	let playerOpen = $state(typeof window !== 'undefined' ? window.innerWidth > 600 : true);
	// File d'attente : ouverte en superposition au-dessus du boîtier (bouton dédié), car le
	// format « Walkman » compact n'a plus de place pour la liste en permanence.
	let queueOpen = $state(false);
	// Écran « Lecture en cours » plein écran (pochette, seek, paroles, file…).
	let nowPlayingOpen = $state(false);
	let shortcutsOpen = $state(false);
	// Palette de commandes (Ctrl/Cmd+K) : navigation et actions rapides.
	let commandPaletteOpen = $state(false);

	// ---- Diffusion sur un autre appareil ----
	// 1) API Remote Playback (Chromecast/AirPlay natif du navigateur) — indispo en WebView.
	const remoteSupported =
		typeof window !== 'undefined' &&
		typeof HTMLMediaElement !== 'undefined' &&
		'remote' in HTMLMediaElement.prototype;
	function promptRemote() {
		const el = activeEl as
			| (HTMLAudioElement & { remote?: { prompt?: () => Promise<void> } })
			| undefined;
		el?.remote?.prompt?.().catch(() => {});
	}
	// Identifiants Jellyfin des titres de la file (pour playlist / diffusion).
	function jellyfinQueueIds(): string[] {
		return player.queue
			.filter((t) => t.source === 'jellyfin')
			.map((t) => t.id.replace(/^jellyfin-/, ''));
	}

	// Enregistre la file d'attente (titres Jellyfin) comme nouvelle playlist Jellyfin.
	async function saveQueueAsPlaylist() {
		const conn = jellyfin.connection;
		const ids = jellyfinQueueIds();
		if (!conn || ids.length === 0) {
			toasts.info('Aucun titre Jellyfin dans la file.');
			return;
		}
		const name = window.prompt('Nom de la playlist :')?.trim();
		if (!name) return;
		try {
			await createPlaylist(conn, name, ids);
			toasts.info(`Playlist « ${name} » créée (${ids.length} titres)`);
		} catch {
			toasts.error('Création de la playlist impossible.');
		}
	}

	// 2) Sessions Jellyfin (autres clients du réseau WiFi) — « Lire sur… ».
	const jellyfinCastable = $derived(jellyfin.connected && player.queue.some((t) => t.source === 'jellyfin'));
	async function castToJellyfin(x: number, y: number) {
		const conn = jellyfin.connection;
		if (!conn) return;
		try {
			const sessions = await getRemoteSessions(conn);
			if (sessions.length === 0) {
				toasts.info('Aucun autre appareil Jellyfin trouvé sur le réseau.');
				return;
			}
			const items = player.queue.filter((t) => t.source === 'jellyfin');
			const ids = items.map((t) => t.id.replace(/^jellyfin-/, ''));
			const cur = player.current;
			const startIndex =
				cur?.source === 'jellyfin' ? Math.max(0, items.findIndex((t) => t.id === cur.id)) : 0;
			contextMenu.open(
				x,
				y,
				sessions.map((s) => ({
					label: s.nowPlaying ? `${s.deviceName} — ${s.nowPlaying}` : s.deviceName,
					icon: '📡',
					run: async () => {
						try {
							await playOnSession(conn, s.id, ids, startIndex);
							toasts.info(`Lecture envoyée à ${s.deviceName}`);
						} catch {
							toasts.error('Envoi impossible à cet appareil.');
						}
					}
				})),
				'Lire sur…'
			);
		} catch {
			toasts.error('Sessions Jellyfin indisponibles.');
		}
	}

	// ---- Mini-lecteur gestuel (glisser gauche/droite = piste ; haut ou tap = plein écran) ----
	let miniX = 0;
	let miniY = 0;
	function onMiniDown(e: PointerEvent) {
		miniX = e.clientX;
		miniY = e.clientY;
	}
	function onMiniUp(e: PointerEvent) {
		const dx = e.clientX - miniX;
		const dy = e.clientY - miniY;
		if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
			nowPlayingOpen = true; // tap
			return;
		}
		if (dy < -50 && Math.abs(dy) > Math.abs(dx)) {
			nowPlayingOpen = true; // glisser vers le haut
			return;
		}
		if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
			if (dx < 0) player.next();
			else player.prev();
		}
	}

	// ---- Glisser-déposer de la file d'attente (souris + tactile via Pointer Events) ----
	let queueUl = $state<HTMLUListElement>();
	let dragIndex = $state(-1);
	function onQueueDragStart(e: PointerEvent, i: number) {
		dragIndex = i;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}
	function onQueueDragMove(e: PointerEvent) {
		if (dragIndex < 0 || !queueUl) return;
		const items = Array.from(queueUl.querySelectorAll('li'));
		const y = e.clientY;
		let target = items.length - 1;
		for (let j = 0; j < items.length; j++) {
			const r = items[j].getBoundingClientRect();
			if (y < r.top + r.height / 2) {
				target = j;
				break;
			}
		}
		if (target !== dragIndex) {
			player.moveInQueue(dragIndex, target);
			dragIndex = target;
		}
	}
	function onQueueDragEnd() {
		dragIndex = -1;
	}
	// Réordonnancement accessible au clavier depuis la poignée (↑/↓).
	function onQueueHandleKey(e: KeyboardEvent, i: number) {
		if (e.key === 'ArrowUp' && i > 0) {
			e.preventDefault();
			player.moveInQueue(i, i - 1);
		} else if (e.key === 'ArrowDown' && i < player.queue.length - 1) {
			e.preventDefault();
			player.moveInQueue(i, i + 1);
		}
	}
	// Volume mémorisé avant coupure (raccourci « M »).
	let preMuteVolume = 0.8;

	/* ============================ soutien ============================
	   Le widget de dons est servi par un TIERS. Il n'est donc chargé qu'une fois la session
	   ouverte : un script qu'on ne sert pas soi-même n'a rien à faire sur la même page qu'un
	   champ de mot de passe (/login, /setup).

	   Il est aussi volontairement absent de l'APPLICATION MOBILE : y injecter un script distant
	   irait contre son fonctionnement hors-ligne, et un lien de paiement externe dans une app
	   Android relève des règles de paiement de Google Play (voir le wiki, Publication sur
	   Google Play). Le lien du pied de page, lui, ne dépend d'aucun tiers et reste partout.

	   Vider la constante KOFI ($lib/support) retire le soutien entièrement, pied de page compris. */
	let kofiMounted = false;
	function mountKofi() {
		if (kofiMounted || !supportEnabled) return;
		if (isAuthPage) return; // jamais aux côtés d'un champ de mot de passe
		if (Capacitor.isNativePlatform()) return; // pas de script tiers dans l'app mobile
		kofiMounted = true;
		try {
			const s = document.createElement('script');
			s.src = KOFI_WIDGET_SRC;
			s.async = true;
			s.onload = () => {
				try {
					// @ts-expect-error API du tiers, absente de nos types
					window.kofiWidgetOverlay?.draw(KOFI, {
						type: 'floating-chat',
						'floating-chat.donateButton.text': SUPPORT_LABEL,
						'floating-chat.donateButton.background-color': '#223a3c',
						'floating-chat.donateButton.text-color': '#ffedb3'
					});
				} catch {
					/* le tiers a changé d'interface : le lien du pied de page reste */
				}
			};
			(document.head || document.body).appendChild(s);
		} catch {
			/* rien à faire : le pied de page porte déjà le lien */
		}
	}

	$effect(() => {
		if (!isAuthPage) mountKofi();
	});

	// Version affichée dans le pied de page (injectée au build par Vite, voir vite.config.ts).
	const appVersion = __APP_VERSION__;
	const appCommit = __APP_COMMIT__;
	const appBuildDate = __APP_BUILD_DATE__;

	// Synchronisation du profil serveur (web authentifié uniquement). Sur mobile,
	// data.user est absent (pas de +layout.server dans le build statique) → on ne
	// déclenche rien et les stores restent en localStorage.
	let profileInit = false;
	// Garde contre les ré-exécutions répétées de cet effect pendant l'amorçage
	// client (plusieurs passes avec data.user encore à null avant résolution) :
	// sans ce verrou, clearLocalProfile() réinitialise settings/radios (nouvelle
	// référence à chaque appel) sur chaque passe, ce qui redéclenche l'effect
	// de sauvegarde du profil et finit par dépasser la profondeur de mise à
	// jour de Svelte (effect_update_depth_exceeded), plantant la navigation
	// juste après la création de l'admin (page figée nécessitant un rechargement).
	let cleared = false;
	$effect(() => {
		if (data.user && !profileInit) {
			profileInit = true;
			cleared = false;
			loadProfile();
		}
		// data.user === null → web déconnecté (page de connexion) : purge la config locale.
		// data.user === undefined → build mobile (pas de +layout.server) : ne rien purger.
		else if (data.user === null && !cleared) {
			cleared = true;
			clearLocalProfile();
		}
	});
	$effect(() => {
		// Sérialise en profondeur pour suivre chaque champ (connexions, préférences,
		// radios) ; sauvegarde différée côté serveur — no-op tant que le profil
		// initial n'est pas chargé, et sur mobile (aucun serveur à contacter).
		JSON.stringify(buildProfile());
		scheduleSave();
	});

	// Synchro inter-onglets : un autre onglet a modifié la config (localStorage) →
	// on recharge les stores pour refléter le changement. `storage` ne se déclenche
	// que dans les AUTRES onglets, jamais celui qui a écrit → pas de boucle.
	$effect(() => {
		const onStorage = (e: StorageEvent) => {
			if (e.key === null || e.key.startsWith('tentacle:')) hydrateFromLocalStorage();
		};
		window.addEventListener('storage', onStorage);
		return () => window.removeEventListener('storage', onStorage);
	});

	// Persiste l'état de lecture (file + position + réglages) en localStorage pour reprendre
	// après fermeture de l'app — pour toutes les sources, y compris la bibliothèque Jellyfin.
	// On lit .length / currentIndex / positionSec / réglages pour suivre les changements ;
	// la sauvegarde elle-même est anti-rebond dans le store.
	$effect(() => {
		player.queue.length;
		player.currentIndex;
		player.positionSec;
		player.volume;
		player.repeat;
		player.shuffle;
		player.playbackRate;
		player.persist();
	});
	// Sauvegarde immédiate quand l'app passe en arrière-plan ou se ferme : sur mobile/PWA,
	// c'est souvent le seul moment fiable pour capter la position exacte avant fermeture.
	$effect(() => {
		const flush = () => player.saveNow();
		const onVisibility = () => {
			if (document.visibilityState === 'hidden') {
				// requestAnimationFrame va être gelé : on termine tout fondu en cours, sinon le
				// volume resterait figé en chemin (et la lecture continuerait en silence).
				settleFade();
				flush();
			} else {
				// De retour au premier plan : dernier filet, au cas où le son serait resté à zéro.
				restoreVolumeIfMuted('retour au premier plan');
			}
		};
		document.addEventListener('visibilitychange', onVisibility);
		window.addEventListener('pagehide', flush);
		return () => {
			document.removeEventListener('visibilitychange', onVisibility);
			window.removeEventListener('pagehide', flush);
		};
	});

	// Les pages d'authentification (avant/hors session) s'affichent sans le chrome de l'app.
	const isAuthPage = $derived(page.url.pathname === '/login' || page.url.pathname === '/setup');

	const spaces: { id: SpaceId; label: string; glyph: string }[] = [
		{ id: 'home', label: 'Accueil', glyph: '⌂' },
		{ id: 'library', label: 'Bibliothèque', glyph: '▤' },
		{ id: 'radios', label: 'Radios', glyph: '⌁' },
		{ id: 'podcasts', label: 'Podcasts', glyph: '⊙' },
		{ id: 'config', label: 'Configuration', glyph: '⚙' }
	];

	$effect(() => {
		document.documentElement.dataset.theme = settings.values.theme;
	});

	// Élément audio « direct » : utilisé pour TOUTES les sources quand l'égaliseur est désactivé,
	// et TOUJOURS pour les radios/podcasts (flux externes sans CORS → incompatibles Web Audio).
	let audioEl = $state<HTMLAudioElement>();
	// Élément dédié à l'égaliseur : utilisé UNIQUEMENT pour Jellyfin/local quand l'EQ est activé
	// (crossorigin="anonymous" → Jellyfin renvoie les en-têtes CORS, le blob local est same-origin).
	let eqEl = $state<HTMLAudioElement>();
	// Élément qui pilote réellement la lecture courante. Par défaut l'élément direct : tant que
	// l'EQ reste désactivé, activeEl === audioEl et le comportement est identique à avant.
	let activeEl = $state<HTMLAudioElement | undefined>();

	function eqEligible(source?: string): boolean {
		return source === 'jellyfin' || source === 'local';
	}
	// Le graphe Web Audio doit-il traiter le titre courant ? (égaliseur OU normalisation activés,
	// et source compatible CORS : Jellyfin/local).
	const graphActive = $derived(
		(settings.values.eqEnabled || settings.values.volumeNormalization) &&
			eqEligible(player.current?.source)
	);

	// ---- Graphe Web Audio (créé paresseusement) : source → filtres EQ → préampli → sortie ----
	let audioCtx: AudioContext | undefined;
	let eqFilters: BiquadFilterNode[] = [];
	let preampNode: GainNode | undefined; // gain de normalisation (ReplayGain) par titre
	function ensureEqGraph() {
		if (audioCtx || !eqEl) return;
		const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
		if (!Ctx) return;
		try {
			// crossorigin requis UNIQUEMENT pour le graphe Web Audio (sinon silence sur ressource
			// cross-origin). Posé ici, avant que la piste EQ ne soit (re)chargée par l'effet de piste.
			eqEl.crossOrigin = 'anonymous';
			audioCtx = new Ctx();
			const source = audioCtx.createMediaElementSource(eqEl);
			let node: AudioNode = source;
			eqFilters = EQ_FREQUENCIES.map((freq, i) => {
				const biquad = audioCtx!.createBiquadFilter();
				biquad.type = i === 0 ? 'lowshelf' : i === EQ_FREQUENCIES.length - 1 ? 'highshelf' : 'peaking';
				biquad.frequency.value = freq;
				biquad.Q.value = 1;
				biquad.gain.value = clampGain(settings.values.eqBands?.[i]);
				node.connect(biquad);
				node = biquad;
				return biquad;
			});
			preampNode = audioCtx.createGain();
			preampNode.gain.value = normalizationGain();
			node.connect(preampNode);
			preampNode.connect(audioCtx.destination);
		} catch (err) {
			// Échec de création (autoplay policy, plateforme…) : on retombe sur la lecture directe.
			console.warn('[audio] graphe Web Audio indisponible :', err);
			audioCtx = undefined;
			eqFilters = [];
			preampNode = undefined;
		}
	}
	function clampGain(v: unknown): number {
		const n = typeof v === 'number' && Number.isFinite(v) ? v : 0;
		return Math.max(-EQ_GAIN_LIMIT, Math.min(EQ_GAIN_LIMIT, n));
	}
	// Gain linéaire de normalisation pour le titre courant (dB Jellyfin → linéaire), borné pour
	// éviter les extrêmes/écrêtage. 1.0 (neutre) si normalisation désactivée ou donnée absente.
	function normalizationGain(): number {
		if (!settings.values.volumeNormalization) return 1;
		const db = player.current?.gainDb;
		if (typeof db !== 'number' || !Number.isFinite(db)) return 1;
		const linear = Math.pow(10, db / 20);
		return Math.max(0.1, Math.min(2, linear));
	}
	// Réapplique le gain de normalisation (changement de piste ou bascule du réglage).
	function applyNormalization() {
		if (preampNode) preampNode.gain.value = normalizationGain();
	}

	// ---- Fondu enchaîné (expérimental, musique Jellyfin/local, sans EQ/normalisation) ----
	// Vers la fin d'un titre, on démarre le suivant sur l'AUTRE élément et on croise les volumes.
	// `crossfadeMode` (réactif) garde l'élément courant dans l'effet de chargement ; `crossfading`
	// (non réactif) neutralise les effets lecture/volume pendant la transition.
	const crossfadeMode = $derived(settings.values.crossfadeSec > 0);
	let crossfading = false;
	let xfRaf: number | undefined;
	let xfAttemptId = ''; // id du titre pour lequel un fondu a déjà été tenté (anti-réessais)

	function crossfadeEligible(): boolean {
		return (
			settings.values.crossfadeSec > 0 &&
			!settings.values.eqEnabled &&
			!settings.values.volumeNormalization &&
			!audioCtx && // graphe jamais créé → eqEl est un élément « nu » réutilisable
			!player.shuffle &&
			player.repeat !== 'one'
		);
	}

	function maybeCrossfade() {
		if (crossfading || !crossfadeEligible()) return;
		const el = activeEl;
		if (!el || player.current?.source === 'radio') return;
		if (player.current && player.current.id === xfAttemptId) return; // déjà tenté pour ce titre
		// Durée fiable : le flux Jellyfin `universal` rapporte souvent duration=Infinity, d'où le
		// repli sur player.durationSec (déjà résolu via RunTimeTicks dans onTimeUpdate).
		const dur = player.durationSec;
		if (!Number.isFinite(dur) || dur <= 0) return;
		const xf = settings.values.crossfadeSec;
		const remaining = dur - el.currentTime;
		if (remaining > xf || remaining <= 0.25) return;
		const next = player.queue[player.currentIndex + 1];
		if (!next || !eqEligible(next.source)) return; // suivant séquentiel, musique/local
		startCrossfade(el, next, xf);
	}

	function startCrossfade(fromEl: HTMLAudioElement, next: import('$lib/types').Track, xf: number) {
		const otherEl = fromEl === audioEl ? eqEl : audioEl;
		if (!otherEl) return;
		crossfading = true;
		xfAttemptId = player.current?.id ?? ''; // évite de réessayer en boucle pour ce titre
		const target = player.volume;
		otherEl.volume = 0;
		otherEl.src = next.streamUrl;
		otherEl.playbackRate = player.playbackRate;
		otherEl.load();
		// On ne lance la rampe et le basculement QUE si le 2e élément démarre réellement.
		// Sur mobile, l'autoplay peut bloquer la lecture d'un 2e élément (démarrée sans geste)
		// → on annule alors le fondu et on laisse l'enchaînement normal (onEnded) se faire,
		// pour ne pas casser la lecture.
		otherEl
			.play()
			.then(() => {
				const start = performance.now();
				const durMs = xf * 1000;
				const step = (now: number) => {
					const t = Math.min(1, (now - start) / durMs);
					fromEl.volume = target * (1 - t);
					otherEl.volume = target * t;
					if (t < 1) {
						xfRaf = requestAnimationFrame(step);
					} else {
						finishCrossfade(fromEl, otherEl, target);
					}
				};
				xfRaf = requestAnimationFrame(step);
			})
			.catch(() => {
				otherEl.pause();
				otherEl.removeAttribute('src');
				otherEl.load();
				crossfading = false; // enchaînement normal via onEnded
			});
	}

	function finishCrossfade(fromEl: HTMLAudioElement, otherEl: HTMLAudioElement, target: number) {
		fromEl.pause();
		fromEl.removeAttribute('src');
		fromEl.load();
		otherEl.volume = target;
		activeEl = otherEl;
		// advanceEnded retire le titre fini et avance l'index (playing reste vrai). Le nouvel
		// élément joue déjà : les effets de chargement/lecture sont neutralisés par `crossfading`.
		player.advanceEnded();
		setTimeout(() => {
			crossfading = false;
		}, 200);
	}

	// Metadata (and therefore a seekable duration) isn't available the instant `src` is set —
	// setting currentTime before `loadedmetadata` fires is silently ignored by the browser, so
	// the resume position is stashed here and applied once metadata is actually ready.
	let pendingResumeSec = 0;

	// Chien de garde anti-blocage : suit la progression de lecture (position + horodatage). Sert
	// à détecter une lecture FIGÉE sans événement `error` (buffering qui ne repart pas, coupure
	// réseau silencieuse, onglet mobile mis en veille…), fréquent sur les flux podcast externes.
	let lastProgressPos = 0;
	let lastProgressAt = 0;

	// Reprise automatique sur erreur reseau/decodage transitoire (blip reseau mobile, session de
	// transcodage Jellyfin expiree...) : sans ca, un pepin passager arretait la lecture pour de
	// bon au lieu de reprendre toute seule.
	let retryCount = 0;
	let retryTimer: ReturnType<typeof setTimeout> | undefined;

	$effect(() => {
		const track = player.current;
		const useEq = graphActive; // dépend de eqEnabled/volumeNormalization + source
		const xfMode = crossfadeMode;
		if (!track) return;
		// Transition de fondu en cours : le nouvel élément joue déjà, ne pas recharger.
		if (crossfading) return;
		untrack(() => {
			if (useEq) ensureEqGraph();
			applyNormalization(); // gain de normalisation pour ce titre
			// Élément cible : eqEl si l'EQ traite ce titre ; en mode fondu on CONSERVE l'élément
			// courant (le fondu alterne audioEl/eqEl) ; sinon élément direct par défaut.
			const target =
				useEq && audioCtx && eqEl ? eqEl : xfMode && activeEl ? activeEl : audioEl;
			if (!target) return;
			// Bascule d'élément (ex. activation de l'EQ en cours de lecture) : on récupère la
			// position de l'ancien élément pour reprendre au même endroit, puis on le met en pause
			// et on le vide pour qu'il ne rejoue pas et ne garde pas de flux en tâche de fond.
			let carryPos: number | undefined;
			if (activeEl && activeEl !== target) {
				const wasSameTrack = activeEl.src === track.streamUrl;
				if (wasSameTrack && Number.isFinite(activeEl.currentTime)) carryPos = activeEl.currentTime;
				activeEl.pause();
				activeEl.removeAttribute('src');
				activeEl.load();
			}
			activeEl = target;
			if (carryPos !== undefined || target.src !== track.streamUrl) {
				pendingResumeSec = carryPos ?? track.resumeSec ?? 0;
				diagnostics.log(
					'piste',
					`« ${track.title} » (${track.source})${pendingResumeSec > 0 ? ` — reprise à ${Math.round(pendingResumeSec)} s` : ''}`
				);
				retryCount = 0;
				clearTimeout(retryTimer);
				player.errorMessage = '';
				player.applyRateForCurrent();
				target.src = track.streamUrl;
				target.load();
			}
			// Politique autoplay : le contexte démarre « suspended » jusqu'à un geste utilisateur ;
			// la lecture étant toujours initiée par un clic, on le réveille ici.
			if (useEq && audioCtx?.state === 'suspended') audioCtx.resume().catch(() => {});
		});
	});

	// Application en direct des gains EQ (déplacement d'un curseur) sur le graphe actif.
	$effect(() => {
		const bands = settings.values.eqBands;
		untrack(() => {
			eqFilters.forEach((f, i) => {
				f.gain.value = clampGain(bands?.[i]);
			});
		});
	});
	// Réapplique le gain de normalisation quand le réglage change ou que le titre change
	// (couvre le cas où le graphe est déjà actif via l'EQ, sans rechargement de piste).
	$effect(() => {
		settings.values.volumeNormalization;
		player.current;
		untrack(() => applyNormalization());
	});

	// Fondu de volume à la lecture/pause (confort, façon Symfonium/Plexamp). N'agit que sur
	// audioEl.volume, jamais sur player.volume, pour ne pas interférer avec le réglage utilisateur
	// ni sa persistance. Désactivable dans les réglages.
	let fadeRaf: number | undefined;
	const FADE_MS = 320;
	// Le fondu utilise requestAnimationFrame, throttlé/suspendu quand l'onglet est masqué
	// (écran verrouillé sur mobile) : dans ce cas on règle le volume directement pour ne pas
	// laisser la lecture muette en arrière-plan.
	function canFade(): boolean {
		return settings.values.audioFade && typeof document !== 'undefined' && !document.hidden;
	}
	// Un play() rejeté par AbortError est bénin : il a été interrompu par un pause()/load()
	// concurrent, et l'élément reprendra tout seul. Ne PAS repasser en pause dans ce cas
	// (sinon l'UI affiche « pause » et il faut recliquer plusieurs fois pour reprendre).
	function isBenignPlayError(err: unknown): boolean {
		return err instanceof DOMException && err.name === 'AbortError';
	}
	/**
	 * Fondu de volume. Le fondu en cours est MÉMORISÉ (élément, cible, action de fin) afin de
	 * pouvoir le terminer d'un coup — voir `settleFade`.
	 *
	 * C'est indispensable : `requestAnimationFrame` est GELÉ quand l'app passe en arrière-plan.
	 * Un fondu interrompu à cet instant laissait le volume figé où il en était — parfois proche
	 * de zéro — et la lecture continuait donc en silence.
	 */
	let fadeEl: HTMLAudioElement | undefined;
	let fadeTarget = 0;
	let fadeDone: (() => void) | undefined;

	function fadeVolume(el: HTMLAudioElement, target: number, done?: () => void, durationMs = FADE_MS) {
		if (fadeRaf) cancelAnimationFrame(fadeRaf);
		fadeRaf = undefined;
		if (!canFade()) {
			el.volume = target;
			done?.();
			return;
		}
		fadeEl = el;
		fadeTarget = target;
		fadeDone = done;
		const from = el.volume;
		const start = performance.now();
		const step = (now: number) => {
			const t = Math.min(1, (now - start) / durationMs);
			el.volume = from + (target - from) * t;
			if (t < 1) {
				fadeRaf = requestAnimationFrame(step);
			} else {
				fadeRaf = undefined;
				fadeDone = undefined;
				done?.();
			}
		};
		fadeRaf = requestAnimationFrame(step);
	}

	/** Termine immédiatement un fondu en cours (volume à sa cible + action de fin exécutée). */
	function settleFade() {
		if (fadeRaf === undefined) return;
		cancelAnimationFrame(fadeRaf);
		fadeRaf = undefined;
		if (fadeEl) fadeEl.volume = fadeTarget;
		const done = fadeDone;
		fadeDone = undefined;
		done?.();
	}

	/**
	 * Garde-fou anti-silence : la lecture est en cours mais l'élément est (quasi) muet alors que
	 * le volume demandé ne l'est pas. Vécu en vrai — « ça repart visuellement mais sans son ».
	 * Deux causes possibles, toutes deux corrigées par ailleurs, mais ce filet rattrape le reste.
	 */
	function restoreVolumeIfMuted(reason: string) {
		const el = activeEl;
		if (!el || !player.playing || el.paused) return;

		// Élément muté : aucun son quel que soit le volume.
		if (el.muted) {
			el.muted = false;
			diagnostics.log('etat', `Élément muté rattrapé (${reason})`);
		}

		// Contexte Web Audio suspendu : l'élément « joue » mais sa sortie est coupée.
		if (audioCtx?.state === 'suspended') {
			audioCtx
				.resume()
				.then(() => diagnostics.log('etat', `Contexte audio réactivé (${reason})`))
				.catch(() => {});
		}

		if (fadeRaf !== undefined) return; // un fondu légitime est en cours
		if (player.volume <= 0.01 || el.volume > 0.01) return;
		el.volume = player.volume;
		diagnostics.log('etat', `Lecture muette rattrapée (${reason}) — volume rétabli`);
	}

	/**
	 * Démarre réellement la lecture de l'élément actif. Extrait de l'$effect ci-dessous pour
	 * pouvoir être appelé de façon IMPÉRATIVE.
	 *
	 * C'est essentiel pour les commandes externes (Bluetooth voiture, casque, écran verrouillé) :
	 * un handler qui se contente de `player.playing = true` ne fait RIEN si l'état vaut déjà
	 * `true` — l'affectation ne change pas la valeur, donc l'$effect ne se redéclenche pas et
	 * `play()` n'est jamais appelé. Or l'état peut avoir divergé de la réalité (l'autoradio a
	 * pris le focus audio, l'élément s'est mis en pause sans que l'app le sache). D'où le
	 * symptôme « il faut appuyer play/play/pause/play avant que ça reprenne ».
	 */
	/** Photographie de l'état audio réel, pour le journal. C'est ce qui manquait pour trancher
	 * entre « l'app n'a pas relancé » et « l'app a relancé mais le système ne sort aucun son ». */
	function audioSnapshot(el: HTMLAudioElement | undefined): string {
		if (!el) return 'aucun élément';
		const which = el === audioEl ? 'direct' : 'eq/fondu';
		return [
			which,
			el.paused ? 'en pause' : 'en lecture',
			`prêt=${el.readyState}`,
			`vol=${el.volume.toFixed(2)}`,
			el.muted ? 'MUET' : 'non muet',
			`pos=${Math.round(el.currentTime)}s`,
			`ctx=${audioCtx ? audioCtx.state : 'aucun'}`
		].join(', ');
	}

	function playActive() {
		const el = activeEl;
		if (!el || crossfading) return;
		// Le contexte Web Audio est ATTENDU avant de jouer : suspendu, il ne sort aucun son alors
		// que l'élément se déclare « en lecture ». Auparavant la reprise était lancée sans être
		// attendue, donc la lecture pouvait démarrer dans le vide. Android suspend volontiers ce
		// contexte après une interruption (appel, message vocal).
		if (audioCtx?.state === 'suspended') {
			audioCtx
				.resume()
				.then(() => diagnostics.log('etat', 'Contexte audio réactivé'))
				.catch((err) =>
					diagnostics.log(
						'erreur',
						`Contexte audio non réactivé : ${err instanceof Error ? err.message : err}`
					)
				);
		}
		// Un élément muté ne produit rien quel que soit le volume : on lève le doute.
		if (el.muted) {
			el.muted = false;
			diagnostics.log('etat', 'Élément audio démuté');
		}
		verifyPlaybackLater(el);
		if (canFade()) el.volume = 0;
		el.play()
			.then(() => fadeVolume(el, player.volume))
			.catch((err) => {
				// ⚠️ Le volume vient d'être mis à ZÉRO pour préparer le fondu. Il DOIT être rétabli
				// sur tous les chemins d'échec, sinon la lecture reprend muette.
				//
				// C'était le bug « ça repart visuellement mais sans son » : sur un AbortError
				// (play() interrompu par un pause()/load() concurrent — exactement ce qui se produit
				// au retour d'une autre application), on sortait sans toucher au volume, alors que
				// l'élément, lui, « reprend tout seul » comme le note isBenignPlayError. Il reprenait
				// donc à volume nul, et il fallait faire pause puis lecture pour s'en sortir.
				el.volume = player.volume;
				if (isBenignPlayError(err)) {
					diagnostics.log('etat', 'Lecture interrompue puis reprise seule — volume rétabli');
					return;
				}
				player.pause();
				player.errorMessage = `Lecture impossible : ${err instanceof Error ? err.message : err}`;
			});
	}

	/**
	 * Extinction douce du minuteur de sommeil : le volume descend sur quelques secondes avant la
	 * pause. Couper net réveille — c'est l'inverse du but d'un minuteur d'endormissement.
	 *
	 * Le volume de l'élément est remis à sa valeur à la fin : sans ça, la lecture suivante
	 * repartirait muette si le fondu était par ailleurs désactivé.
	 */
	const SLEEP_FADE_MS = 6000;
	const SLEEP_FADE_STEPS = 24;
	let sleepFadeTimer: ReturnType<typeof setInterval> | undefined;

	function fadeOutAndPause() {
		const el = activeEl;
		if (!el) {
			player.pause();
			return;
		}
		// Minuteur et NON requestAnimationFrame : rAF est gelé écran éteint, or c'est exactement
		// la situation d'un minuteur d'endormissement. Un setInterval continue de tourner (ralenti
		// en arrière-plan, ce qui reste largement suffisant pour une descente de 6 s).
		// Indépendant du réglage « fondu à la lecture/pause » : ce sont deux fonctions distinctes.
		clearInterval(sleepFadeTimer);
		const from = el.volume;
		let i = 0;
		sleepFadeTimer = setInterval(() => {
			i++;
			el.volume = Math.max(0, from * (1 - i / SLEEP_FADE_STEPS));
			if (i >= SLEEP_FADE_STEPS) {
				clearInterval(sleepFadeTimer);
				sleepFadeTimer = undefined;
				player.pause();
				el.volume = player.volume; // remet le niveau pour la prochaine lecture
				diagnostics.log('pause', 'Minuteur de sommeil : extinction en fondu');
			}
		}, SLEEP_FADE_MS / SLEEP_FADE_STEPS);
	}

	$effect(() => {
		sleep.setStopHandler(fadeOutAndPause);
		return () => sleep.setStopHandler(null);
	});

	/** Commande « lecture » venue de l'extérieur (Bluetooth, casque, écran verrouillé) ou de
	 * l'interface : on met l'état à jour ET on relance l'élément sans attendre la réactivité. */
	/**
	 * Contrôle différé : la position a-t-elle réellement avancé après une demande de lecture ?
	 *
	 * C'est le diagnostic décisif du symptôme « ça repart visuellement mais sans son ». Si la
	 * position AVANCE avec un volume correct et un contexte actif, alors l'application fait son
	 * travail et le silence vient du système (focus audio non restitué par Android après une
	 * interruption) — ce qui n'est pas corrigeable côté page. Si elle n'avance PAS, le problème
	 * est ici. On ne journalise que l'anomalie, pour ne pas noyer le journal.
	 */
	let verifyTimer: ReturnType<typeof setTimeout> | undefined;
	function verifyPlaybackLater(el: HTMLAudioElement) {
		clearTimeout(verifyTimer);
		const before = el.currentTime;
		verifyTimer = setTimeout(() => {
			if (!player.playing || activeEl !== el) return;
			const progressed = el.currentTime > before + 0.3;
			if (progressed && !el.paused && el.volume > 0.01 && audioCtx?.state !== 'suspended') return;
			diagnostics.log(
				'etat',
				`Contrôle 3 s après la demande — ${progressed ? 'position AVANCE' : 'position FIGÉE'} : ${audioSnapshot(el)}`
			);
		}, 3000);
	}

	function requestPlay(origin = 'commande') {
		diagnostics.log('lecture', `Demande de lecture (${origin}) — ${audioSnapshot(activeEl)}`);
		player.playing = true;
		playActive();
	}

	/** Bascule lecture/pause en se fiant à l'ÉTAT RÉEL de l'élément audio, et non au booléen
	 * interne : une bascule aveugle sur un état divergent produit le même « il faut appuyer deux
	 * fois » que les commandes Bluetooth. */
	function togglePlayback() {
		const el = activeEl;
		if (!el || el.paused) {
			requestPlay('interface');
		} else {
			// Journalisée aussi : sans cela, une pause faite à l'écran n'apparaissait pas dans la
			// chronologie alors que celles venues du Bluetooth y figuraient, ce qui rendait la
			// lecture du journal trompeuse.
			diagnostics.log('pause', 'Pause demandée (interface)');
			player.pause();
		}
	}

	$effect(() => {
		const el = activeEl;
		if (!el) return;
		const playing = player.playing;
		if (crossfading) return; // le fondu gère lui-même lecture/volume des deux éléments
		// untrack : ne dépend que de player.playing / activeEl (pas de player.volume / settings).
		untrack(() => {
			if (playing) {
				playActive();
			} else {
				fadeVolume(el, 0, () => el.pause());
			}
		});
	});

	$effect(() => {
		const el = activeEl;
		if (!el) return;
		// Réglage direct du volume : on annule un fondu en cours pour respecter la valeur choisie.
		const v = player.volume;
		if (crossfading) return; // le fondu pilote les volumes des deux éléments
		untrack(() => {
			if (fadeRaf) {
				cancelAnimationFrame(fadeRaf);
				fadeRaf = undefined;
			}
		});
		el.volume = v;
	});

	$effect(() => {
		const el = activeEl;
		if (!el) return;
		el.playbackRate = player.playbackRate;
	});

	// ---- Chien de garde anti-blocage ----
	// Pendant la lecture, si la position reste FIGÉE trop longtemps (sans `error` déclenché),
	// on recharge à la position courante et on relance — récupère les coupures silencieuses
	// (buffering bloqué, coupure réseau, onglet mobile réveillé) sur podcasts/radios notamment.
	const STALL_TIMEOUT_MS = 8000;
	$effect(() => {
		if (!player.playing) return;
		lastProgressAt = performance.now(); // repart propre à chaque (re)lecture
		const id = setInterval(() => {
			const el = activeEl;
			if (!el || !player.playing || crossfading) return;

			// Réconciliation d'état : l'app se croit en lecture alors que l'élément est en pause
			// (le système a repris le focus audio — GPS, appel, son du véhicule). On remet
			// l'état d'aplomb pour que la PROCHAINE commande « lecture » reparte du bon pied.
			// Prédicat et gardes anti-faux-positifs : voir $lib/playbackState (testé).
			//
			// On ne relance PAS automatiquement : après une perte de focus, la convention Android
			// est de rester en pause — se rallumer seul pendant un appel serait pénible.
			// Filet anti-silence, vérifié à chaque tour : une lecture muette est aussi gênante
			// qu'une lecture arrêtée, et bien plus déroutante.
			restoreVolumeIfMuted('chien de garde');

			if (isExternallyPaused(el, player.playing)) {
				diagnostics.log(
					'etat',
					`Pause externe détectée à ${Math.round(el.currentTime)} s (focus audio repris ?) — état réaligné`
				);
				player.playing = false;
				return;
			}

			const dur = player.durationSec;
			const nearEnd = dur > 0 && el.currentTime >= dur - 1.5;
			if (nearEnd) return; // fin naturelle : laisser onEnded gérer
			if (performance.now() - lastProgressAt < STALL_TIMEOUT_MS) return;
			// Lecture figée : on tente une récupération (une seule à la fois grâce au réarmement).
			diagnostics.log(
				'blocage',
				`Position figée à ${Math.round(el.currentTime)} s — rechargement et relance`
			);
			lastProgressAt = performance.now();
			pendingResumeSec = el.currentTime;
			el.load();
			el.play().catch(() => {});
		}, 4000);
		return () => clearInterval(id);
	});

	// ---- Scrobbling ListenBrainz ----
	// On soumet une écoute une fois par lecture, au seuil recommandé par ListenBrainz :
	// min(4 min, 50 % de la durée), pour les titres > 30 s ayant un artiste (musique).
	let scrobbledForId = '';
	function maybeScrobble() {
		const t = player.current;
		const conn = listenbrainz.connection;
		if (!conn || !t?.artist || t.source === 'radio' || t.id === scrobbledForId) return;
		const dur = player.durationSec;
		if (dur < 30) return;
		const threshold = Math.min(240, dur * 0.5);
		if (player.positionSec >= threshold) {
			scrobbledForId = t.id;
			submitListen(conn, { trackName: t.title, artistName: t.artist, releaseName: t.album }).catch(
				(err) => console.warn('[listenbrainz] écoute non soumise :', err)
			);
		}
	}

	// « En écoute » (playing_now) au démarrage d'un titre musical.
	let playingNowForId = '';
	$effect(() => {
		const t = player.current;
		const conn = listenbrainz.connection;
		if (!conn || !t?.artist || t.source === 'radio' || t.id === playingNowForId) return;
		playingNowForId = t.id;
		submitListen(conn, {
			trackName: t.title,
			artistName: t.artist,
			releaseName: t.album,
			playingNow: true
		}).catch((err) => console.warn('[listenbrainz] « en écoute » non soumis :', err));
	});

	// ---- Scrobbling Last.fm (indépendant de ListenBrainz : les deux se cumulent si connectés) ----
	// Mêmes seuils que ListenBrainz (règle officielle Last.fm : 50 % du titre ou 4 min, le plus
	// petit des deux, et titre > 30 s).
	let lastfmScrobbledForId = '';
	function maybeScrobbleLastfm() {
		const t = player.current;
		const conn = lastfm.connection;
		if (!conn || !t?.artist || t.source === 'radio' || t.id === lastfmScrobbledForId) return;
		const dur = player.durationSec;
		if (dur < 30) return;
		const threshold = Math.min(240, dur * 0.5);
		if (player.positionSec >= threshold) {
			lastfmScrobbledForId = t.id;
			lastfmScrobble(conn, {
				track: t.title,
				artist: t.artist,
				album: t.album,
				timestampSec: Math.floor(Date.now() / 1000)
			}).catch((err) => console.warn('[lastfm] scrobble non soumis :', err));
		}
	}

	// « En cours d'écoute » (now playing) au démarrage d'un titre musical.
	let lastfmPlayingNowForId = '';
	$effect(() => {
		const t = player.current;
		const conn = lastfm.connection;
		if (!conn || !t?.artist || t.source === 'radio' || t.id === lastfmPlayingNowForId) return;
		lastfmPlayingNowForId = t.id;
		lastfmUpdateNowPlaying(conn, { track: t.title, artist: t.artist, album: t.album }).catch((err) =>
			console.warn('[lastfm] « en écoute » non soumis :', err)
		);
	});

	function onTimeUpdate() {
		const el = activeEl;
		if (!el) return;
		player.positionSec = el.currentTime;
		// Progression réelle → réarme le chien de garde.
		if (el.currentTime !== lastProgressPos) {
			lastProgressPos = el.currentTime;
			lastProgressAt = performance.now();
		}
		// Le flux Jellyfin `universal` (mp3 transcodé progressif) rapporte souvent une durée
		// Infinity/NaN : sans repli, la barre de progression reste figée. On retombe alors sur la
		// durée connue de la piste (RunTimeTicks côté Jellyfin). Les radios (live, sans durée
		// connue) gardent 0 → barre inerte, ce qui est voulu.
		const elapsedDur = el.duration;
		player.durationSec =
			Number.isFinite(elapsedDur) && elapsedDur > 0 ? elapsedDur : (player.current?.durationSec ?? 0);
		// Saut d'outro podcast (par abonnement) : à N s de la fin, on amène la lecture à sa toute
		// fin pour sauter outro/pub → déclenche onEnded (enchaînement du suivant + marquage « lu »
		// via la synchro à 97 %). Rien à dupliquer : on réutilise la fin naturelle.
		const pc = player.current;
		if (pc?.source === 'podcast' && pc.podcastMeta && Number.isFinite(el.duration)) {
			const outro = podcastSkips.get(pc.podcastMeta.podcastId)?.outro ?? 0;
			const target = el.duration - 0.1;
			if (outro > 0 && el.duration > outro && el.currentTime >= el.duration - outro && el.currentTime < target) {
				el.currentTime = target;
				player.positionSec = target;
				return;
			}
		}
		maybeScrobble();
		maybeScrobbleLastfm();
		maybeCrossfade();
		// Barre de progression des contrôles média système (écran verrouillé / notification).
		if (player.durationSec > 0) {
			media.setPositionState({
				duration: player.durationSec,
				position: Math.min(el.currentTime, player.durationSec),
				playbackRate: el.playbackRate || 1
			});
		}
	}

	function onLoadedMetadata() {
		const el = activeEl;
		if (!el) return;
		const resumed = pendingResumeSec > 0;
		if (pendingResumeSec > 0) el.currentTime = pendingResumeSec;
		pendingResumeSec = 0;
		// Saut d'intro podcast (par abonnement) : uniquement en DÉBUT d'épisode (pas de reprise
		// en cours), pour passer générique/annonces. La lecture démarre alors à +N s.
		const pc = player.current;
		if (!resumed && pc?.source === 'podcast' && pc.podcastMeta) {
			const intro = podcastSkips.get(pc.podcastMeta.podcastId)?.intro ?? 0;
			if (intro > 0 && Number.isFinite(el.duration) && el.duration > intro) {
				el.currentTime = intro;
				player.positionSec = intro;
			}
		}
		// Le chargement a abouti (reprise automatique comprise) : on redonne le plein droit
		// a essai pour un futur incident sur cette piste.
		retryCount = 0;
		// .load() a remis playbackRate à 1 : on réapplique la vitesse choisie.
		el.playbackRate = player.playbackRate;
		// Enchainer un nouveau titre pendant que la lecture est deja en cours ne fait
		// PAS repasser player.playing par false->true (deja true) : l'effect qui appelle
		// .play() ne se redeclenche donc pas sur ce seul changement de piste. .load()
		// (déclenché par l'effect de piste) laisse le nouvel élément en pause -> sans ce
		// rattrapage, il fallait manuellement mettre pause puis lecture pour la relancer.
		if (player.playing) {
			el.play().catch((err) => {
				if (isBenignPlayError(err)) return;
				player.pause();
				player.errorMessage = `Lecture impossible : ${err instanceof Error ? err.message : err}`;
			});
		}
	}

	/** L'élément s'est mis à jouer : on aligne l'état si l'app se croyait en pause. Sans garde
	 * particulière — cet événement ne survient que lorsqu'une lecture démarre réellement. */
	function onAudioPlay(e: Event) {
		if (e.currentTarget !== activeEl) return;
		if (!player.playing) player.playing = true;
	}

	const AUDIO_ERROR_REASONS: Record<number, string> = {
		1: 'lecture interrompue',
		2: 'erreur réseau en chargeant le flux',
		3: 'format audio non décodable',
		4: "source audio refusée (URL inaccessible, ou contenu HTTP bloqué depuis une page HTTPS)"
	};

	const MAX_AUDIO_RETRIES = 3;
	const AUDIO_RETRY_DELAY_MS = 1500;
	/**
	 * Les radios sont un cas à part : ce sont des flux permanents, et la coupure typique (tunnel,
	 * changement d'antenne, wifi qui lâche) dure plus que 3 × 1,5 s. Avec les réglages communs, la
	 * station était abandonnée définitivement pour une interruption de quelques secondes.
	 * On insiste donc plus longtemps, avec une attente qui double (1,5 s → 24 s, ~47 s au total),
	 * ce qui laisse passer un tunnel sans harceler le serveur.
	 */
	const MAX_RADIO_RETRIES = 6;
	function retryDelayFor(source: string | undefined, attempt: number): number {
		if (source !== 'radio') return AUDIO_RETRY_DELAY_MS;
		return AUDIO_RETRY_DELAY_MS * 2 ** (attempt - 1);
	}
	// Reseau (2) et decodage (3) sont souvent transitoires sur un flux ; aborted (1, volontaire) et
	// source refusee (4, permanent) ne le sont pas — inutile de reessayer dans ces deux cas.
	const RETRYABLE_AUDIO_ERROR_CODES = new Set([2, 3]);

	function onAudioError(e: Event) {
		// Ignore une erreur émise par l'élément NON actif (ex. le 2e élément pendant un fondu) :
		// sinon on lirait le mauvais élément et on mettrait la lecture en pause à tort.
		if (e.currentTarget !== activeEl) return;
		const el = activeEl;
		if (!el) return;
		const code = el.error?.code;

		const reason = code ? (AUDIO_ERROR_REASONS[code] ?? 'inconnue') : 'inconnue';
		const source = player.current?.source;
		const maxRetries = source === 'radio' ? MAX_RADIO_RETRIES : MAX_AUDIO_RETRIES;

		if (code && RETRYABLE_AUDIO_ERROR_CODES.has(code) && retryCount < maxRetries) {
			retryCount += 1;
			const delay = retryDelayFor(source, retryCount);
			diagnostics.log(
				'erreur',
				`Erreur média ${code} (${reason}) à ${Math.round(el.currentTime)} s — tentative ${retryCount}/${maxRetries} dans ${Math.round(delay / 1000)} s`
			);
			const resumeAt = el.currentTime;
			const expectedSrc = el.src;
			clearTimeout(retryTimer);
			retryTimer = setTimeout(() => {
				// Abandonne si la piste a change entre-temps (skip manuel pendant l'attente).
				if (activeEl !== el || el.src !== expectedSrc) return;
				pendingResumeSec = resumeAt;
				el.load();
				if (player.playing) el.play().catch(() => {});
			}, delay);
			return;
		}

		diagnostics.log('erreur', `Erreur média ${code ?? '?'} (${reason}) — lecture abandonnée`);
		player.errorMessage = `Erreur de lecture : ${reason}`;
		player.pause();
	}

	function onEnded(e: Event) {
		// Ignore la fin émise par un élément non actif (2e élément résiduel).
		if (e.currentTarget !== activeEl) return;
		const el = activeEl;
		if (!el) return;
		// Pendant un fondu enchaîné, la fin de l'ancien titre est déjà gérée : on ignore.
		if (crossfading) return;
		// Repeat-one restarts the same track in place (src unchanged, so replay manually).
		if (player.repeat === 'one') {
			el.currentTime = 0;
			el.play().catch(() => player.pause());
			return;
		}
		// Minuteur de sommeil « fin du titre » : on s'arrête ici sans enchaîner.
		if (sleep.onTrackEnded()) {
			player.pause();
			return;
		}
		// Fin naturelle : retire le titre fini de la file et enchaîne le suivant
		// (musique comme podcasts « à suivre »).
		const finished = player.current;
		player.advanceEnded();
		// Lecture sans fin : file Jellyfin épuisée → on enchaîne un mix de titres similaires.
		if (
			settings.values.endlessPlayback &&
			finished?.source === 'jellyfin' &&
			player.queue.length === 0
		) {
			maybeStartEndlessRadio(finished);
		}
	}

	// Prolonge la lecture avec un Instant Mix Jellyfin amorcé sur le dernier titre joué.
	let endlessSeedId = '';
	async function maybeStartEndlessRadio(finished: import('$lib/types').Track) {
		const conn = jellyfin.connection;
		if (!conn) return;
		const seedId = finished.id.replace(/^jellyfin-/, '');
		if (seedId === endlessSeedId) return; // évite une boucle si le mix revient vide
		endlessSeedId = seedId;
		try {
			const mix = await getInstantMix(conn, seedId);
			if (mix.length > 0) {
				player.playCollection(mix.map((t) => songToTrack(conn, t)));
				toasts.info('Lecture sans fin : mix de titres similaires');
			}
		} catch {
			/* mix indisponible : la lecture s'arrête simplement */
		}
	}

	const repeatLabel = $derived(
		player.repeat === 'one'
			? 'Répéter : un titre'
			: player.repeat === 'all'
				? 'Répéter : tout'
				: 'Répéter : désactivé'
	);

	function seek(e: Event) {
		const value = Number((e.target as HTMLInputElement).value);
		if (activeEl) activeEl.currentTime = value;
		player.positionSec = value;
	}

	function setVolume(e: Event) {
		player.volume = Number((e.target as HTMLInputElement).value);
	}

	/** Positionne la lecture (utilisé par l'écran plein écran). */
	function seekTo(sec: number) {
		if (activeEl) activeEl.currentTime = sec;
		player.positionSec = sec;
	}

	const progressRatio = $derived(player.durationSec > 0 ? player.positionSec / player.durationSec : 0);
	const isLiveStream = $derived(player.current?.source === 'radio');

	function toggleMute() {
		if (player.volume > 0) {
			preMuteVolume = player.volume;
			player.volume = 0;
		} else {
			player.volume = preMuteVolume || 0.8;
		}
	}

	// ---- Contrôles média système (Media Session API) ----
	// Titre + sous-titre + pochette sur l'écran verrouillé / la notification / le casque.
	//
	// ⚠️ TOUT est enveloppé dans try/catch : selon la plateforme (Chrome Android, WebView…),
	// `new MediaMetadata`, l'affectation de `playbackState`/`metadata`, ou surtout
	// `setActionHandler` pour une action non supportée peuvent LEVER une exception. Non
	// capturée, elle plante l'$effect au moment de la lecture et démonte le chrome de l'app
	// (le lecteur « disparaît »). Media Session est purement décoratif ici : un échec ne
	// doit jamais casser l'UI.
	$effect(() => {
		const t = player.current;
		if (t) {
			media.setMetadata({
				title: t.title,
				artist: t.subtitle,
				album: 'Tentacle',
				artwork: t.artworkUrl ? [{ src: t.artworkUrl, sizes: '512x512' }] : []
			});
		}
	});
	$effect(() => {
		media.setPlaybackState(player.playing ? 'playing' : 'paused');
	});
	$effect(() => {
		const seekRel = (delta: number) => {
			const el = activeEl;
			if (!el) return;
			const max = Number.isFinite(el.duration) ? el.duration : el.currentTime + delta;
			el.currentTime = Math.max(0, Math.min(max, el.currentTime + delta));
		};
		// Handlers posés via le wrapper (natif + web). `stop` couvre les autoradios/casques qui
		// envoient un arrêt plutôt qu'une pause.
		// requestPlay (et non `player.playing = true`) : impératif, donc efficace même si l'état
		// interne se croyait déjà en lecture — cas typique après une perte de focus audio en
		// voiture. C'est le correctif du « play/play/pause/play » nécessaire pour redémarrer.
		media.setActionHandler('play', () => requestPlay('Bluetooth / écran verrouillé'));
		media.setActionHandler('pause', () => {
			diagnostics.log('pause', 'Pause demandée (Bluetooth / écran verrouillé)');
			player.pause();
		});
		media.setActionHandler('stop', () => {
			diagnostics.log('pause', 'Arrêt demandé (Bluetooth / écran verrouillé)');
			player.pause();
		});
		media.setActionHandler('previoustrack', () => player.prev());
		media.setActionHandler('nexttrack', () => player.next());
		media.setActionHandler('seekbackward', (d) => seekRel(-(d.seekTime ?? 10)));
		media.setActionHandler('seekforward', (d) => seekRel(d.seekTime ?? 10));
		media.setActionHandler('seekto', (d) => {
			if (activeEl && d.seekTime != null) activeEl.currentTime = d.seekTime;
		});
		return () => {
			for (const a of [
				'play',
				'pause',
				'stop',
				'previoustrack',
				'nexttrack',
				'seekbackward',
				'seekforward',
				'seekto'
			] as const) {
				media.setActionHandler(a, null);
			}
		};
	});

	// Remonte les erreurs de lecture en toast (sinon seulement visibles dans la barre lecteur).
	let lastError = '';
	$effect(() => {
		const msg = player.errorMessage;
		if (msg && msg !== lastError) toasts.error(msg);
		lastError = msg;
	});

	// ---- Raccourcis clavier (desktop) ----
	$effect(() => {
		function onKey(e: KeyboardEvent) {
			if (isAuthPage) return;
			// Palette de commandes : Ctrl/Cmd+K, même depuis un champ de saisie.
			if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
				e.preventDefault();
				commandPaletteOpen = !commandPaletteOpen;
				return;
			}
			const el = e.target as HTMLElement | null;
			const tag = el?.tagName;
			const typing =
				tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable;
			if (typing) return;

			switch (e.key) {
				case ' ':
					// Laisse l'espace activer un bouton/lien qui a le focus.
					if (tag === 'BUTTON' || tag === 'A') return;
					e.preventDefault();
					togglePlayback();
					break;
				case 'ArrowLeft':
					e.preventDefault();
					if (e.shiftKey) player.prev();
					else if (activeEl) activeEl.currentTime = Math.max(0, activeEl.currentTime - 10);
					break;
				case 'ArrowRight':
					e.preventDefault();
					if (e.shiftKey) player.next();
					else if (activeEl && Number.isFinite(activeEl.duration))
						activeEl.currentTime = Math.min(activeEl.duration, activeEl.currentTime + 10);
					break;
				case 'm':
				case 'M':
					toggleMute();
					break;
				case '?':
					e.preventDefault();
					shortcutsOpen = !shortcutsOpen;
					break;
				case '/': {
					const search = document.querySelector<HTMLInputElement>('input[type="search"]');
					if (search) {
						e.preventDefault();
						search.focus();
					}
					break;
				}
			}
		}
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{#if !isAuthPage}
<PodcastProgressSync />
<AlarmHandler />

<!-- Élément direct (radios/podcasts + EQ désactivé). -->
<audio
	bind:this={audioEl}
	ontimeupdate={onTimeUpdate}
	onended={onEnded}
	onloadedmetadata={onLoadedMetadata}
	onplay={onAudioPlay}
	onerror={onAudioError}
></audio>
<!-- Second élément : sert au fondu enchaîné (élément « nu ») ET à l'égaliseur. `crossorigin`
	n'est PAS mis en dur ici : il n'est requis QUE pour le graphe Web Audio (posé dynamiquement
	dans ensureEqGraph). En dur, il ferait échouer la lecture des flux Jellyfin sans en-tête CORS
	(fondu enchaîné muet / titre suivant bloqué). -->
<audio
	bind:this={eqEl}
	ontimeupdate={onTimeUpdate}
	onended={onEnded}
	onloadedmetadata={onLoadedMetadata}
	onplay={onAudioPlay}
	onerror={onAudioError}
></audio>

<div class="crt-overlay" aria-hidden="true"></div>
{/if}

<ToastHost />
<ContextMenu />

{#if !isAuthPage}
	<NowPlaying
		open={nowPlayingOpen}
		onClose={() => (nowPlayingOpen = false)}
		onSeek={seekTo}
		onTogglePlay={togglePlayback}
		{remoteSupported}
		onCastRemote={promptRemote}
		{jellyfinCastable}
		onCastJellyfin={(e) => castToJellyfin(e.clientX, e.clientY)}
	/>
	<CommandPalette
		open={commandPaletteOpen}
		onClose={() => (commandPaletteOpen = false)}
		onOpenNowPlaying={() => (nowPlayingOpen = true)}
	/>
	<ShortcutsHelp open={shortcutsOpen} onClose={() => (shortcutsOpen = false)} />
{/if}

<!--
	{@render children()} n'apparaît qu'UNE seule fois ci-dessous, quel que soit isAuthPage.
	Historiquement il y avait deux points d'appel (un pour les pages d'auth, un pour le reste) :
	Svelte ne "déplace" pas un rendu de snippet entre deux emplacements différents du template
	quand la condition qui les sépare change — au passage de isAuthPage=true à false (juste après
	la création de l'admin ou la connexion), l'ancien rendu restait orphelin dans le DOM à côté du
	nouveau chrome, d'où la page figée nécessitant un rechargement manuel. Le chrome (header/nav/
	footer) est donc désormais conditionné séparément, autour d'un unique site de rendu.
-->
<div class="app-shell" class:app-shell--auth={isAuthPage}>
	{#if !isAuthPage}
	<header class="app-header">
		<a href="/" class="brand" aria-label="Tentacle, accueil">
			<span class="brand__mark" aria-hidden="true">
				<svg viewBox="0 0 24 24" shape-rendering="crispEdges" width="40" height="40">
					<g fill="var(--gold-bright)">
						<rect x="8" y="2" width="8" height="2" />
						<rect x="6" y="4" width="12" height="2" />
						<rect x="4" y="6" width="16" height="6" />
						<rect x="4" y="12" width="4" height="2" />
						<rect x="16" y="12" width="4" height="2" />
					</g>
					<g fill="var(--coral)">
						<rect x="6" y="8" width="3" height="3" />
						<rect x="15" y="8" width="3" height="3" />
						<rect x="2" y="14" width="4" height="2" />
						<rect x="2" y="16" width="2" height="4" />
						<rect x="8" y="14" width="2" height="8" />
						<rect x="6" y="20" width="4" height="2" />
						<rect x="14" y="14" width="2" height="6" />
						<rect x="12" y="18" width="4" height="2" />
						<rect x="18" y="14" width="4" height="2" />
						<rect x="20" y="16" width="2" height="4" />
					</g>
					<g fill="var(--ink)">
						<rect x="7" y="9" width="1" height="1" />
						<rect x="16" y="9" width="1" height="1" />
					</g>
				</svg>
			</span>
			<span class="brand__text">
				<strong>TENTACLE</strong>
				<small>Audio System 03</small>
			</span>
		</a>
		<div class="header-lights" aria-hidden="true">
			<span class="lamp lamp--on"></span>
			<span class="lamp"></span>
			<span class="lamp lamp--warm"></span>
		</div>
		<div class="header-right">
			<span class="app-header__tagline">Personal Audio Terminal</span>
			<button
				type="button"
				class="header-gear"
				class:is-active={ui.activeSpace === 'config'}
				onclick={() => (ui.activeSpace = 'config')}
				aria-label="Configuration"
				aria-pressed={ui.activeSpace === 'config'}
				title="Configuration"
			>⚙</button>
			{#if data.user}
				<div class="user-menu">
					{#if syncState.error}
						<span class="sync-warn" title="La configuration n'a pas pu être synchronisée avec le serveur. Tes changements restent en local et seront renvoyés au prochain essai.">⚠ Non synchronisé</span>
					{/if}
					<span class="user-name" title={data.user.isAdmin ? 'Administrateur' : 'Utilisateur'}>
						{data.user.username}{#if data.user.isAdmin}<span class="user-name__admin"> ★</span>{/if}
					</span>
					<form method="POST" action="/logout">
						<button type="submit" class="pixel-btn pixel-btn--ghost user-menu__logout">Déconnexion</button>
					</form>
				</div>
			{/if}
		</div>
	</header>

	<nav class="space-nav" aria-label="Espaces d'écoute">
		<div class="space-nav__tablist" role="tablist" use:tablist>
			{#each spaces.filter((s) => s.id !== 'config') as space (space.id)}
				<button
					type="button"
					role="tab"
					aria-selected={ui.activeSpace === space.id}
					tabindex={ui.activeSpace === space.id ? 0 : -1}
					class="space-nav__tab"
					class:is-active={ui.activeSpace === space.id}
					onclick={() => (ui.activeSpace = space.id)}
				>
					<span class="space-nav__glyph" aria-hidden="true">{space.glyph}</span>
					{space.label}
				</button>
			{/each}
		</div>
	</nav>
	{/if}

	<main class="app-main" class:app-main--auth={isAuthPage}>
		{#if !isAuthPage && data.user && !syncState.loaded}
			<!-- Web : bref voile pendant l'hydratation du profil serveur, pour ne pas
			     afficher un état « non connecté » erroné avant que la config arrive. -->
			<p class="profile-loading">Chargement de ta configuration…</p>
		{:else}
			<!-- Instance vitrine (DEMO_MODE=1) : proposer le catalogue d'exemple plutôt qu'un
			     écran « relie une source » à un visiteur qui n'a aucun serveur. -->
			<DemoInvite enabled={Boolean(data.demoMode)} />
			{@render children()}
		{/if}
	</main>

	{#if !isAuthPage}
	<footer class="player-bar" class:player-bar--open={playerOpen} aria-label="Lecteur audio">
		<!-- Mini-lecteur : visible uniquement sur mobile. Une ligne compacte
		     (pochette + titre + lecture/pause + suivant + bouton déplier). -->
		<div class="player-mini">
			<div class="player-mini__art" aria-hidden="true">
				{#if player.current?.artworkUrl}
					<img src={player.current.artworkUrl} alt="" />
				{/if}
			</div>
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="player-mini__info"
				onpointerdown={onMiniDown}
				onpointerup={onMiniUp}
				title="Glisser : titre précédent/suivant · toucher ou glisser vers le haut : plein écran"
			>
				<strong>{player.current?.title ?? 'File vide'}</strong>
				<small>{player.current?.subtitle ?? 'Ajoutez un morceau'}</small>
			</div>
			<button type="button" class="pixel-btn pixel-btn--play mini-play" onclick={togglePlayback} aria-label={player.playing ? 'Pause' : 'Lire'}>
				{player.playing ? '⏸' : '▶'}
			</button>
			<button type="button" class="pixel-btn pixel-btn--ghost mini-next" onclick={() => player.next()} aria-label="Piste suivante">⏭</button>
			<button
				type="button"
				class="pixel-btn pixel-btn--ghost mini-toggle"
				aria-expanded={playerOpen}
				onclick={() => (playerOpen = !playerOpen)}
				aria-label={playerOpen ? 'Réduire le lecteur' : 'Déplier le lecteur'}
				title={playerOpen ? 'Réduire le lecteur' : 'Déplier le lecteur'}
			>{playerOpen ? '▾' : '▴'}</button>
		</div>

		<!-- Boîtier « Walkman » : façade métal usé, cassette à travers la vitre, boutons en bas.
		     Décoratif mais fonctionnel — voir les commentaires. -->
		<div class="walkman">
			<div class="wk-top">
				<div class="wk-left">
					<div class="wk-brand">TENTACLE<span>///</span></div>
					<div class="wk-sub">Stereo Cassette Player</div>
					<div class="wk-grille" aria-hidden="true"></div>
				</div>

				<div class="wk-window">
					{#if sleep.active}
						<!-- Rappel permanent : le minuteur ne vivait que dans l'écran plein écran et
						     la palette, donc on pouvait oublier qu'il tourne. Cliquer l'annule. -->
						<button
							type="button"
							class="wk-sleep"
							onclick={() => sleep.cancel()}
							title="Minuteur de sommeil actif — cliquer pour annuler"
						>
							☾ {sleep.endOfTrack
								? 'fin du titre'
								: `${Math.ceil((sleep.remainingSec ?? 0) / 60)} min`}
						</button>
					{/if}
					<div class="wk-cassette">
						<span class="wk-reel" class:is-live={player.playing} aria-hidden="true"></span>
						<button
							type="button"
							class="wk-label"
							onclick={() => (nowPlayingOpen = true)}
							title="Ouvrir le lecteur plein écran"
							aria-label="Ouvrir le lecteur plein écran"
						>
							{#if player.current}
								<div class="wk-title">{player.current.title}</div>
								<div class="wk-artist">{player.current.subtitle}</div>
							{:else}
								<div class="wk-title wk-title--empty">File vide</div>
								<div class="wk-artist">Ajoutez un morceau</div>
							{/if}
						</button>
						<span class="wk-reel" class:is-live={player.playing} aria-hidden="true"></span>
					</div>

					<!-- Ruban = barre de progression cliquable (input range transparent par-dessus). -->
					<div class="wk-seek" style:--progress={isLiveStream ? '100%' : `${progressRatio * 100}%`}>
						<div class="wk-seek__tape" aria-hidden="true"></div>
						{#if !isLiveStream}
							<input
								type="range"
								min="0"
								max={player.durationSec || 0}
								value={player.positionSec}
								oninput={seek}
								aria-label="Progression"
							/>
						{/if}
					</div>
					<div class="wk-time">
						<span>{formatTime(player.positionSec)}</span>
						{#if isLiveStream}
							<span class="wk-live" class:is-on={player.playing}>● DIRECT</span>
						{:else}
							<span>{formatTime(player.durationSec)}</span>
						{/if}
					</div>

					<div class="wk-glass" aria-hidden="true"></div>
				</div>

				<div class="wk-right">
					<button
						type="button"
						class="wk-collapse"
						onclick={() => (playerOpen = false)}
						aria-label="Réduire le lecteur"
						title="Réduire le lecteur"
					>▾</button>
					<div class="wk-meter" class:is-live={player.playing} aria-hidden="true">
						<i></i><i></i><i></i><i></i><i></i>
					</div>
					<div class="wk-vol">
						<input type="range" min="0" max="1" step="0.01" value={player.volume} oninput={setVolume} aria-label="Volume" />
						<small>VOL</small>
					</div>
					<div class="wk-power">
						<span class="wk-led" class:on={player.playing}></span>
						<small>POWER</small>
					</div>
				</div>
			</div>

			<div class="wk-deck" aria-label="Commandes de lecture">
				<button type="button" class="wk-btn" class:is-active={player.shuffle} aria-pressed={player.shuffle} onclick={() => player.toggleShuffle()} aria-label="Lecture aléatoire" title="Lecture aléatoire">
					<span class="wk-btn__led" class:on={player.shuffle}></span><span class="wk-btn__gl">⇄</span>
				</button>
				<button type="button" class="wk-btn" onclick={() => player.prev()} aria-label="Piste précédente">
					<span class="wk-btn__led"></span><span class="wk-btn__gl">⏮</span>
				</button>
				<button type="button" class="wk-btn wk-btn--play" onclick={togglePlayback} aria-label={player.playing ? 'Pause' : 'Lire'}>
					<span class="wk-btn__led on"></span><span class="wk-btn__gl">{player.playing ? '⏸' : '▶'}</span>
				</button>
				<button type="button" class="wk-btn" onclick={() => player.next()} aria-label="Piste suivante">
					<span class="wk-btn__led"></span><span class="wk-btn__gl">⏭</span>
				</button>
				<button type="button" class="wk-btn" class:is-active={player.repeat !== 'off'} aria-pressed={player.repeat !== 'off'} onclick={() => player.cycleRepeat()} aria-label={repeatLabel} title={repeatLabel}>
					<span class="wk-btn__led" class:on={player.repeat !== 'off'}></span><span class="wk-btn__gl">{player.repeat === 'one' ? '↻¹' : '↻'}</span>
				</button>
				<button type="button" class="wk-btn wk-btn--queue" class:is-active={queueOpen} aria-expanded={queueOpen} onclick={() => (queueOpen = !queueOpen)} aria-label="File d'attente" title="File d'attente">
					<span class="wk-btn__led" class:on={player.queue.length > 0}></span><span class="wk-btn__gl">☰</span>
					{#if player.queue.length > 0}<span class="wk-btn__badge">{player.queue.length}</span>{/if}
				</button>
			</div>

			{#if queueOpen}
				<div class="wk-queue scanlines">
					<div class="wk-queue__head">
						<span class="label-tag">File d'attente</span>
						{#if player.queue.length > 0}
							<span class="wk-queue__actions">
								{#if jellyfin.connected && player.queue.some((t) => t.source === 'jellyfin')}
									<button type="button" class="queue-clear" onclick={saveQueueAsPlaylist} title="Enregistrer la file comme playlist Jellyfin">Playlist</button>
								{/if}
								<button type="button" class="queue-clear" onclick={() => player.clearQueue()} title="Vider la file">Vider</button>
							</span>
						{/if}
					</div>
					<ul bind:this={queueUl}>
						{#if player.queue.length === 0}
							<li class="queue-empty">File vide</li>
						{:else}
							{#each player.queue as track, i (track.id)}
								<li class:is-current={i === player.currentIndex} class:is-dragging={i === dragIndex}>
									<button
										type="button"
										class="queue-drag"
										aria-label="Réordonner (glisser, ou ↑/↓)"
										title="Glisser pour réordonner"
										onpointerdown={(e) => onQueueDragStart(e, i)}
										onpointermove={onQueueDragMove}
										onpointerup={onQueueDragEnd}
										onpointercancel={onQueueDragEnd}
										onkeydown={(e) => onQueueHandleKey(e, i)}
									>⋮⋮</button>
									<button type="button" class="queue-jump" onclick={() => player.jumpTo(i)} title="Lire ce titre">{track.title}</button>
									<button type="button" class="queue-remove" onclick={() => player.removeFromQueue(track.id)} aria-label="Retirer de la file" title="Retirer">✕</button>
								</li>
							{/each}
						{/if}
					</ul>
				</div>
			{/if}

			<p class="app-version" title={`Tentacle v${appVersion} — commit ${appCommit} — build du ${appBuildDate}`}>
				<span>v{appVersion} · {appCommit} · {appBuildDate}</span>
				<span class="sep">·</span>
				<a href={LICENCE_URL} target="_blank" rel="noopener noreferrer">{LICENCE_LABEL}</a>
				<span class="sep">·</span>
				<span>{FREE_LABEL} {DONATION_LABEL}</span>
				{#if supportEnabled}
					<span class="sep">·</span>
					<!-- Lien direct : contrairement au widget flottant, il ne dépend d'aucun tiers
					     et reste donc présent même si le script de Ko-fi ne charge pas. -->
					<a href={kofiUrl()} target="_blank" rel="noopener noreferrer">{SUPPORT_LABEL}</a>
				{/if}
			</p>
		</div>
	</footer>
	{/if}
</div>

<style>
	.app-shell {
		display: flex;
		flex-direction: column;
		/* Hauteur de fenêtre fixe : seul .app-main défile → en-tête et lecteur restent
		   toujours visibles (le lecteur ne « disparaît » plus sous les longues listes).
		   dvh suit la barre d'URL mobile ; vh en repli pour les vieux navigateurs. */
		height: 100vh;
		height: 100dvh;
		overflow: hidden;
		position: relative;
		z-index: 1;
	}

	/* Pages d'authentification (login/setup) : rendues via le même unique site
	   {@render children()} que le reste de l'app (voir commentaire dans le
	   template), mais sans le chrome. On neutralise ici le modèle de boîte du
	   shell/main pour laisser le layout propre à ces pages (.auth-wrap) s'appliquer. */
	.app-shell--auth {
		display: block;
		height: auto;
		min-height: 0;
		overflow: visible;
	}

	.app-main--auth {
		flex: none;
		display: block;
		padding: 0;
		margin: 0;
		max-width: none;
		gap: 0;
		overflow: visible;
	}

	/* ---- Header : plaque métallique de gare, lampes témoins ---- */

	.app-header {
		display: flex;
		flex-shrink: 0;
		align-items: center;
		gap: 1.25rem;
		padding: 0.85rem 1.5rem;
		/* PWA plein écran (viewport-fit=cover) : décale l'en-tête sous la barre
		   d'état / l'encoche. env() vaut 0 hors de ce contexte -> sans effet ailleurs. */
		padding-top: calc(0.85rem + env(safe-area-inset-top));
		padding-left: calc(1.5rem + env(safe-area-inset-left));
		padding-right: calc(1.5rem + env(safe-area-inset-right));
		background:
			linear-gradient(180deg, var(--panel-hi) 0%, var(--panel) 18%, var(--panel) 82%, var(--panel-lo) 100%);
		border-bottom: var(--header-border-w, 4px) solid var(--bezel);
		box-shadow: var(
			--header-shadow,
			0 4px 0 0 var(--shadow),
			0 -3px 0 0 inset rgba(255, 255, 255, 0.05)
		);
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 0.85rem;
		text-decoration: none;
		color: var(--cream-bright);
	}

	.brand__mark {
		display: grid;
		place-items: center;
		width: 3.25rem;
		height: 3.25rem;
		background: var(--plum-deep);
		border: var(--border-w, 3px) solid var(--bezel);
		border-radius: var(--radius-control, 0);
		box-shadow:
			0 0 0 1px var(--metal-dark),
			0 0 14px 0 var(--glow),
			0 -4px 0 0 inset rgba(0, 0, 0, 0.45);
	}

	.brand__text {
		display: flex;
		flex-direction: column;
		line-height: 1.15;
	}

	.brand__text strong {
		font-size: 1.5rem;
		letter-spacing: 0.14em;
		color: var(--cream-bright);
		text-shadow: 0 0 10px var(--glow), 2px 2px 0 var(--bezel);
	}

	.brand__text small {
		color: var(--gold);
		font-size: 0.7rem;
		letter-spacing: 0.28em;
		text-transform: uppercase;
	}

	.header-lights {
		display: flex;
		gap: 0.5rem;
		margin-left: 0.5rem;
	}

	.lamp {
		width: 0.65rem;
		height: 0.65rem;
		background: var(--metal-dark);
		border: 2px solid var(--bezel);
		border-radius: var(--radius-chip, 0);
		box-shadow: 0 -2px 0 0 inset rgba(0, 0, 0, 0.5);
	}

	.lamp--on {
		background: var(--teal);
		box-shadow: 0 0 8px 1px var(--teal);
		animation: lamp-blink 4s steps(1) infinite;
	}

	.lamp--warm {
		background: var(--gold-bright);
		box-shadow: 0 0 8px 1px var(--glow);
		animation: lamp-blink 7s steps(1) infinite reverse;
	}

	@keyframes lamp-blink {
		0%, 92% { opacity: 1; }
		93%, 100% { opacity: 0.35; }
	}

	.header-right {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 0.9rem;
	}

	.app-header__tagline {
		color: var(--muted);
		font-size: 0.72rem;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		text-shadow: 1px 1px 0 var(--bezel);
	}

	/* Roue crantée = accès Configuration (remplace l'onglet dans la nav). */
	.header-gear {
		font-family: var(--font-pixel);
		display: grid;
		place-items: center;
		width: 2.4rem;
		height: 2.4rem;
		flex-shrink: 0;
		font-size: 1.2rem;
		color: var(--cream);
		background: linear-gradient(180deg, var(--panel-hi) 0%, var(--panel) 45%, var(--panel-lo) 100%);
		border: var(--border-w, 3px) solid var(--bezel);
		border-radius: var(--radius-control, 0);
		box-shadow: var(--tab-shadow, 0 -4px 0 0 inset var(--shadow));
		cursor: pointer;
	}

	.header-gear:hover {
		color: var(--cream-bright);
		box-shadow: var(--tab-shadow-hover, 0 -4px 0 0 inset var(--shadow), 0 0 10px 0 var(--glow-faint));
	}

	.header-gear.is-active {
		background: linear-gradient(180deg, var(--gold-bright) 0%, var(--gold) 55%, var(--rust) 145%);
		color: var(--ink);
	}

	.user-menu {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}

	.user-name {
		font-size: 0.8rem;
		color: var(--cream-bright);
		letter-spacing: 0.04em;
	}

	.user-name__admin {
		color: var(--gold-bright);
	}

	.sync-warn {
		font-size: 0.7rem;
		color: var(--coral);
		border: 2px solid var(--bezel);
		border-radius: var(--radius-chip, 0);
		padding: 0.15rem 0.45rem;
		white-space: nowrap;
	}

	.user-menu__logout {
		font-size: 0.7rem;
		padding: 0.35rem 0.6rem;
	}

	/* ---- Nav : onglets-cartouches façon panneau de destinations ---- */

	.space-nav {
		flex-shrink: 0;
		padding: 1rem 1.5rem 0;
	}

	.space-nav__tablist {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.6rem;
	}

	.space-nav__tab {
		font-family: var(--font-pixel);
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		background: linear-gradient(180deg, var(--panel-hi) 0%, var(--panel) 45%, var(--panel-lo) 100%);
		color: var(--cream);
		border: var(--border-w, 3px) solid var(--bezel);
		border-radius: var(--radius-control, 0);
		padding: 0.55rem 1.05rem 0.65rem;
		cursor: pointer;
		text-transform: uppercase;
		font-size: 0.8rem;
		letter-spacing: 0.07em;
		clip-path: var(
			--tab-clip,
			polygon(
				0 6px, 6px 6px, 6px 0,
				calc(100% - 6px) 0, calc(100% - 6px) 6px, 100% 6px,
				100% calc(100% - 6px), calc(100% - 6px) calc(100% - 6px), calc(100% - 6px) 100%,
				6px 100%, 6px calc(100% - 6px), 0 calc(100% - 6px)
			)
		);
		box-shadow: var(--tab-shadow, 0 -5px 0 0 inset var(--shadow));
		transition: none;
	}

	.space-nav__glyph {
		color: var(--gold);
		font-size: 0.9rem;
	}

	.space-nav__tab:hover {
		color: var(--cream-bright);
		box-shadow: var(--tab-shadow-hover, 0 -5px 0 0 inset var(--shadow), 0 0 10px 0 var(--glow-faint));
	}

	.space-nav__tab.is-active {
		background: linear-gradient(180deg, var(--gold-bright) 0%, var(--gold) 55%, var(--rust) 145%);
		color: var(--ink);
		text-shadow: 0 1px 0 rgba(255, 255, 255, 0.35);
		box-shadow: var(
			--tab-shadow-active,
			0 -5px 0 0 inset rgba(0, 0, 0, 0.28),
			0 0 16px 0 var(--glow)
		);
	}

	.space-nav__tab.is-active .space-nav__glyph {
		color: var(--ink);
	}

	.app-main {
		flex: 1;
		/* Seule zone défilante de l'app (le shell est à hauteur fixe). min-height:0 est
		   indispensable pour qu'un enfant flex puisse rétrécir et défiler. */
		min-height: 0;
		overflow-y: auto;
		overflow-x: hidden;
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		max-width: 72rem;
		width: 100%;
		margin: 0 auto;
	}

	.profile-loading {
		color: var(--muted);
		text-align: center;
		margin: 3rem 0;
	}

	/* ---- Player : boîtier « Walkman » pixel-art ---- */

	.player-bar {
		/* Dernier enfant du shell à hauteur fixe : reste toujours en bas, visible en
		   permanence (plus besoin de sticky, qui « décrochait » sur les longues listes). */
		flex-shrink: 0;
		z-index: 20;
		display: block;
		/* Marge horizontale identique à .app-main (1.5rem) pour que le boîtier s'aligne
		   exactement sur la largeur du contenu (bibliothèque, etc.). */
		padding: 0.7rem 1.5rem 0.9rem;
		/* Évite la barre de gestes / home indicator en bas en PWA plein écran. */
		padding-bottom: calc(0.9rem + env(safe-area-inset-bottom));
		padding-left: calc(1.5rem + env(safe-area-inset-left));
		padding-right: calc(1.5rem + env(safe-area-inset-right));
		border-top: var(--header-border-w, 4px) solid var(--bezel);
		background:
			linear-gradient(180deg, var(--panel-lo) 0%, var(--plum-deep) 30%, var(--plum-deep) 100%);
		box-shadow: var(--playerbar-shadow, 0 6px 0 0 inset var(--shadow));
	}

	/* Façade : métal patiné (dithering) + biseau craquant + scanlines. */
	.walkman {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
		/* Largeur exacte du contenu = max-width de .app-main (72rem) moins ses 2 × 1.5rem de
		   marge intérieure = 69rem, centré. Combiné au padding 1.5rem du footer, le boîtier
		   s'aligne pile sur la bibliothèque et les autres panneaux, à toutes les largeurs. */
		max-width: 69rem;
		width: 100%;
		margin: 0 auto;
		padding: 0.85rem;
		background:
			repeating-linear-gradient(45deg, rgba(0, 0, 0, 0.09) 0 2px, transparent 2px 4px),
			repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.025) 0 2px, transparent 2px 4px),
			var(--panel);
		border: 3px solid var(--bezel);
		box-shadow:
			inset 3px 3px 0 0 rgba(255, 255, 255, 0.1),
			inset -3px -3px 0 0 rgba(0, 0, 0, 0.5),
			inset 0 0 0 6px var(--panel-lo);
	}
	.walkman::after {
		content: '';
		position: absolute;
		inset: 0;
		pointer-events: none;
		background: repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.16) 0 2px, transparent 2px 4px);
	}

	.wk-top {
		display: flex;
		gap: 0.75rem;
		align-items: stretch;
	}

	/* ---- Gauche : marque + grille ---- */
	.wk-left {
		width: 180px;
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		min-width: 0;
	}
	.wk-brand {
		font-family: var(--font-pixel);
		font-weight: 700;
		font-size: 1.35rem;
		letter-spacing: 0.08em;
		color: var(--gold-bright);
		text-shadow: 2px 2px 0 var(--bezel);
	}
	.wk-brand span {
		color: var(--teal);
		font-size: 0.8rem;
		margin-left: 4px;
	}
	.wk-sub {
		font-size: 0.6rem;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--teal);
		margin-top: -2px;
	}
	.wk-grille {
		margin-top: auto;
		min-height: 3.4rem;
		border: 3px solid var(--bezel);
		background-color: var(--plum-deep);
		background-image: radial-gradient(var(--metal-dark) 1px, transparent 1.7px);
		background-size: 10px 10px;
		background-position: 5px 5px;
		box-shadow: inset 2px 2px 0 rgba(0, 0, 0, 0.5);
	}

	/* ---- Centre : fenêtre + cassette ---- */
	.wk-sleep {
		position: absolute;
		top: 3px;
		right: 3px;
		z-index: 2;
		font-family: var(--font-pixel);
		font-size: 0.6rem;
		letter-spacing: 0.04em;
		background: var(--plum-deep);
		color: var(--gold-bright);
		border: 1px solid var(--gold);
		border-radius: var(--radius-chip, 0);
		padding: 0.1rem 0.3rem;
		cursor: pointer;
	}
	.wk-sleep:hover {
		background: var(--gold);
		color: var(--ink);
	}

	.wk-window {
		flex: 1;
		min-width: 0;
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		padding: 0.6rem;
		background: var(--shadow);
		border: 3px solid var(--bezel);
		box-shadow: inset 3px 3px 0 rgba(0, 0, 0, 0.6);
		overflow: hidden;
	}
	.wk-cassette {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}
	.wk-reel {
		width: 54px;
		height: 54px;
		flex-shrink: 0;
		position: relative;
		background: var(--plum-deep);
		border: 3px solid var(--bezel);
		box-shadow: inset 2px 2px 0 rgba(255, 255, 255, 0.06);
	}
	.wk-reel::before {
		content: '';
		position: absolute;
		inset: 5px;
		background: repeating-conic-gradient(
			from 0deg,
			var(--metal-mid) 0 22.5deg,
			var(--panel) 22.5deg 45deg
		);
		-webkit-mask: radial-gradient(circle, transparent 26%, #000 27% 92%, transparent 93%);
		mask: radial-gradient(circle, transparent 26%, #000 27% 92%, transparent 93%);
	}
	.wk-reel.is-live::before {
		animation: wk-spin 3s steps(8) infinite;
	}
	.wk-reel::after {
		content: '';
		position: absolute;
		inset: 21px;
		background: var(--shadow);
		box-shadow: 0 0 0 2px var(--panel);
	}
	.wk-label {
		flex: 1;
		min-width: 0;
		display: block;
		text-align: center;
		cursor: pointer;
		font-family: var(--font-pixel);
		padding: 0.5rem 0.6rem;
		background: var(--cream);
		border: none;
		border-top: 3px solid var(--cream-bright);
		border-bottom: 3px solid var(--metal-dark);
	}
	.wk-label:hover {
		background: var(--cream-bright);
	}
	.wk-title {
		font-size: 1.05rem;
		color: var(--ink);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.wk-title--empty {
		color: var(--metal-dark);
	}
	.wk-artist {
		font-size: 0.68rem;
		letter-spacing: 0.06em;
		color: var(--metal-dark);
		margin-top: 2px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Ruban = progression cliquable (blocs pixel via dégradé sur --progress + curseur). */
	.wk-seek {
		position: relative;
		height: 14px;
		border: 3px solid var(--bezel);
		background:
			repeating-linear-gradient(90deg, transparent 0 3px, rgba(0, 0, 0, 0.18) 3px 4px),
			linear-gradient(
				90deg,
				var(--gold-bright) 0,
				var(--gold) var(--progress, 0%),
				var(--plum-deep) var(--progress, 0%)
			);
		box-shadow: inset 0 2px 0 rgba(0, 0, 0, 0.5);
	}
	.wk-seek__tape {
		display: none;
	}
	.wk-seek::after {
		content: '';
		position: absolute;
		top: -3px;
		bottom: -3px;
		left: var(--progress, 0%);
		width: 4px;
		transform: translateX(-2px);
		background: var(--cream-bright);
		box-shadow: 0 0 6px 0 var(--glow);
		pointer-events: none;
	}
	.wk-seek input[type='range'] {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		opacity: 0;
		cursor: pointer;
		margin: 0;
	}
	.wk-time {
		display: flex;
		justify-content: space-between;
		font-size: 0.62rem;
		letter-spacing: 0.06em;
		color: var(--teal);
	}
	.wk-live {
		color: var(--muted);
	}
	.wk-live.is-on {
		color: var(--coral);
		text-shadow: 0 0 8px var(--coral);
		animation: lamp-blink 3s steps(1) infinite;
	}
	/* Reflet vitre : bandes nettes en biais (pas de dégradé lisse). */
	.wk-glass {
		position: absolute;
		inset: 0;
		pointer-events: none;
		background: linear-gradient(
			120deg,
			transparent 0 46%,
			rgba(255, 255, 255, 0.06) 46% 49%,
			transparent 49% 55%,
			rgba(255, 255, 255, 0.04) 55% 57%,
			transparent 57%
		);
	}

	/* ---- Droite : vumètre + volume + power ---- */
	.wk-right {
		width: 66px;
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}
	.wk-meter {
		display: flex;
		flex-direction: column;
		gap: 3px;
		align-items: flex-end;
		width: 100%;
	}
	.wk-meter i {
		height: 5px;
		background: var(--metal-dark);
	}
	.wk-meter.is-live i {
		background: var(--gold-bright);
		box-shadow: 0 0 5px var(--glow);
		animation: wk-meter 0.8s steps(3) infinite alternate;
	}
	.wk-meter i:nth-child(1) { width: 60%; }
	.wk-meter i:nth-child(2) { width: 100%; animation-delay: 0.1s; }
	.wk-meter i:nth-child(3) { width: 45%; animation-delay: 0.25s; }
	.wk-meter i:nth-child(4) { width: 80%; animation-delay: 0.15s; }
	.wk-meter i:nth-child(5) { width: 30%; animation-delay: 0.3s; }
	.wk-vol {
		width: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 3px;
	}
	.wk-vol input[type='range'] {
		-webkit-appearance: none;
		appearance: none;
		width: 100%;
		height: 12px;
		margin: 0;
		cursor: pointer;
		background: repeating-linear-gradient(90deg, var(--plum-deep) 0 3px, var(--panel-hi) 3px 6px);
		border: 2px solid var(--bezel);
	}
	.wk-vol input[type='range']::-webkit-slider-thumb {
		-webkit-appearance: none;
		width: 8px;
		height: 16px;
		background: var(--gold-bright);
		border: 2px solid var(--bezel);
	}
	.wk-vol input[type='range']::-moz-range-thumb {
		width: 8px;
		height: 16px;
		border-radius: 0;
		background: var(--gold-bright);
		border: 2px solid var(--bezel);
	}
	.wk-vol small,
	.wk-power small {
		font-size: 0.5rem;
		letter-spacing: 0.14em;
		color: var(--metal-mid);
	}
	.wk-power {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 3px;
	}
	.wk-led {
		width: 12px;
		height: 12px;
		background: var(--metal-dark);
		box-shadow: inset -2px -2px 0 rgba(0, 0, 0, 0.4);
	}
	.wk-led.on {
		background: var(--coral);
		box-shadow: 0 0 8px var(--coral), inset -2px -2px 0 rgba(0, 0, 0, 0.4);
	}

	/* ---- Boutons en bas : blocs crantés + LED témoin ---- */
	.wk-deck {
		display: flex;
		gap: 0.5rem;
	}
	.wk-btn {
		flex: 1;
		position: relative;
		height: 50px;
		display: grid;
		place-items: center;
		cursor: pointer;
		font-family: var(--font-pixel);
		font-size: 1rem;
		color: var(--cream);
		background: var(--panel-hi);
		border: 3px solid var(--bezel);
		box-shadow:
			inset 2px 2px 0 rgba(255, 255, 255, 0.14),
			inset -2px -3px 0 rgba(0, 0, 0, 0.5),
			0 4px 0 var(--bezel);
	}
	.wk-btn:active {
		transform: translateY(2px);
		box-shadow: inset 2px 2px 0 rgba(255, 255, 255, 0.14), inset -2px -3px 0 rgba(0, 0, 0, 0.5), 0 2px 0 var(--bezel);
	}
	.wk-btn__led {
		position: absolute;
		top: 5px;
		left: 50%;
		transform: translateX(-50%);
		width: 20px;
		height: 4px;
		background: var(--plum-deep);
	}
	.wk-btn__led.on {
		background: var(--gold-bright);
		box-shadow: 0 0 6px var(--glow);
	}
	.wk-btn__gl {
		margin-top: 4px;
	}
	.wk-btn.is-active {
		color: var(--cream-bright);
		background: var(--panel);
	}
	.wk-btn--play {
		color: var(--ink);
		background: var(--gold-bright);
		box-shadow:
			inset 2px 2px 0 rgba(255, 255, 255, 0.5),
			inset -2px -3px 0 rgba(168, 84, 47, 0.7),
			0 4px 0 var(--rust);
	}
	.wk-btn--play:active {
		transform: translateY(2px);
		box-shadow: inset 2px 2px 0 rgba(255, 255, 255, 0.5), inset -2px -3px 0 rgba(168, 84, 47, 0.7), 0 2px 0 var(--rust);
	}
	.wk-btn__badge {
		position: absolute;
		top: -6px;
		right: -6px;
		min-width: 16px;
		height: 16px;
		padding: 0 3px;
		font-size: 0.55rem;
		display: grid;
		place-items: center;
		background: var(--coral);
		color: var(--ink);
		border: 2px solid var(--bezel);
	}

	/* ---- File d'attente (superposée) ---- */
	.wk-queue {
		position: relative; /* ancre la superposition .scanlines */
		border: 3px solid var(--bezel);
		background: var(--plum-deep);
		padding: 0.5rem 0.6rem;
		box-shadow: inset 2px 2px 0 rgba(0, 0, 0, 0.5);
	}
	.wk-queue__head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		margin-bottom: 0.35rem;
	}
	.wk-queue__actions {
		display: flex;
		gap: 0.4rem;
	}
	.wk-queue ul {
		list-style: none;
		margin: 0;
		padding: 0;
		max-height: 9rem;
		overflow-y: auto;
		font-size: 0.78rem;
	}
	.wk-queue li {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		color: var(--muted);
		padding: 0.1rem 0;
	}
	.wk-queue li.is-current {
		color: var(--gold-bright);
	}

	@keyframes wk-spin {
		to { transform: rotate(360deg); }
	}
	@keyframes wk-meter {
		from { opacity: 0.55; }
		to { opacity: 1; }
	}
	@media (prefers-reduced-motion: reduce) {
		.wk-reel.is-live::before,
		.wk-meter.is-live i {
			animation: none;
		}
	}

	.pixel-btn--play {
		min-width: 3.4rem;
		font-size: 1.05rem;
	}

	.queue-clear {
		background: none;
		border: none;
		cursor: pointer;
		color: var(--muted);
		font-family: var(--font-pixel);
		font-size: 0.6rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		padding: 0.1rem 0.3rem;
	}

	.queue-clear:hover {
		color: var(--coral);
	}

	.queue-jump {
		flex: 1;
		min-width: 0;
		background: none;
		border: none;
		cursor: pointer;
		text-align: left;
		color: inherit;
		font-family: var(--font-pixel);
		font-size: inherit;
		padding: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.queue-jump:hover {
		color: var(--gold-bright);
	}

	li.is-current .queue-jump::before {
		content: '▶ ';
		font-size: 0.65rem;
	}

	.queue-drag {
		flex-shrink: 0;
		background: none;
		border: none;
		cursor: grab;
		color: var(--metal-mid);
		font-size: 0.7rem;
		line-height: 1;
		padding: 0 0.15rem;
		letter-spacing: -2px;
		touch-action: none; /* la poignée capte le geste au lieu de faire défiler */
	}

	.queue-drag:hover {
		color: var(--gold-bright);
	}

	.wk-queue li.is-dragging {
		opacity: 0.6;
		background: var(--plum);
	}

	.queue-remove {
		flex-shrink: 0;
		background: none;
		border: none;
		cursor: pointer;
		color: var(--metal-mid);
		font-size: 0.7rem;
		line-height: 1;
		padding: 0.1rem 0.25rem;
	}

	.queue-remove:hover {
		color: var(--coral);
	}

	.queue-empty {
		color: var(--muted);
	}

	/* Mini-lecteur (mode réduit) : affiché quand le boîtier est replié, masqué quand ouvert —
	   sur web comme sur mobile. Le boîtier fait l'inverse. */
	.player-mini {
		display: none;
		align-items: center;
		gap: 0.5rem;
		max-width: 69rem;
		margin: 0 auto;
	}
	.player-bar:not(.player-bar--open) .player-mini {
		display: flex;
	}
	.player-bar:not(.player-bar--open) .walkman {
		display: none;
	}

	.player-mini__art {
		flex-shrink: 0;
		width: 2.5rem;
		height: 2.5rem;
		border: 2px solid var(--bezel);
		background: var(--plum-deep);
		overflow: hidden;
	}

	.player-mini__art img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.player-mini__info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		line-height: 1.15;
		cursor: pointer;
		touch-action: none; /* capte le geste (glisser) au lieu de le laisser défiler */
		user-select: none;
	}

	.player-mini__info strong {
		font-size: 0.85rem;
		color: var(--cream-bright);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.player-mini__info small {
		font-size: 0.7rem;
		color: var(--muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.player-mini .pixel-btn {
		flex-shrink: 0;
		padding: 0.4rem 0.6rem;
	}

	.wk-collapse {
		align-self: flex-end;
		background: none;
		border: none;
		cursor: pointer;
		color: var(--metal-mid);
		font-size: 0.85rem;
		line-height: 1;
		padding: 0 0.2rem;
	}

	.wk-collapse:hover {
		color: var(--gold-bright);
	}

	.app-version {
		margin: 0.5rem 0 0;
		font-size: 0.6rem;
		letter-spacing: 0.08em;
		color: var(--metal-mid);
		font-variant-numeric: tabular-nums;
		user-select: text;
		/* Licence, gratuité et soutien tiennent sur la même ligne que la version, et passent à
		   la ligne proprement sur téléphone plutôt que d'élargir le boîtier. */
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: center;
		gap: 0 0.35rem;
	}

	.app-version a {
		color: var(--metal-mid);
		text-decoration: underline;
	}
	.app-version a:hover {
		color: var(--gold-bright);
	}
	.app-version .sep {
		opacity: 0.55;
	}

	@media (max-width: 900px) {
		.app-header__tagline {
			display: none;
		}

		.user-menu {
			margin-left: auto;
		}
	}

	/* ---- Mobile (téléphone) : l'en-tête + la nav ne doivent pas manger tout l'écran ---- */
	@media (max-width: 600px) {
		.app-header {
			padding: 0.55rem 0.75rem;
			gap: 0.6rem;
		}

		.brand {
			gap: 0.55rem;
		}

		.brand__mark {
			width: 2.3rem;
			height: 2.3rem;
		}

		.brand__mark svg {
			width: 26px;
			height: 26px;
		}

		.brand__text strong {
			font-size: 1rem;
			letter-spacing: 0.08em;
		}

		.brand__text small {
			font-size: 0.52rem;
			letter-spacing: 0.16em;
		}

		.header-lights {
			display: none;
		}

		.space-nav {
			padding: 0.6rem 0.6rem 0;
		}

		.space-nav__tablist {
			display: grid;
			grid-template-columns: repeat(2, 1fr);
			gap: 0.4rem;
		}

		.space-nav__tab {
			padding: 0.5rem 0.4rem 0.55rem;
			font-size: 0.68rem;
			justify-content: center;
			gap: 0.3rem;
		}

		.app-main {
			padding: 0.75rem;
			gap: 0.75rem;
		}

		.player-bar {
			padding: 0.6rem 0.75rem 0.65rem;
		}

		/* Boîtier compact sur téléphone : colonnes empilées, grille masquée. */
		.wk-top {
			flex-direction: column;
		}

		.wk-left {
			width: 100%;
		}

		.wk-grille {
			display: none;
		}

		.wk-right {
			width: 100%;
			flex-direction: row;
			justify-content: space-between;
			align-items: center;
		}

		.wk-meter {
			width: auto;
			flex-direction: row;
			align-items: flex-end;
			height: 22px;
		}

		.wk-meter i {
			width: 5px !important;
			align-self: stretch;
		}

		.wk-vol {
			flex: 1;
			max-width: 160px;
		}

		.wk-reel {
			width: 40px;
			height: 40px;
		}

		.wk-reel::after {
			inset: 15px;
		}

		.wk-title {
			font-size: 0.9rem;
		}
	}
</style>
