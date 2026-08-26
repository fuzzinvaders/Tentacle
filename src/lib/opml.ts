/**
 * OPML : format d'échange standard des abonnements de podcasts (import/export entre
 * applications). Fonctions pures — testables sans DOM ni réseau.
 */

export type OpmlFeed = { title: string; feedUrl: string };

function escapeXml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

/** Construit un document OPML 2.0 à partir de la liste des abonnements. */
export function buildOpml(feeds: OpmlFeed[], title = 'Abonnements Tentacle'): string {
	const outlines = feeds
		.filter((f) => f.feedUrl)
		.map(
			(f) =>
				`    <outline type="rss" text="${escapeXml(f.title)}" title="${escapeXml(
					f.title
				)}" xmlUrl="${escapeXml(f.feedUrl)}" />`
		)
		.join('\n');
	return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>${escapeXml(title)}</title>
  </head>
  <body>
${outlines}
  </body>
</opml>
`;
}

/**
 * Extrait les flux d'un document OPML. Tolérant : accepte les outlines imbriqués (dossiers),
 * `xmlUrl` ou `xmlurl`, et retombe sur `text`/`title` pour le titre. Sans dépendance DOM :
 * l'analyse se fait par expressions régulières sur les balises `<outline …>`, ce qui suffit
 * pour ce format plat et évite d'exiger un DOMParser (indisponible côté serveur/tests).
 */
export function parseOpml(xml: string): OpmlFeed[] {
	const feeds: OpmlFeed[] = [];
	const seen = new Set<string>();
	// Chaque balise outline (auto-fermante ou non).
	const outlineRe = /<outline\b([^>]*)>/gi;
	let m: RegExpExecArray | null;
	while ((m = outlineRe.exec(xml)) !== null) {
		const attrs = m[1];
		const xmlUrl = attr(attrs, 'xmlUrl') ?? attr(attrs, 'xmlurl');
		if (!xmlUrl) continue; // outline de regroupement (dossier), sans flux
		const url = decodeXml(xmlUrl).trim();
		if (!url || seen.has(url)) continue;
		seen.add(url);
		const title = decodeXml(attr(attrs, 'title') ?? attr(attrs, 'text') ?? '').trim();
		feeds.push({ title: title || url, feedUrl: url });
	}
	return feeds;
}

function attr(attrs: string, name: string): string | undefined {
	const re = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i');
	const m = re.exec(attrs);
	return m ? m[1] : undefined;
}

function decodeXml(s: string): string {
	return s
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&amp;/g, '&');
}
