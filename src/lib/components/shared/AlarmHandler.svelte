<script lang="ts">
	import { LocalNotifications } from '@capacitor/local-notifications';
	import { alarmSupported, scheduleAlarm } from '$lib/alarm';
	import { alarm } from '$lib/stores/alarm.svelte';
	import { player } from '$lib/stores/player.svelte';
	import { radios } from '$lib/stores/radios.svelte';
	import { stationToTrack } from '$lib/radioTrack';
	import { toasts } from '$lib/stores/toasts.svelte';

	// Headless : gère le tap sur la notification de réveil (démarre la lecture) et rafraîchit
	// la fenêtre glissante de notifications à chaque lancement de l'app (voir alarm.ts).
	$effect(() => {
		if (!alarmSupported()) return;

		// Relance de l'app (peu importe la raison) → l'occasion de reprogrammer la semaine
		// à venir, sans quoi le réveil s'arrêterait de sonner après ~8 jours sans ouverture.
		if (alarm.values.enabled) {
			scheduleAlarm(alarm.values).catch(() => {
				/* échec silencieux ici : l'utilisateur sera informé s'il modifie le réglage */
			});
		}

		let handle: { remove: () => void } | undefined;
		LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
			if (!action.notification.extra?.tentacleAlarm) return;
			const stationId = action.notification.extra.radioStationId as string | undefined;
			const station = stationId ? radios.stations.find((s) => s.id === stationId) : undefined;
			if (station) {
				player.playNow(stationToTrack(station));
			} else if (player.current) {
				player.playing = true;
			} else {
				toasts.info('Réveil : aucune source à lire.');
			}
		}).then((h) => (handle = h));

		return () => {
			handle?.remove();
		};
	});
</script>
