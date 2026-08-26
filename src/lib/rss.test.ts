import { describe, it, expect } from 'vitest';
import { parsePodcastFeed, hashId } from './rss';

const SAMPLE_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>Mon Podcast &amp; Cie</title>
    <description>Une description <b>avec balises</b>.</description>
    <itunes:author>Alice Dupont</itunes:author>
    <itunes:image href="https://ex.com/cover.jpg"/>
    <item>
      <title>Épisode Un</title>
      <guid>ep-1</guid>
      <pubDate>Mon, 01 Jan 2024 10:00:00 GMT</pubDate>
      <description><![CDATA[Description <i>riche</i> de l'épisode.]]></description>
      <itunes:duration>1500</itunes:duration>
      <podcast:chapters url="https://ex.com/ep1-chapters.json" type="application/json+chapters"/>
      <enclosure url="https://ex.com/ep1.mp3" type="audio/mpeg" length="123"/>
    </item>
    <item>
      <title>Épisode Deux</title>
      <guid>ep-2</guid>
      <pubDate>Tue, 02 Jan 2024 10:00:00 GMT</pubDate>
      <description>Sans CDATA</description>
      <itunes:duration>25:30</itunes:duration>
      <itunes:image href="https://ex.com/ep2.jpg"/>
      <enclosure url="https://ex.com/ep2.mp3" type="audio/mpeg" length="456"/>
    </item>
    <item>
      <title>Sans audio (ignoré)</title>
      <guid>ep-3</guid>
    </item>
  </channel>
</rss>`;

describe('parsePodcastFeed', () => {
	it('extrait les métadonnées du podcast (entités décodées, HTML brut conservé)', () => {
		const feed = parsePodcastFeed(SAMPLE_FEED, 'https://ex.com/feed.xml');
		expect(feed.meta.title).toBe('Mon Podcast & Cie');
		expect(feed.meta.author).toBe('Alice Dupont');
		expect(feed.meta.artworkUrl).toBe('https://ex.com/cover.jpg');
		expect(feed.meta.description).toContain('<b>avec balises</b>');
	});

	it("ignore les épisodes sans URL d'enclosure", () => {
		const feed = parsePodcastFeed(SAMPLE_FEED, 'https://ex.com/feed.xml');
		expect(feed.episodes).toHaveLength(2);
		expect(feed.episodes.some((e) => e.title.startsWith('Sans audio'))).toBe(false);
	});

	it('dépaquette le CDATA et décode les entités des titres/descriptions', () => {
		const feed = parsePodcastFeed(SAMPLE_FEED, 'https://ex.com/feed.xml');
		const ep1 = feed.episodes[0];
		expect(ep1.title).toBe('Épisode Un');
		expect(ep1.description).toContain("<i>riche</i> de l'épisode");
	});

	it('convertit la durée itunes (secondes ou MM:SS/HH:MM:SS)', () => {
		const feed = parsePodcastFeed(SAMPLE_FEED, 'https://ex.com/feed.xml');
		expect(feed.episodes[0].durationSec).toBe(1500);
		expect(feed.episodes[1].durationSec).toBe(25 * 60 + 30);
	});

	it("expose l'URL des chapitres Podcasting 2.0 quand présente", () => {
		const feed = parsePodcastFeed(SAMPLE_FEED, 'https://ex.com/feed.xml');
		expect(feed.episodes[0].chaptersUrl).toBe('https://ex.com/ep1-chapters.json');
		expect(feed.episodes[1].chaptersUrl).toBeUndefined();
	});

	it("retombe sur l'image du podcast si l'épisode n'a pas la sienne", () => {
		const feed = parsePodcastFeed(SAMPLE_FEED, 'https://ex.com/feed.xml');
		expect(feed.episodes[0].artworkUrl).toBe('https://ex.com/cover.jpg');
		expect(feed.episodes[1].artworkUrl).toBe('https://ex.com/ep2.jpg');
	});

	it('produit des identifiants stables et distincts par flux/épisode', () => {
		const a = parsePodcastFeed(SAMPLE_FEED, 'https://ex.com/feed.xml');
		const b = parsePodcastFeed(SAMPLE_FEED, 'https://ex.com/feed.xml');
		expect(a.id).toBe(b.id);
		expect(a.episodes[0].id).toBe(b.episodes[0].id);
		expect(a.episodes[0].id).not.toBe(a.episodes[1].id);
		// Même guid mais flux différent → id différent (namespacé par l'URL du flux).
		const c = parsePodcastFeed(SAMPLE_FEED, 'https://autre.com/feed.xml');
		expect(c.episodes[0].id).not.toBe(a.episodes[0].id);
	});
});

describe('hashId', () => {
	it('est déterministe', () => {
		expect(hashId('abc')).toBe(hashId('abc'));
	});
	it('distingue des chaînes différentes', () => {
		expect(hashId('abc')).not.toBe(hashId('abd'));
	});
});
