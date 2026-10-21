import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractLinks } from '../src/extract.js';

test('resolves relative links and skips mailto, tel, anchors and javascript', () => {
  const html = `
    <a href="/about">About</a>
    <a href='contact#form'>Contact</a>
    <a href="mailto:hi@example.com">Mail</a>
    <a href="tel:+1">Call</a>
    <a href="#top">Top</a>
    <a href="javascript:void(0)">x</a>
    <img src="https://images.example.com/a.jpg?format=1500w&amp;x=1">
    <img srcset="/img/small.jpg 500w, /img/big.jpg 1500w">`;
  const links = extractLinks(html, 'https://site.com/blog/post');
  assert.deepEqual(
    links.map((l) => l.url),
    [
      'https://site.com/about',
      'https://site.com/blog/contact',
      'https://images.example.com/a.jpg?format=1500w&x=1',
      'https://site.com/img/small.jpg',
    ],
  );
  assert.equal(links[2].tag, 'img');
});

test('dedupes the same URL with different fragments', () => {
  const links = extractLinks('<a href="/a#1"></a><a href="/a#2"></a>', 'https://s.com/');
  assert.equal(links.length, 1);
});
