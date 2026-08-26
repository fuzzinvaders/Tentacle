/**
 * Analyse de flux RSS/Atom de podcasts (podcasts « locaux », sans PinePods). Fonction pure,
 * testable sans DOM : comme `opml.ts`, on extrait par expressions régulières plutôt que par
 * DOMParser (indisponible côté serveur/tests, et un flux RSS bien formé s'y prête très bien —
 * les <item> ne sont jamais imbriqués les uns dans les autres).
 */

export type ParsedPodcastMeta = {
	title: string;
	description: string;
	author: string;
	artworkUrl: string;
};

export type ParsedEpisode = {
	/** Identifiant stable (hash du guid/URL d'enclosure, préfixé par le flux). */
	id: number;
	title: string;
	description: string;
	pubDate: string;
	durationSec: number;
	enclosureUrl: string;
	artworkUrl: string;
	/** URL du document JSON de chapitres (Podcasting 2.0 `<podcast:chapters url="…">`), si fourni. */
	chaptersUrl?: string;
};

export type ParsedFeed = {
	/** Identifiant stable (hash de l'URL du flux). */
	id: number;
	meta: ParsedPodcastMeta;
	episodes: ParsedEpisode[];
};

/** Hash FNV-1a 32 bits : rapide, déterministe, sans dépendance — suffisant pour dériver un
 * identifiant numérique stable à partir d'une chaîne (URL de flux, guid d'épisode), ce qui
 * permet de réutiliser tous les composants/stores déjà conçus pour des ids numériques PinePods. */
export function hashId(s: string): number {
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return h >>> 0;
}

function decodeXmlEntities(s: string): string {
	return s
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
		.replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
		.replace(/&amp;/g, '&');
}

function unwrapCdata(s: string): string {
	const m = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(s);
	return (m ? m[1] : s).trim();
}

/** Contenu texte de la PREMIÈRE occurrence de `<tag>…</tag>` dans `xml` (CDATA dépaqueté,
 * entités décodées). Non-imbriqué : suffisant car on scope toujours l'appel au bon niveau
 * (document tronqué au canal, ou XML d'un item précis). */
function tagContent(xml: string, tag: string): string | undefined {
	const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i');
	const m = re.exec(xml);
	return m ? decodeXmlEntities(unwrapCdata(m[1])) : undefined;
}

/** Valeur d'un attribut de la première balise `<tag …/>` (auto-fermante ou non). */
function attrOf(xml: string, tag: string, attr: string): string | undefined {
	const re = new RegExp(`<${tag}\\b([^>]*)/?>`, 'i');
	const m = re.exec(xml);
	if (!m) return undefined;
	const attrRe = new RegExp(`\\b${attr}\\s*=\\s*"([^"]*)"`, 'i');
	const am = attrRe.exec(m[1]);
	return am ? decodeXmlEntities(am[1]) : undefined;
}

function extractItems(xml: string): string[] {
	const items: string[] = [];
	const re = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
	let m: RegExpExecArray | null;
	while ((m = re.exec(xml)) !== null) items.push(m[1]);
	return items;
}

/** Tolère les 3 formats courants de `<itunes:duration>` : secondes seules, "MM:SS" ou "HH:MM:SS". */
function parseDuration(raw: string | undefined): number {
	if (!raw) return 0;
	const t = raw.trim();
	if (/^\d+$/.test(t)) return Number(t);
	const parts = t.split(':').map(Number);
	if (parts.length === 0 || parts.some((n) => !Number.isFinite(n))) return 0;
	return parts.reduce((acc, n) => acc * 60 + n, 0);
}

/**
 * Analyse un flux RSS de podcast en métadonnées de podcast + liste d'épisodes.
 * Les épisodes sans URL audio exploitable (pas d'`<enclosure>`) sont ignorés.
 */
export function parsePodcastFeed(xml: string, feedUrl: string): ParsedFeed {
	// Tronque au canal (avant le premier <item>) pour que les tags de même nom à l'intérieur
	// des épisodes (title, description…) ne soient jamais pris pour ceux du podcast.
	const firstItemIdx = xml.search(/<item\b/i);
	const channelXml = firstItemIdx === -1 ? xml : xml.slice(0, firstItemIdx);

	const title = tagContent(channelXml, 'title') || feedUrl;
	const description = tagContent(channelXml, 'description') ?? tagContent(channelXml, 'itunes:summary') ?? '';
	const author = tagContent(channelXml, 'itunes:author') ?? tagContent(channelXml, 'managingEditor') ?? '';
	const artworkUrl =
		attrOf(channelXml, 'itunes:image', 'href') ?? tagContent(channelXml, 'url') ?? '';

	const episodes: ParsedEpisode[] = extractItems(xml)
		.map((itemXml): ParsedEpisode | null => {
			const enclosureUrl = attrOf(itemXml, 'enclosure', 'url') ?? '';
			if (!enclosureUrl) return null; // pas de piste audio exploitable
			const guid = tagContent(itemXml, 'guid') || enclosureUrl;
			return {
				id: hashId(`${feedUrl}#${guid}`),
				title: tagContent(itemXml, 'title') ?? '(sans titre)',
				description: tagContent(itemXml, 'description') ?? tagContent(itemXml, 'itunes:summary') ?? '',
				pubDate: tagContent(itemXml, 'pubDate') ?? '',
				durationSec: parseDuration(tagContent(itemXml, 'itunes:duration')),
				enclosureUrl,
				artworkUrl: attrOf(itemXml, 'itunes:image', 'href') ?? artworkUrl,
				chaptersUrl: attrOf(itemXml, 'podcast:chapters', 'url')
			};
		})
		.filter((e): e is ParsedEpisode => e !== null);

	return {
		id: hashId(feedUrl),
		meta: { title, description, author, artworkUrl },
		episodes
	};
}
