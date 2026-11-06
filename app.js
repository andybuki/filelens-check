import { checkFile, stripMetadata } from './src/core.js';

const drop = document.getElementById('drop');
const input = document.getElementById('file');
const result = document.getElementById('result');

// Strings for the page's language, embedded by scripts/build.mjs.
const L = JSON.parse(document.getElementById('i18n').textContent);
const fill = (text, params = {}) => text.replace(/\{(\w+)\}/g, (m, k) => (k in params ? params[k] : m));
const t = (key, params) => fill(L.ui[key], params);
const typeLabel = (kind) => (kind ? L.types[kind] : L.ui.unknownType);
const listFormat = (items) => {
  try { return new Intl.ListFormat(L.locale, { type: 'conjunction' }).format(items); } catch { return items.join(', '); }
};

const IMAGE_KINDS = new Set(['jpeg', 'png', 'webp', 'heic', 'gif']);
const EXT = { jpeg: 'jpg', png: 'png', webp: 'webp' };

// Small DOM helper: el('p', {class: 'x'}, 'text', child). Text is always set as text, never HTML.
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) node.append(c instanceof Node ? c : String(c));
  return node;
}

const formatSize = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);

function formatDate(d) {
  if (!(d instanceof Date) || isNaN(d)) return d ? String(d) : null;
  return d.toLocaleString(L.locale, { dateStyle: 'long', timeStyle: 'short' });
}

async function readMetadata(bytes) {
  if (!window.exifr) return { tags: null, thumb: null };
  try {
    const tags = await window.exifr.parse(bytes, {
      tiff: true, exif: true, gps: true, ifd1: true, xmp: true, iptc: true,
      icc: false, makerNote: false, userComment: false, interop: false, mergeOutput: true,
    });
    let thumb = null;
    try { thumb = await window.exifr.thumbnail(bytes); } catch { /* no thumbnail */ }
    return { tags: tags || null, thumb };
  } catch {
    return { tags: null, thumb: null };
  }
}

// Turns raw tags into the facts a person cares about, most sensitive first.
function hiddenFacts(tags, thumb) {
  if (!tags && !thumb) return [];
  const m = tags || {};
  const facts = [];
  if (typeof m.latitude === 'number' && typeof m.longitude === 'number') {
    facts.push({ key: 'location', label: t('factLocation'), value: `${m.latitude.toFixed(5)}, ${m.longitude.toFixed(5)}`, lat: m.latitude, lon: m.longitude, danger: true });
  }
  const when = m.DateTimeOriginal || m.CreateDate || m.DateCreated || m.ModifyDate;
  if (when) facts.push({ label: t('factTaken'), value: formatDate(when) });
  const camera = [m.Make, m.Model].filter(Boolean).join(' ').trim();
  if (camera) facts.push({ label: t('factCamera'), value: camera });
  const owner = m.OwnerName || m.CameraOwnerName || m.Artist || m.creator || m['By-line'] || m.Copyright;
  if (owner) facts.push({ label: t('factOwner'), value: Array.isArray(owner) ? owner.join(', ') : owner, danger: true });
  const serial = m.BodySerialNumber || m.SerialNumber || m.InternalSerialNumber || m.LensSerialNumber;
  if (serial) facts.push({ label: t('factSerial'), value: serial, danger: true });
  if (m.Software) facts.push({ label: t('factSoftware'), value: m.Software });
  if (m.ImageDescription || m.description || m['Caption-Abstract']) facts.push({ label: t('factCaption'), value: m.ImageDescription || m.description || m['Caption-Abstract'] });
  if (thumb && thumb.length) facts.push({ key: 'thumb', label: t('factThumb'), value: t('factThumbValue') });
  return facts.map((f) => ({ ...f, value: typeof f.value === 'object' ? JSON.stringify(f.value) : String(f.value) }));
}

function verdict(check, facts) {
  if (check.findings.some((f) => f.severity === 'danger')) return { level: 'danger', text: t('verdictDanger') };
  if (check.findings.some((f) => f.severity === 'warning')) return { level: 'warning', text: t('verdictWarning') };
  if (facts.some((f) => f.danger)) return { level: 'warning', text: t('verdictPrivate') };
  if (facts.length) return { level: 'info', text: t('verdictInfo') };
  return { level: 'ok', text: t('verdictOk') };
}

function findingCard(f) {
  const text = L.findings[f.code];
  const params = { ...f.params, type: typeLabel(f.params.kind) };
  return el('article', { class: `finding ${f.severity}`, 'data-code': f.code },
    el('span', { class: 'sev' }, t(f.severity === 'danger' ? 'sevDanger' : f.severity === 'warning' ? 'sevWarning' : 'sevInfo')),
    el('h3', {}, fill(text.title, params)),
    el('p', {}, fill(text.why, params)),
    el('p', { class: 'action' }, fill(text.action, params)));
}

function factRow(f) {
  const value = el('dd', {}, f.value);
  if (f.key === 'location') {
    value.append(el('br'), el('a', {
      href: `https://www.openstreetmap.org/?mlat=${f.lat}&mlon=${f.lon}#map=17/${f.lat}/${f.lon}`,
      target: '_blank', rel: 'noopener noreferrer',
    }, t('showOnMap')), el('small', { class: 'hint' }, ` ${t('mapHint')}`));
  }
  return [el('dt', { class: f.danger ? 'danger' : null }, f.label), value];
}

function downloadName(name, kind) {
  const base = name.replace(/\.[^.]+$/, '') || 'photo';
  return `${base}-clean.${EXT[kind]}`;
}

async function cleanAndOffer(file, bytes, kind, panel) {
  const button = panel.querySelector('.clean');
  button.disabled = true;
  let out;
  try {
    out = stripMetadata(bytes, kind);
  } catch {
    panel.append(el('p', { class: 'error' }, t('damaged')));
    return;
  }
  const meta = await readMetadata(out.bytes);
  const after = hiddenFacts(meta.tags, meta.thumb);
  const url = URL.createObjectURL(new Blob([out.bytes], { type: file.type || `image/${EXT[kind]}` }));
  const name = downloadName(file.name, kind);
  const done = el('div', { class: 'cleaned' },
    el('p', {}, after.length === 0
      ? t('done', { list: listFormat(out.removed.map((code) => L.removed[code])) })
      : t('partial')),
    out.keptOrientation ? el('p', { class: 'hint' }, t('orientationKept')) : null,
    el('a', { class: 'btn', href: url, download: name }, t('download', { name })));
  button.replaceWith(done);
}

async function handle(file) {
  if (!file) return;
  result.hidden = false;
  result.replaceChildren(el('p', { class: 'muted' }, t('reading')));

  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = checkFile(bytes, file.name || 'pasted-image');
  const label = typeLabel(check.kind);
  const isImage = IMAGE_KINDS.has(check.kind);
  const { tags, thumb } = isImage ? await readMetadata(bytes) : { tags: null, thumb: null };
  const facts = isImage ? hiddenFacts(tags, thumb) : [];
  const v = verdict(check, facts);

  const header = el('div', { class: 'file' },
    isImage && check.kind !== 'heic' && check.findings.length === 0
      ? el('img', { class: 'thumb', src: URL.createObjectURL(file), alt: '' })
      : el('div', { class: 'thumb icon' }, (check.ext || '?').slice(0, 4).toUpperCase()),
    el('div', {},
      el('p', { class: 'name' }, file.name || t('pastedImage')),
      el('p', { class: 'meta' }, `${formatSize(file.size)} · ${t('really', { type: label })}`)),
    el('span', { class: `verdict ${v.level}` }, v.text));

  const parts = [header];
  if (check.findings.length) parts.push(el('div', { class: 'findings' }, check.findings.map(findingCard)));

  if (isImage) {
    const panel = el('div', { class: 'photo' });
    if (facts.length) {
      panel.append(el('h2', {}, t('hiddenTitle')), el('dl', {}, facts.flatMap(factRow)));
      if (EXT[check.kind]) {
        panel.append(el('button', { class: 'btn clean', type: 'button' }, t('removeButton')));
        panel.querySelector('.clean').addEventListener('click', () => cleanAndOffer(file, bytes, check.kind, panel));
      } else {
        panel.append(el('p', { class: 'hint' }, t('cantClean', { type: label })));
      }
    } else {
      panel.append(el('h2', {}, t('noHiddenTitle')), el('p', { class: 'muted' }, t('noHiddenText')));
    }
    parts.push(panel);
  } else if (!check.findings.length) {
    parts.push(el('p', { class: 'muted' }, check.kind ? t('matches') : t('unknown')));
  }

  parts.push(el('button', { class: 'link again', type: 'button' }, t('again')));
  result.replaceChildren(...parts);
  result.querySelector('.again').addEventListener('click', () => { result.hidden = true; input.value = ''; input.click(); });
  result.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

input.addEventListener('change', () => handle(input.files[0]));
drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
for (const type of ['dragenter', 'dragover']) drop.addEventListener(type, (e) => { e.preventDefault(); drop.classList.add('over'); });
for (const type of ['dragleave', 'drop']) drop.addEventListener(type, () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => { e.preventDefault(); handle(e.dataTransfer.files[0]); });
// Dropping outside the box should not navigate away to the file.
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => { e.preventDefault(); if (e.dataTransfer.files[0]) handle(e.dataTransfer.files[0]); });
window.addEventListener('paste', (e) => {
  const item = [...(e.clipboardData?.items || [])].find((i) => i.kind === 'file');
  if (item) handle(item.getAsFile());
});
