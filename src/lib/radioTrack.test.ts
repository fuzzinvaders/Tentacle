import { describe, it, expect } from 'vitest';
import { stationToTrack } from './radioTrack';
import type { RadioStation } from './types';

const base: RadioStation = {
	id: 'st1',
	name: 'FIP',
	streamUrl: 'https://stream.example/fip'
};

describe('stationToTrack', () => {
	it('mappe une station en piste radio', () => {
		const t = stationToTrack({ ...base, faviconUrl: 'https://ex/fav.png', country: 'France' });
		expect(t).toMatchObject({
			id: 'radio-st1',
			source: 'radio',
			title: 'FIP',
			subtitle: 'Radio en direct · France',
			artworkUrl: 'https://ex/fav.png',
			streamUrl: 'https://stream.example/fip'
		});
	});

	it('sous-titre générique sans pays', () => {
		expect(stationToTrack(base).subtitle).toBe('Radio en direct');
	});
});
