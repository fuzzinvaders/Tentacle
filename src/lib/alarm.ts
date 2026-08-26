import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { upcomingOccurrences } from '$lib/alarmSchedule';
import type { AlarmSettings } from '$lib/stores/alarm.svelte';

/**
 * Réveil programmé (mobile uniquement) : notification locale planifiée qui, une fois touchée,
 * ramène l'app au premier plan et démarre la lecture (voir AlarmHandler.svelte). Ce n'est PAS
 * une reprise automatique et silencieuse — Android restreint trop l'exécution en arrière-plan
 * pour garantir un démarrage audio fiable sans interaction ; un tap sur la notification est le
 * compromis fiable retenu (voir mémoire deferred-features).
 *
 * Fenêtre glissante : comme Capacitor ne propose pas de « répéter uniquement certains jours »,
 * on pré-programme une notification par occurrence à venir sur les ~8 prochains jours (ids
 * distincts). Il faut donc rouvrir l'app au moins une fois par semaine pour que le réveil se
 * reprogramme au-delà — documenté à l'utilisateur, pas caché.
 */

export function alarmSupported(): boolean {
	return Capacitor.isNativePlatform();
}

const ALARM_ID_BASE = 424200; // + 0..7 selon l'occurrence dans la fenêtre glissante
const ALARM_ID_COUNT = 8;
const ALARM_IDS = Array.from({ length: ALARM_ID_COUNT }, (_, i) => ({ id: ALARM_ID_BASE + i }));

export type ScheduleAlarmResult = 'ok' | 'permission-denied' | 'unsupported';

/** (Re)programme le réveil selon les réglages courants. Annule d'abord toute programmation
 * précédente (idempotent — sûr à rappeler à chaque changement de réglage ou au démarrage). */
export async function scheduleAlarm(settings: AlarmSettings): Promise<ScheduleAlarmResult> {
	if (!alarmSupported()) return 'unsupported';
	await LocalNotifications.cancel({ notifications: ALARM_IDS });
	if (!settings.enabled) return 'ok';

	const perm = await LocalNotifications.requestPermissions();
	if (perm.display !== 'granted') return 'permission-denied';

	const occurrences = upcomingOccurrences(settings.hour, settings.minute, settings.days, new Date()).slice(
		0,
		ALARM_ID_COUNT
	);
	if (occurrences.length === 0) return 'ok';

	await LocalNotifications.schedule({
		notifications: occurrences.map((at, i) => ({
			id: ALARM_ID_BASE + i,
			title: '⏰ Tentacle',
			body: 'Réveil — appuie pour démarrer la lecture.',
			schedule: { at, allowWhileIdle: true },
			extra: { tentacleAlarm: true, radioStationId: settings.radioStationId }
		}))
	});
	return 'ok';
}

export async function cancelAlarm(): Promise<void> {
	if (!alarmSupported()) return;
	await LocalNotifications.cancel({ notifications: ALARM_IDS });
}
