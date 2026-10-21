import { extractLinks, isSameSite } from './extract.js';

const DEFAULTS = { maxPages: 200, concurrency: 6, timeoutMs: 10000, checkExternal: true };

async function request(url, method, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      redirect: 'manual',
      signal: ctrl.signal,
      headers: { 'user-agent': 'squarespace-toolkit linkcheck' },
    });
    return res;
  } finally {
    clearTimeout(t);
  }
}

/** Checks one URL, following up to 5 redirects. HEAD first, GET when the server rejects HEAD. */
export async function checkUrl(url, timeoutMs = DEFAULTS.timeoutMs) {
  const chain = [];
  let current = url;
  try {
    for (let hop = 0; hop < 6; hop++) {
      let res = await request(current, 'HEAD', timeoutMs);
      if (res.status === 405 || res.status === 501) res = await request(current, 'GET', timeoutMs);
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        chain.push(res.status);
        current = new URL(res.headers.get('location'), current).href;
        continue;
      }
      return { url, status: res.status, finalUrl: current, redirects: chain, ok: res.status < 400 };
    }
    return { url, status: 0, finalUrl: current, redirects: chain, ok: false, error: 'Too many redirects' };
  } catch (err) {
    const error = err.name === 'AbortError' ? 'Timeout' : err.cause?.code ?? err.message;
    return { url, status: 0, finalUrl: current, redirects: chain, ok: false, error };
  }
}

async function pool(items, size, fn) {
  const out = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

/**
 * Crawls every page of a site (same host only), collects all links and checks them.
 * Returns pages crawled and one result per unique URL, with the pages that link to it.
 */
export async function crawl(startUrl, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  const queue = [new URL(startUrl).href];
  const pages = new Set();
  const referrers = new Map();
  const tags = new Map();

  while (queue.length && pages.size < opts.maxPages) {
    const page = queue.shift();
    if (pages.has(page)) continue;
    pages.add(page);
    let html;
    let finalPage = page;
    try {
      const res = await fetch(page, { headers: { 'user-agent': 'squarespace-toolkit linkcheck' } });
      // A redirect to a page we already crawled adds nothing new.
      finalPage = res.url || page;
      if (finalPage !== page) {
        if (pages.has(finalPage)) continue;
        pages.add(finalPage);
      }
      if (!(res.headers.get('content-type') ?? '').includes('text/html')) continue;
      html = await res.text();
    } catch {
      continue;
    }
    for (const { url, tag } of extractLinks(html, finalPage)) {
      if (!referrers.has(url)) referrers.set(url, new Set());
      referrers.get(url).add(finalPage);
      tags.set(url, tag);
      if (tag === 'a' && isSameSite(url, startUrl) && !pages.has(url)) queue.push(url);
    }
  }

  const targets = [...referrers.keys()].filter((u) => opts.checkExternal || isSameSite(u, startUrl));
  const results = await pool(targets, opts.concurrency, (u) => checkUrl(u, opts.timeoutMs));
  return {
    start: startUrl,
    pages: [...pages],
    results: results.map((r) => ({ ...r, tag: tags.get(r.url), foundOn: [...referrers.get(r.url)] })),
  };
}

export function toMarkdown(report) {
  const broken = report.results.filter((r) => !r.ok);
  const redirected = report.results.filter((r) => r.ok && r.redirects.length);
  const lines = [
    `# Link report for ${report.start}`,
    '',
    `Pages crawled: **${report.pages.length}** · Links checked: **${report.results.length}** · Broken: **${broken.length}** · Redirected: **${redirected.length}**`,
    '',
  ];
  if (broken.length) {
    lines.push('## Broken', '', '| Status | URL | Found on |', '| --- | --- | --- |');
    for (const r of broken) lines.push(`| ${r.status || r.error} | ${r.url} | ${r.foundOn.slice(0, 3).join('<br>')} |`);
    lines.push('');
  }
  if (redirected.length) {
    lines.push('## Redirects (worth updating to the final URL)', '', '| Chain | URL | Final URL |', '| --- | --- | --- |');
    for (const r of redirected) lines.push(`| ${r.redirects.join(' → ')} | ${r.url} | ${r.finalUrl} |`);
    lines.push('');
  }
  if (!broken.length && !redirected.length) lines.push('No broken links or redirects found. ✅', '');
  return lines.join('\n');
}
