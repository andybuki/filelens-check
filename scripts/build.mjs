// Builds the static site into _site/: one page per language from src/page.html
// and i18n/*.json, plus the shared scripts, styles and assets.
//
//   node scripts/build.mjs            # build into _site/
//   node scripts/build.mjs --check    # only validate the translations
//
// Every translation must have exactly the keys of en.json and the same
// {placeholders} in each string, so a missing or broken string fails the build.
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '_site');
const SITE = 'https://andybuki.github.io/filelens-check/';
const PLAY = 'https://play.google.com/store/apps/details?id=app.com.filelens';
// google*.html: Google Search Console ownership file, must stay at the site root.
const STATIC = ['app.js', 'styles.css', 'robots.txt', 'google17b4bbb2a8c0854c.html', 'src/core.js', 'vendor', 'assets'];

const load = (file) => JSON.parse(readFileSync(join(ROOT, 'i18n', file), 'utf8'));

// Flattens {"page": {"title": "x"}} to {"page.title": "x"}.
function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

const placeholders = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

function validate(languages) {
  const en = flatten(languages.find((l) => l.meta.hreflang === 'en'));
  const errors = [];
  for (const lang of languages) {
    const flat = flatten(lang);
    const id = lang.meta.hreflang;
    for (const key of Object.keys(en)) {
      if (key.startsWith('meta.')) continue;
      if (!(key in flat)) errors.push(`${id}: missing ${key}`);
      else if (!String(flat[key]).trim()) errors.push(`${id}: empty ${key}`);
      else if (placeholders(flat[key]) !== placeholders(en[key])) errors.push(`${id}: ${key} must use {${placeholders(en[key])}}`);
    }
    for (const key of Object.keys(flat)) if (!(key in en)) errors.push(`${id}: unknown key ${key}`);
  }
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exit(1);
  }
}

const escapeAttr = (s) => String(s).replace(/&(?!(?:[a-z]+|#\d+);)/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const pageUrl = (lang) => SITE + (lang.meta.path ? `${lang.meta.path}/` : '');

function render(template, lang, languages) {
  const flat = flatten(lang);
  const base = lang.meta.path ? '../' : '';
  const campaign = lang.meta.path || 'en';
  const vars = {
    lang: lang.meta.hreflang,
    dir: lang.meta.dir,
    ogLocale: lang.meta.hreflang.replace('-', '_'),
    base,
    home: './',
    canonical: pageUrl(lang),
    play: `${PLAY}&amp;hl=${lang.meta.playHl}&amp;referrer=utm_source%3Dfilelens-check%26utm_medium%3Dweb%26utm_content%3D${campaign}%26utm_campaign%3D`,
    alternates: [
      ...languages.map((l) => `  <link rel="alternate" hreflang="${l.meta.hreflang}" href="${pageUrl(l)}">`),
      `  <link rel="alternate" hreflang="x-default" href="${SITE}">`,
    ].join('\n'),
    languageLinks: languages
      .map((l) => (l === lang
        ? `<span aria-current="page">${l.meta.name}</span>`
        : `<a href="${base}${l.meta.path ? `${l.meta.path}/` : ''}" hreflang="${l.meta.hreflang}" lang="${l.meta.hreflang}">${l.meta.name}</a>`))
      .join(' '),
    // Data block for app.js; "</" is escaped so the text cannot close the script tag.
    i18nJson: JSON.stringify({ ui: lang.ui, removed: lang.removed, types: lang.types, findings: lang.findings, locale: lang.meta.hreflang }).replace(/<\//g, '<\\/'),
  };
  return template.replace(/\{\{([\w.]+)(?:\|(attr|json))?\}\}/g, (match, key, filter) => {
    const value = key in vars ? vars[key] : flat[key];
    if (value === undefined) throw new Error(`${lang.meta.hreflang}: no value for ${match}`);
    if (filter === 'attr') return escapeAttr(value);
    if (filter === 'json') return JSON.stringify(value).replace(/<\//g, '<\\/');
    return value;
  });
}

function sitemap(languages) {
  const links = languages.map((l) => `    <xhtml:link rel="alternate" hreflang="${l.meta.hreflang}" href="${pageUrl(l)}"/>`).join('\n');
  const urls = languages.map((l) => `  <url>\n    <loc>${pageUrl(l)}</loc>\n${links}\n  </url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`;
}

const files = readdirSync(join(ROOT, 'i18n')).filter((f) => f.endsWith('.json')).sort();
// English first: it is the root page and the reference for the others.
const languages = files.map(load).sort((a, b) => (a.meta.path === '' ? -1 : b.meta.path === '' ? 1 : 0));
validate(languages);
if (process.argv.includes('--check')) {
  console.log(`translations ok: ${languages.map((l) => l.meta.hreflang).join(', ')}`);
  process.exit(0);
}

const template = readFileSync(join(ROOT, 'src', 'page.html'), 'utf8');
rmSync(OUT, { recursive: true, force: true });
for (const lang of languages) {
  const dir = join(OUT, lang.meta.path);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), render(template, lang, languages));
}
for (const item of STATIC) cpSync(join(ROOT, item), join(OUT, item), { recursive: true });
writeFileSync(join(OUT, 'sitemap.xml'), sitemap(languages));
console.log(`built ${languages.length} languages into _site/`);
