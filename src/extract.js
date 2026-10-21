const ATTR = /<(a|img|link|script|source|iframe)\b[^>]*?\s(href|src|srcset)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi;
const SKIP = /^(mailto:|tel:|javascript:|data:|#)/i;

/**
 * Pulls every link-like URL out of an HTML page and resolves it against the page URL.
 * Returns unique absolute URLs (without #fragments) with the tag they came from.
 */
export function extractLinks(html, pageUrl) {
  const seen = new Map();
  for (const m of html.matchAll(ATTR)) {
    const tag = m[1].toLowerCase();
    const attr = m[2].toLowerCase();
    let raw = (m[4] ?? m[5] ?? m[6] ?? '').trim();
    if (attr === 'srcset') raw = raw.split(',')[0].trim().split(/\s+/)[0];
    if (!raw || SKIP.test(raw)) continue;
    let url;
    try {
      url = new URL(raw.replace(/&amp;/g, '&'), pageUrl);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(url.protocol)) continue;
    url.hash = '';
    const key = url.href;
    if (!seen.has(key)) seen.set(key, { url: key, tag });
  }
  return [...seen.values()];
}

export const isSameSite = (a, b) => new URL(a).host === new URL(b).host;
