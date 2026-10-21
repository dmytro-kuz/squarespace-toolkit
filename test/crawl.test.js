import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { crawl, toMarkdown } from '../src/linkcheck.js';

const PAGES = {
  '/': '<a href="/about">About</a><a href="/old-page">Old</a><img src="/logo.png"><a href="/missing">Missing</a>',
  '/about': '<a href="/">Home</a><img src="/broken.jpg">',
};

let server, base;
before(async () => {
  server = http.createServer((req, res) => {
    if (req.url === '/old-page') return res.writeHead(301, { location: '/about' }).end();
    if (req.url === '/logo.png') return res.writeHead(200, { 'content-type': 'image/png' }).end();
    if (req.method === 'HEAD' && req.url === '/about') return res.writeHead(405).end();
    const body = PAGES[req.url];
    if (!body) return res.writeHead(404).end();
    res.writeHead(200, { 'content-type': 'text/html' }).end(body);
  });
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
});
after(() => server.close());

test('crawls same-site pages and finds broken links and redirects', async () => {
  const report = await crawl(base + '/', { concurrency: 2 });
  assert.ok(report.pages.includes(base + '/'));
  assert.ok(report.pages.includes(base + '/about'));

  const byPath = Object.fromEntries(report.results.map((r) => [new URL(r.url).pathname, r]));
  assert.equal(byPath['/missing'].status, 404);
  assert.equal(byPath['/missing'].ok, false);
  assert.equal(byPath['/broken.jpg'].ok, false);
  assert.deepEqual(byPath['/broken.jpg'].foundOn, [base + '/about']);
  assert.deepEqual(byPath['/old-page'].redirects, [301]);
  assert.equal(byPath['/old-page'].finalUrl, base + '/about');
  assert.equal(byPath['/about'].status, 200, 'falls back to GET when HEAD is not allowed');
  assert.equal(byPath['/logo.png'].ok, true);
});

test('markdown report lists broken links and redirects', async () => {
  const md = toMarkdown(await crawl(base + '/'));
  assert.match(md, /Broken: \*\*2\*\*/);
  assert.match(md, /\| 404 \| .*\/missing/);
  assert.match(md, /## Redirects/);
});
