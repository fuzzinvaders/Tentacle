<script lang="ts">
	import PixelPanel from '$lib/components/shared/PixelPanel.svelte';
	import CollapsibleSection from '$lib/components/shared/CollapsibleSection.svelte';
	import PodcastConnectForm from '$lib/components/podcasts/PodcastConnectForm.svelte';
	import JellyfinConnectForm from '$lib/components/config/JellyfinConnectForm.svelte';
	import LocalFilesConnect from '$lib/components/config/LocalFilesConnect.svelte';
	import ListenBrainzConnectForm from '$lib/components/config/ListenBrainzConnectForm.svelte';
	import LastfmConnectForm from '$lib/components/config/LastfmConnectForm.svelte';
	import LidarrConnectForm from '$lib/components/config/LidarrConnectForm.svelte';
	import UserManagement from '$lib/components/config/UserManagement.svelte';
	import OpmlManager from '$lib/components/podcasts/OpmlManager.svelte';
	import BackupManager from '$lib/components/config/BackupManager.svelte';
	import DiagnosticsPanel from '$lib/components/config/DiagnosticsPanel.svelte';
	import DemoModeToggle from '$lib/components/config/DemoModeToggle.svelte';
	import AlarmConfig from '$lib/components/config/AlarmConfig.svelte';
	import EqualizerPanel from '$lib/components/config/EqualizerPanel.svelte';
	import AccountSettings from '$lib/components/config/AccountSettings.svelte';
	import { localFiles } from '$lib/stores/localFiles.svelte';
	import { page } from '$app/state';
	import { pinepods } from '$lib/stores/pinepods.svelte';
	import { jellyfin } from '$lib/stores/jellyfin.svelte';
	import { listenbrainz } from '$lib/stores/listenbrainz.svelte';
	import { lastfm } from '$lib/stores/lastfm.svelte';
	import { lidarr } from '$lib/stores/lidarr.svelte';
	import { settings } from '$lib/stores/settings.svelte';
	import type {
		PodcastsSubTab,
		EpisodeSortOrder,
		ThemeId,
		StreamQuality,
		PodcastSource
	} from '$lib/stores/settings.svelte';
	import type { SpaceId } from '$lib/stores/ui.svelte';

	const streamQualityOptions: { value: StreamQuality; label: string }[] = [
		{ value: 'max', label: 'Maximale (direct, jusqu’à 320 kbps)' },
		{ value: 'high', label: 'Élevée (256 kbps)' },
		{ value: 'medium', label: 'Moyenne (192 kbps)' },
		{ value: 'low', label: 'Économique (128 kbps)' }
	];

	// La Configuration est volontairement absente : elle s'ouvre à la demande (roue crantée).
	const startupSpaceOptions: { value: SpaceId; label: string }[] = [
		{ value: 'home', label: 'Accueil' },
		{ value: 'library', label: 'Bibliothèque' },
		{ value: 'radios', label: 'Radios' },
		{ value: 'podcasts', label: 'Podcasts' }
	];

	const podcastsSubTabOptions: { value: PodcastsSubTab; label: string }[] = [
		{ value: 'encours', label: 'En cours' },
		{ value: 'abonnements', label: 'Abonnements' },
		{ value: 'recents', label: 'Récents' },
		{ value: 'suivre', label: 'À suivre' },
		{ value: 'recherche', label: 'Ajouter' }
	];

	const themeOptions: { value: ThemeId; label: string; description: string; swatches: string[] }[] = [
		{
			value: 'terminus',
			label: 'Terminus',
			description: "Le thème par défaut, inspiré d'Eastward : nuit teal, lanternes ambrées, métal patiné.",
			swatches: ['#0d1b1e', '#223a3c', '#e09a3e', '#ffbe5c', '#e8d9b5']
		},
		{
			value: 'tentacle',
			label: 'Tentacle',
			description: "Palette d'origine du site : pixel-art violet et or.",
			swatches: ['#17121d', '#2b2332', '#dfa252', '#f4c06a', '#d8cfb8']
		},
		{
			value: 'nocturne',
			label: 'Nocturne',
			description: 'Refonte maison : nuit Dracula façon Eastward hi-res — néons violet, rose et cyan, panneaux adoucis.',
			swatches: ['#191a21', '#282a36', '#bd93f9', '#ff79c6', '#8be9fd']
		}
	];
</script>

{#if page.data.user}
	<AccountSettings />
{/if}

{#if page.data.user?.isAdmin}
	<UserManagement />
{/if}

<PixelPanel>
	<h3>Thème</h3>
	<div class="theme-grid">
		{#each themeOptions as opt (opt.value)}
			<button
				type="button"
				class="theme-card"
				class:is-active={settings.values.theme === opt.value}
				onclick={() => settings.set('theme', opt.value)}
			>
				<div class="theme-card__swatches">
					{#each opt.swatches as color (color)}
						<span style:background={color}></span>
					{/each}
				</div>
				<strong>{opt.label}</strong>
				<p>{opt.description}</p>
			</button>
		{/each}
	</div>
</PixelPanel>

<PixelPanel sunken>
	<h3>Général</h3>

	<div class="pref-row">
		<span>Espace ouvert au lancement</span>
		<select
			class="pixel-input"
			value={settings.values.startupSpace}
			onchange={(e) => settings.set('startupSpace', e.currentTarget.value as SpaceId)}
		>
			{#each startupSpaceOptions as opt (opt.value)}
				<option value={opt.value}>{opt.label}</option>
			{/each}
		</select>
	</div>
	<p class="pref-hint">
		Évite un clic à chaque ouverture si tu vas toujours au même endroit. Prend effet au
		prochain lancement de l'application.
	</p>
</PixelPanel>

<PixelPanel>
	<h3>Sources</h3>
	<p class="sources-hint">
		Relie tes sources audio. Chaque section se déplie pour la configurer — clique pour ouvrir.
	</p>

	<div class="sources">
		<!-- ── Bibliothèque musicale ── -->
		<CollapsibleSection
			title="Jellyfin"
			subtitle={jellyfin.connected
				? jellyfin.connection?.serverName || jellyfin.connection?.baseUrl
				: 'Bibliothèque musicale (serveur)'}
			accent="var(--gold-bright)"
			badge={jellyfin.connected ? 'Connecté' : ''}
			open={!jellyfin.connected}
		>
			{#if jellyfin.connected}
				<div class="status-row">
					<p>
						Connecté à
						<strong>{jellyfin.connection?.serverName || jellyfin.connection?.baseUrl}</strong>
					</p>
					<button type="button" class="pixel-btn pixel-btn--ghost" onclick={() => jellyfin.disconnect()}>
						Déconnecter
					</button>
				</div>
			{:else}
				<JellyfinConnectForm embedded />
			{/if}
		</CollapsibleSection>

		<CollapsibleSection
			title="Fichiers locaux"
			subtitle={localFiles.tracks.length > 0
				? `${localFiles.tracks.length} fichier(s) chargé(s)`
				: 'Depuis cet appareil ou un NAS monté'}
			accent="var(--teal)"
			badge={localFiles.tracks.length > 0 ? 'Actif' : ''}
		>
			<LocalFilesConnect />
		</CollapsibleSection>

		<!-- ── Podcasts ── -->
		<CollapsibleSection
			title="PinePods"
			subtitle={pinepods.connected
				? `${pinepods.connection?.baseUrl} (utilisateur #${pinepods.connection?.userId})`
				: 'Podcasts'}
			accent="var(--teal)"
			badge={pinepods.connected ? 'Connecté' : ''}
			open={!pinepods.connected}
		>
			{#if pinepods.connected}
				<div class="status-row">
					<p>
						Connecté à <strong>{pinepods.connection?.baseUrl}</strong> (utilisateur #{pinepods
							.connection?.userId})
					</p>
					<button type="button" class="pixel-btn pixel-btn--ghost" onclick={() => pinepods.disconnect()}>
						Déconnecter
					</button>
				</div>
			{:else}
				<PodcastConnectForm embedded />
			{/if}
		</CollapsibleSection>

		<!-- ── Extras ── -->
		<CollapsibleSection
			title="ListenBrainz"
			subtitle={listenbrainz.connected
				? listenbrainz.connection?.userName
				: 'Playlists intelligentes'}
			accent="var(--teal)"
			badge={listenbrainz.connected ? 'Connecté' : ''}
		>
			{#if listenbrainz.connected}
				<div class="status-row">
					<p>Connecté en tant que <strong>{listenbrainz.connection?.userName}</strong></p>
					<button type="button" class="pixel-btn pixel-btn--ghost" onclick={() => listenbrainz.disconnect()}>
						Déconnecter
					</button>
				</div>
			{:else}
				<ListenBrainzConnectForm embedded />
			{/if}
		</CollapsibleSection>

		<CollapsibleSection
			title="Last.fm"
			subtitle={lastfm.connected ? lastfm.connection?.username : 'Scrobbling (en plus de ListenBrainz)'}
			accent="var(--coral)"
			badge={lastfm.connected ? 'Connecté' : ''}
		>
			{#if lastfm.connected}
				<div class="status-row">
					<p>Connecté en tant que <strong>{lastfm.connection?.username}</strong></p>
					<button type="button" class="pixel-btn pixel-btn--ghost" onclick={() => lastfm.disconnect()}>
						Déconnecter
					</button>
				</div>
			{:else}
				<LastfmConnectForm embedded />
			{/if}
		</CollapsibleSection>

		<CollapsibleSection
			title="Lidarr"
			subtitle={lidarr.connected ? lidarr.connection?.baseUrl : 'Recherche d’albums manquants'}
			accent="var(--gold)"
			badge={lidarr.connected ? 'Connecté' : ''}
		>
			{#if lidarr.connected}
				<div class="status-row">
					<p>Connecté à <strong>{lidarr.connection?.baseUrl}</strong></p>
					<button type="button" class="pixel-btn pixel-btn--ghost" onclick={() => lidarr.disconnect()}>
						Déconnecter
					</button>
				</div>
			{:else}
				<LidarrConnectForm embedded />
			{/if}
		</CollapsibleSection>
	</div>
</PixelPanel>

<PixelPanel sunken>
	<h3>Préférences Lecture</h3>

	<div class="pref-row">
		<span>Qualité de streaming (Jellyfin)</span>
		<select
			class="pixel-input"
			value={settings.values.streamQuality}
			onchange={(e) => settings.set('streamQuality', e.currentTarget.value as StreamQuality)}
		>
			{#each streamQualityOptions as opt (opt.value)}
				<option value={opt.value}>{opt.label}</option>
			{/each}
		</select>
	</div>
	<p class="pref-hint">
		Un débit plus bas économise les données mobiles (transcodage côté serveur). S’applique aux
		prochains titres lancés.
	</p>

	<label class="pref-row">
		<input
			type="checkbox"
			checked={settings.values.audioFade}
			onchange={(e) => settings.set('audioFade', e.currentTarget.checked)}
		/>
		Fondu du son à la lecture et à la pause
	</label>

	<label class="pref-row">
		<input
			type="checkbox"
			checked={settings.values.endlessPlayback}
			onchange={(e) => settings.set('endlessPlayback', e.currentTarget.checked)}
		/>
		Lecture sans fin (enchaîner un mix quand la file Jellyfin est épuisée)
	</label>

	<label class="pref-row">
		<input
			type="checkbox"
			checked={settings.values.volumeNormalization}
			onchange={(e) => settings.set('volumeNormalization', e.currentTarget.checked)}
		/>
		Normalisation du volume (Jellyfin/local, selon les données du serveur)
	</label>

	<div class="pref-row">
		<span>Fondu enchaîné entre titres</span>
		<select
			class="pixel-input"
			value={String(settings.values.crossfadeSec)}
			onchange={(e) => settings.set('crossfadeSec', Number(e.currentTarget.value))}
		>
			<option value="0">Désactivé</option>
			<option value="2">2 s</option>
			<option value="4">4 s</option>
			<option value="6">6 s</option>
			<option value="8">8 s</option>
			<option value="10">10 s</option>
		</select>
	</div>
	<p class="pref-hint">
		Expérimental — musique Jellyfin/local uniquement, désactivé si l'égaliseur ou la
		normalisation est actif.
	</p>

	<div class="eq-section">
		<span class="label-tag">Égaliseur</span>
		<EqualizerPanel />
	</div>
</PixelPanel>

<PixelPanel sunken>
	<h3>Préférences Podcasts</h3>

	<div class="pref-row">
		<span>Source des podcasts</span>
		<select
			class="pixel-input"
			value={settings.values.podcastSource}
			onchange={(e) => settings.set('podcastSource', e.currentTarget.value as PodcastSource)}
		>
			<option value="pinepods">PinePods (serveur)</option>
			<option value="local">Intégrés (flux RSS, sans serveur)</option>
		</select>
	</div>
	<p class="pref-hint">
		« Intégrés » gère tes abonnements directement dans l'app (aucun serveur requis) — pratique
		si tu n'utilises pas PinePods. Les deux sources coexistent : bascule à tout moment sans
		perdre les abonnements de l'autre.
	</p>

	<label class="pref-row">
		<input
			type="checkbox"
			checked={settings.values.hideCompletedEpisodes}
			onchange={(e) => settings.set('hideCompletedEpisodes', e.currentTarget.checked)}
		/>
		Masquer les épisodes déjà lus
	</label>

	<div class="pref-row">
		<span>Trier les épisodes par date</span>
		<select
			class="pixel-input"
			value={settings.values.episodeSortOrder}
			onchange={(e) => settings.set('episodeSortOrder', e.currentTarget.value as EpisodeSortOrder)}
		>
			<option value="desc">Plus récents d'abord</option>
			<option value="asc">Plus anciens d'abord</option>
		</select>
	</div>

	<div class="pref-row">
		<span>Onglet Podcasts ouvert par défaut</span>
		<select
			class="pixel-input"
			value={settings.values.defaultPodcastsTab}
			onchange={(e) => settings.set('defaultPodcastsTab', e.currentTarget.value as PodcastsSubTab)}
		>
			{#each podcastsSubTabOptions as opt (opt.value)}
				<option value={opt.value}>{opt.label}</option>
			{/each}
		</select>
	</div>

	<label class="pref-row">
		<input
			type="checkbox"
			checked={settings.values.autoplayQueue}
			onchange={(e) => settings.set('autoplayQueue', e.currentTarget.checked)}
		/>
		Enchaîner automatiquement la lecture avec la file « À suivre »
	</label>

	{#if settings.values.podcastSource === 'pinepods' && pinepods.connected}
		<div class="opml-section">
			<span class="label-tag">Abonnements (OPML)</span>
			<OpmlManager />
		</div>
	{/if}
</PixelPanel>

<PixelPanel sunken>
	<h3>Réveil</h3>
	<AlarmConfig />
</PixelPanel>

<PixelPanel sunken>
	<h3>Sauvegarde des réglages</h3>
	<BackupManager />
</PixelPanel>

<PixelPanel sunken>
	<h3>Journal de lecture</h3>
	<DiagnosticsPanel />
</PixelPanel>

<PixelPanel sunken>
	<h3>Mode démonstration</h3>
	<DemoModeToggle />
</PixelPanel>

<style>
	h3 {
		margin-bottom: 0.75rem;
	}

	.sources-hint {
		margin: 0 0 1rem;
		color: var(--muted);
		font-size: 0.82rem;
	}

	.sources {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.theme-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
		gap: 0.75rem;
	}

	.theme-card {
		font-family: var(--font-pixel);
		background: var(--plum-deep);
		border: var(--border-w, 3px) solid var(--bezel);
		border-radius: var(--radius-control, 0);
		color: var(--cream);
		padding: 0.75rem;
		text-align: left;
		cursor: pointer;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.theme-card.is-active {
		outline: 2px solid var(--gold-bright);
		outline-offset: -2px;
	}

	.theme-card__swatches {
		display: flex;
		height: 1.5rem;
	}

	.theme-card__swatches span {
		flex: 1;
		border: 2px solid var(--bezel);
	}

	.theme-card strong {
		color: var(--cream-bright);
		text-transform: uppercase;
		font-size: 0.85rem;
		letter-spacing: 0.04em;
	}

	.theme-card p {
		margin: 0;
		font-size: 0.75rem;
		color: var(--muted);
	}

	.status-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin-top: 0.75rem;
	}

	.status-row p {
		margin: 0;
		color: var(--muted);
	}

	.status-row strong {
		color: var(--cream-bright);
	}

	.pref-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.6rem 0;
		border-bottom: 2px solid var(--bezel);
		font-size: 0.85rem;
	}

	.pref-row:last-child {
		border-bottom: none;
	}

	.pref-hint {
		margin: 0.4rem 0 0.6rem;
		color: var(--muted);
		font-size: 0.78rem;
	}

	.opml-section,
	.eq-section {
		margin-top: 0.9rem;
		padding-top: 0.9rem;
		border-top: 2px solid var(--bezel);
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.pref-row select {
		width: auto;
		min-width: 12rem;
	}

	label.pref-row {
		cursor: pointer;
	}

	input[type='checkbox'] {
		width: 1.1rem;
		height: 1.1rem;
		accent-color: var(--gold-bright);
	}
</style>
