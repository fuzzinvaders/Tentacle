export type SourceKind = 'jellyfin' | 'radio' | 'podcast' | 'playlist' | 'local';

/** A single playable item pushed onto the shared audio bus, regardless of source. */
export type Track = {
	id: string;
	source: SourceKind;
	title: string;
	subtitle: string;
	/** Artiste et album « propres » (séparés du sous-titre d'affichage) — pour le scrobbling. */
	artist?: string;
	album?: string;
	artworkUrl?: string;
	streamUrl: string;
	durationSec?: number;
	resumeSec?: number;
	/** Gain de normalisation (dB, ReplayGain) à appliquer si la normalisation est activée. */
	gainDb?: number;
	podcastMeta?: {
		podcastId: number;
		episodeId: number;
		/** Abonnement « local » (flux RSS géré dans l'app, sans PinePods) : la synchro de
		 * progression/complétion/file passe alors par le store local plutôt que l'API PinePods. */
		local?: boolean;
	};
	/** URL du document JSON de chapitres (Podcasting 2.0) du titre courant, si disponible. */
	chaptersUrl?: string;
};

/** A radio station saved by the user (manually or from a Radio Browser search). */
export type RadioStation = {
	id: string;
	name: string;
	streamUrl: string;
	faviconUrl?: string;
	homepage?: string;
	country?: string;
	tags?: string;
	/** Set when the station comes from Radio Browser (used for the play-click counter). */
	stationUuid?: string;
};

export type RadioBrowserStation = {
	stationuuid: string;
	name: string;
	url: string;
	url_resolved: string;
	homepage: string;
	favicon: string;
	tags: string;
	country: string;
	countrycode: string;
	codec: string;
	bitrate: number;
	votes: number;
};

/** Summary of a ListenBrainz playlist (metadata only — tracks fetched on demand). */
export type LBPlaylist = {
	mbid: string;
	title: string;
	description?: string;
	trackCount?: number;
};

/** A track entry inside a ListenBrainz playlist (JSPF), before Jellyfin matching. */
export type LBTrack = {
	title: string;
	artist: string;
	album?: string;
	recordingMbid?: string;
};

/** A Jellyfin item (album, artist or audio track) — only the fields Tentacle reads. */
export type JellyfinItem = {
	Id: string;
	Name: string;
	Type?: string;
	Album?: string;
	AlbumId?: string;
	AlbumArtist?: string;
	Artists?: string[];
	AlbumPrimaryImageTag?: string;
	ImageTags?: Record<string, string>;
	RunTimeTicks?: number;
	/** Gain de normalisation audio (dB) calculé par Jellyfin (10.9+), si disponible. */
	NormalizationGain?: number;
	IndexNumber?: number;
	ParentIndexNumber?: number;
	ProductionYear?: number;
	ChildCount?: number;
	UserData?: { IsFavorite?: boolean; PlaybackPositionTicks?: number };
	/** Identifiants externes (rempli si la bibliothèque est taguée) — ex. MusicBrainzArtist. */
	ProviderIds?: Record<string, string>;
};

export type PinePodsConnection = {
	baseUrl: string;
	apiKey: string;
	userId: number;
};

export type PinePodsPodcast = {
	podcastid: number;
	podcastname: string;
	artworkurl: string;
	description: string;
	episodecount: number;
	websiteurl: string;
	feedurl: string;
	author: string;
	categories: string;
	explicit: boolean;
	podcastindexid: number | null;
	is_favorite?: boolean;
};

export type PinePodsEpisode = {
	episodeid: number;
	episodetitle: string;
	podcastname: string;
	podcastid: number;
	episodepubdate: string;
	episodedescription: string;
	episodeartwork: string;
	episodeurl: string;
	episodeduration: number;
	listenduration: number;
	websiteurl: string;
	/** URL du document JSON de chapitres (Podcasting 2.0), si le flux en fournit — podcasts
	 * locaux uniquement (PinePods n'expose pas cette information). */
	chaptersUrl?: string;
	completed: boolean;
	saved: boolean;
	queued: boolean;
	downloaded: boolean;
	is_youtube: boolean;
};

export type PinePodsSearchResult = {
	podcastname: string;
	feedurl: string;
	artworkurl: string;
	description: string;
	author: string;
	episodecount: number;
	podcastindexid: number;
	websiteurl: string;
	explicit: boolean;
	categories: Record<string, string>;
};
