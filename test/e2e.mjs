// Browser test: serves the built site (_site/) locally, checks a photo and a
// fake file in English and in translated pages, and fails if a page makes any
// network request outside its own origin.
//   node scripts/build.mjs
//   npm install --no-save playwright && npx playwright install chromium
//   node test/e2e.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const repo = fileURLToPath(new URL('..', import.meta.url));
const root = join(repo, '_site');
const fixtures = join(repo, 'test', 'fixtures');

function loadPlaywright() {
  const require = createRequire(import.meta.url);
  try { return require('playwright'); } catch {
    return require(join(execSync('npm root -g').toString().trim(), 'playwright'));
  }
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.xml': 'application/xml', '.txt': 'text/plain' };
const server = createServer(async (req, res) => {
  let file = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  if (file === '' || file.endsWith('/')) file += 'index.html';
  try {
    const body = await readFile(join(root, file));
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
}).listen(0);
const origin = `http://localhost:${server.address().port}`;

const { chromium } = loadPlaywright();
const browser = await chromium.launch();
const failures = [];
try {
  const page = await browser.newPage({ acceptDownloads: true });
  const outside = [];
  const errors = [];
  page.on('request', (r) => { const u = r.url(); if (!u.startsWith(origin) && !u.startsWith('blob:') && !u.startsWith('data:')) outside.push(u); });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(origin + '/', { waitUntil: 'networkidle' });

  // Photo with GPS: shows location, cleans it, download has no GPS left.
  await page.setInputFiles('#file', join(fixtures, 'gps.jpg'));
  await page.waitForSelector('.photo dt');
  assert.match(await page.textContent('.photo dl'), /Exact location.*48\.858/s);
  await page.click('.clean');
  await page.waitForSelector('.cleaned a');
  assert.match(await page.textContent('.cleaned'), /Done\./);
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('.cleaned a')]);
  assert.equal(download.suggestedFilename(), 'gps-clean.jpg');
  const cleaned = await readFile(await download.path());
  assert.ok(!cleaned.includes('DemoCam'), 'cleaned file still has camera data');

  // APK disguised as a photo.
  await page.setInputFiles('#file', join(fixtures, 'wedding_invitation.jpg'));
  await page.waitForSelector('.finding.danger');
  assert.match(await page.textContent('.verdict'), /Do not open/);

  // A photo without metadata.
  await page.setInputFiles('#file', join(fixtures, 'clean.jpg'));
  await page.waitForSelector('.verdict.ok');

  // Translated pages: localized texts, and Arabic is laid out right to left.
  await page.goto(origin + '/ru/', { waitUntil: 'networkidle' });
  assert.equal(await page.getAttribute('html', 'lang'), 'ru');
  await page.setInputFiles('#file', join(fixtures, 'wedding_invitation.jpg'));
  await page.waitForSelector('.finding.danger');
  assert.match(await page.textContent('.finding h3'), /Android/);
  assert.doesNotMatch(await page.textContent('.result'), /Check another file|Danger/);
  await page.goto(origin + '/ar/', { waitUntil: 'networkidle' });
  assert.equal(await page.getAttribute('html', 'dir'), 'rtl');
  await page.setInputFiles('#file', join(fixtures, 'gps.png'));
  await page.waitForSelector('.photo dt');

  assert.deepEqual(outside, [], 'page made network requests');
  assert.deepEqual(errors, [], 'page logged errors');
  console.log('e2e: ok');
} catch (e) {
  failures.push(e);
  console.error(e);
} finally {
  await browser.close();
  server.close();
}
process.exit(failures.length ? 1 : 0);
