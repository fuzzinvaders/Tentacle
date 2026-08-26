import { describe, it, expect } from 'vitest';
import { episodeToTrack } from './podcastTrack';
import type { PinePodsEpisode } from './types';

function makeEpisode(overrides: Partial<PinePodsEpisode> = {}): PinePodsEpisode {
	return {
		episodeid: 7,
		episodetitle: 'Épisode 7',
		podcastname: 'Mon Podcast',
		podcastid: 3,
		episodepubdate: '2026-07-20',
		episodedescription: 'desc',
		episodeartwork: 'https://ex/art.png',
		episodeurl: 'https://ex/ep7.mp3',
		episodeduration: 1800,
		listenduration: 0,
		websiteurl: '',
		completed: false,
		saved: false,
		queued: false,
		downloaded: false,
		is_youtube: false,
		...overrides
	};
}

describe('episodeToTrack', () => {
	it('mappe un épisode en piste', () => {
		const t = episodeToTrack(makeEpisode());
		expect(t).toMatchObject({
			id: 'podcast-7',
			source: 'podcast',
			title: 'Épisode 7',
			subtitle: 'Mon Podcast',
			artworkUrl: 'https://ex/art.png',
			streamUrl: 'https://ex/ep7.mp3',
			durationSec: 1800,
			resumeSec: 0,
			podcastMeta: { podcastId: 3, episodeId: 7 }
		});
	});

	it('reprend à la position écoutée quand > 0', () => {
		expect(episodeToTrack(makeEpisode({ listenduration: 420 })).resumeSec).toBe(420);
	});

	it('transmet chaptersUrl quand présent', () => {
		const t = episodeToTrack(makeEpisode({ chaptersUrl: 'https://ex/chapters.json' }));
		expect(t.chaptersUrl).toBe('https://ex/chapters.json');
	});

	it('marque podcastMeta.local selon le paramètre isLocal', () => {
		expect(episodeToTrack(makeEpisode()).podcastMeta?.local).toBe(false);
		expect(episodeToTrack(makeEpisode(), true).podcastMeta?.local).toBe(true);
	});
});
