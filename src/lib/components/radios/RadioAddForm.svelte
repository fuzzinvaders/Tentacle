<script lang="ts">
	import type { RadioStation } from '$lib/types';

	let { onAdd }: { onAdd: (station: RadioStation) => void } = $props();

	let name = $state('');
	let streamUrl = $state('');
	let faviconUrl = $state('');
	let errorMessage = $state('');
	let addedMessage = $state('');

	function submit(e: SubmitEvent) {
		e.preventDefault();
		errorMessage = '';
		addedMessage = '';
		const trimmedName = name.trim();
		const trimmedUrl = streamUrl.trim();
		if (!trimmedName || !trimmedUrl) {
			errorMessage = 'Le nom et l’URL du flux sont obligatoires.';
			return;
		}
		try {
			const parsed = new URL(trimmedUrl);
			if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
				errorMessage = 'L’URL du flux doit commencer par http:// ou https://.';
				return;
			}
		} catch {
			errorMessage = 'URL de flux invalide.';
			return;
		}
		onAdd({
			id: crypto.randomUUID(),
			name: trimmedName,
			streamUrl: trimmedUrl,
			faviconUrl: faviconUrl.trim() || undefined
		});
		addedMessage = `« ${trimmedName} » ajoutée à Mes radios.`;
		name = '';
		streamUrl = '';
		faviconUrl = '';
	}
</script>

<form onsubmit={submit} class="add-form">
	<p class="hint">
		Colle l'URL directe d'un flux (MP3, AAC, Ogg… — par exemple une URL Icecast/Shoutcast). Les
		pages web de radios ne sont pas des flux.
	</p>
	<label>
		Nom de la station
		<input class="pixel-input" type="text" placeholder="Ex. FIP" bind:value={name} />
	</label>
	<label>
		URL du flux
		<input
			class="pixel-input"
			type="url"
			placeholder="https://icecast.radiofrance.fr/fip-midfi.mp3"
			bind:value={streamUrl}
		/>
	</label>
	<label>
		Logo (URL, optionnel)
		<input class="pixel-input" type="url" placeholder="https://…/logo.png" bind:value={faviconUrl} />
	</label>
	{#if errorMessage}
		<p class="error">{errorMessage}</p>
	{/if}
	{#if addedMessage}
		<p class="success">{addedMessage}</p>
	{/if}
	<button type="submit" class="pixel-btn">Ajouter la radio</button>
</form>

<style>
	.add-form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		max-width: 34rem;
	}

	.hint {
		color: var(--muted);
		margin: 0;
		font-size: 0.85rem;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--muted);
	}

	.error {
		color: var(--coral);
		margin: 0;
		font-size: 0.85rem;
	}

	.success {
		color: var(--teal);
		margin: 0;
		font-size: 0.85rem;
	}

	button {
		align-self: flex-start;
	}
</style>
