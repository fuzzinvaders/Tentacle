<script lang="ts">
	import { alarm } from '$lib/stores/alarm.svelte';
	import { radios } from '$lib/stores/radios.svelte';
	import { scheduleAlarm, alarmSupported } from '$lib/alarm';
	import { toasts } from '$lib/stores/toasts.svelte';

	const DAY_LABELS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

	let applying = $state(false);

	function timeString(): string {
		return `${String(alarm.values.hour).padStart(2, '0')}:${String(alarm.values.minute).padStart(2, '0')}`;
	}
	function onTimeChange(e: Event) {
		const [h, m] = (e.currentTarget as HTMLInputElement).value.split(':').map(Number);
		if (Number.isFinite(h) && Number.isFinite(m)) {
			alarm.set('hour', h);
			alarm.set('minute', m);
			apply();
		}
	}

	function toggleDay(day: number) {
		const days = alarm.values.days.includes(day)
			? alarm.values.days.filter((d) => d !== day)
			: [...alarm.values.days, day].sort();
		alarm.set('days', days);
		apply();
	}

	async function toggleEnabled(e: Event) {
		alarm.set('enabled', (e.currentTarget as HTMLInputElement).checked);
		await apply();
	}

	function onStationChange(e: Event) {
		alarm.set('radioStationId', (e.currentTarget as HTMLSelectElement).value);
		apply();
	}

	async function apply() {
		applying = true;
		try {
			const result = await scheduleAlarm(alarm.values);
			if (result === 'permission-denied') {
				toasts.error('Autorisation de notifications refusée : le réveil ne sonnera pas.');
			} else if (result === 'ok' && alarm.values.enabled) {
				toasts.info('Réveil programmé.');
			}
		} finally {
			applying = false;
		}
	}
</script>

{#if !alarmSupported()}
	<p class="hint">Le réveil programmé n'est disponible que dans l'application mobile (Android).</p>
{:else}
	<label class="pref-row">
		<input type="checkbox" checked={alarm.values.enabled} onchange={toggleEnabled} disabled={applying} />
		Activer le réveil
	</label>

	{#if alarm.values.enabled}
		<div class="pref-row">
			<span>Heure</span>
			<input type="time" class="pixel-input" value={timeString()} onchange={onTimeChange} />
		</div>

		<div class="days">
			{#each DAY_LABELS as label, i (i)}
				<button
					type="button"
					class="day-btn"
					class:is-active={alarm.values.days.includes(i)}
					onclick={() => toggleDay(i)}
				>
					{label}
				</button>
			{/each}
		</div>
		<p class="pref-hint">Aucun jour sélectionné = tous les jours.</p>

		<div class="pref-row">
			<span>Source</span>
			<select class="pixel-input" value={alarm.values.radioStationId} onchange={onStationChange}>
				<option value="">Reprendre la dernière lecture</option>
				{#each radios.stations as station (station.id)}
					<option value={station.id}>{station.name}</option>
				{/each}
			</select>
		</div>
		<p class="pref-hint">
			Une notification s'affiche à l'heure prévue — appuie dessus pour démarrer la lecture
			(Android limite trop l'exécution en arrière-plan pour un démarrage automatique et
			silencieux). Rouvre l'app au moins une fois par semaine pour que le réveil continue de
			se reprogrammer.
		</p>
	{/if}
{/if}

<style>
	.hint {
		color: var(--muted);
		font-size: 0.82rem;
		margin: 0;
	}
	.days {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin: 0.5rem 0;
	}
	.day-btn {
		font-family: var(--font-pixel);
		font-size: 0.72rem;
		padding: 0.4rem 0.6rem;
		background: var(--plum-deep);
		border: var(--border-w, 3px) solid var(--bezel);
		border-radius: var(--radius-control, 0);
		color: var(--muted);
		cursor: pointer;
	}
	.day-btn.is-active {
		background: var(--gold-bright);
		color: var(--ink);
	}
</style>
