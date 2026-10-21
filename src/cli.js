#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { crawl, toMarkdown } from './linkcheck.js';

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith('--'));
if (!url) {
  console.log('Usage: linkcheck <site-url> [--max-pages=200] [--internal-only]');
  process.exit(1);
}
const maxPages = Number(args.find((a) => a.startsWith('--max-pages='))?.split('=')[1] ?? 200);
const checkExternal = !args.includes('--internal-only');

console.log(`Crawling ${url} ...`);
const report = await crawl(url, { maxPages, checkExternal });
const md = toMarkdown(report);
await mkdir('reports', { recursive: true });
const file = `reports/links-${new URL(url).host}.md`;
await writeFile(file, md);
await writeFile(file.replace(/\.md$/, '.json'), JSON.stringify(report, null, 2));

const broken = report.results.filter((r) => !r.ok);
console.log(`Pages: ${report.pages.length}, links: ${report.results.length}, broken: ${broken.length}`);
for (const r of broken) console.log(`  ✗ ${r.status || r.error}  ${r.url}`);
console.log(`Report saved to ${file}`);
process.exitCode = broken.length ? 2 : 0;
