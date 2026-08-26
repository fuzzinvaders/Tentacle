import { describe, it, expect } from 'vitest';
import { buildOpml, parseOpml } from './opml';

describe('buildOpml', () => {
	it('génère un OPML avec un outline par flux et échappe le XML', () => {
		const xml = buildOpml([
			{ title: 'Radio & Co', feedUrl: 'https://ex.com/feed?a=1&b=2' },
			{ title: 'Pod "Two"', feedUrl: 'https://ex.com/two.xml' }
		]);
		expect(xml).toContain('<opml version="2.0">');
		expect(xml).toContain('xmlUrl="https://ex.com/feed?a=1&amp;b=2"');
		expect(xml).toContain('text="Radio &amp; Co"');
		expect(xml).toContain('text="Pod &quot;Two&quot;"');
	});

	it('ignore les flux sans URL', () => {
		const xml = buildOpml([{ title: 'Vide', feedUrl: '' }]);
		expect(xml).not.toContain('outline');
	});
});

describe('parseOpml', () => {
	it('extrait les flux (round-trip avec buildOpml)', () => {
		const feeds = [
			{ title: 'Un', feedUrl: 'https://a.com/1.xml' },
			{ title: 'Deux', feedUrl: 'https://b.com/2.xml' }
		];
		const parsed = parseOpml(buildOpml(feeds));
		expect(parsed).toEqual(feeds);
	});

	it('accepte xmlUrl minuscule, les dossiers imbriqués et déduplique', () => {
		const xml = `<opml><body>
			<outline text="Dossier">
				<outline text="A" xmlurl="https://a.com/a.xml" />
				<outline title="B" xmlUrl="https://b.com/b.xml" />
			</outline>
			<outline text="A dup" xmlUrl="https://a.com/a.xml" />
		</body></opml>`;
		const parsed = parseOpml(xml);
		expect(parsed).toEqual([
			{ title: 'A', feedUrl: 'https://a.com/a.xml' },
			{ title: 'B', feedUrl: 'https://b.com/b.xml' }
		]);
	});

	it('retombe sur l’URL comme titre si texte absent', () => {
		const parsed = parseOpml('<outline xmlUrl="https://c.com/c.xml" />');
		expect(parsed).toEqual([{ title: 'https://c.com/c.xml', feedUrl: 'https://c.com/c.xml' }]);
	});
});
