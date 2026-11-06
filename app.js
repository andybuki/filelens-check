import { checkFile, stripMetadata } from './src/core.js';

const drop = document.getElementById('drop');
const input = document.getElementById('file');
const result = document.getElementById('result');

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
  return d.toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' });
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
  const t = tags || {};
  const facts = [];
  if (typeof t.latitude === 'number' && typeof t.longitude === 'number') {
    facts.push({ key: 'location', label: 'Exact location', value: `${t.latitude.toFixed(5)}, ${t.longitude.toFixed(5)}`, lat: t.latitude, lon: t.longitude, danger: true });
  }
  const when = t.DateTimeOriginal || t.CreateDate || t.DateCreated || t.ModifyDate;
  if (when) facts.push({ label: 'Taken on', value: formatDate(when) });
  const camera = [t.Make, t.Model].filter(Boolean).join(' ').trim();
  if (camera) facts.push({ label: 'Phone or camera', value: camera });
  const owner = t.OwnerName || t.CameraOwnerName || t.Artist || t.creator || t['By-line'] || t.Copyright;
  if (owner) facts.push({ label: 'Name of the owner', value: Array.isArray(owner) ? owner.join(', ') : owner, danger: true });
  const serial = t.BodySerialNumber || t.SerialNumber || t.InternalSerialNumber || t.LensSerialNumber;
  if (serial) facts.push({ label: 'Device serial number', value: serial, danger: true });
  if (t.Software) facts.push({ label: 'Edited with', value: t.Software });
  if (t.ImageDescription || t.description || t['Caption-Abstract']) facts.push({ label: 'Hidden caption', value: t.ImageDescription || t.description || t['Caption-Abstract'] });
  if (thumb && thumb.length) facts.push({ key: 'thumb', label: 'Embedded preview', value: 'A small copy of the original picture, which can show parts you cropped out' });
  return facts.map((f) => ({ ...f, value: typeof f.value === 'object' ? JSON.stringify(f.value) : String(f.value) }));
}

function verdict(check, facts) {
  if (check.findings.some((f) => f.severity === 'danger')) return { level: 'danger', text: 'Do not open this file' };
  if (check.findings.some((f) => f.severity === 'warning')) return { level: 'warning', text: 'Be careful with this file' };
  if (facts.some((f) => f.danger)) return { level: 'warning', text: 'This photo reveals private details' };
  if (facts.length) return { level: 'info', text: 'This photo carries some hidden details' };
  return { level: 'ok', text: 'Nothing suspicious found' };
}

function findingCard(f) {
  return el('article', { class: `finding ${f.severity}` },
    el('span', { class: 'sev' }, f.severity === 'danger' ? 'Danger' : f.severity === 'warning' ? 'Warning' : 'Info'),
    el('h3', {}, f.title),
    el('p', {}, f.why),
    el('p', { class: 'action' }, f.action));
}

function factRow(f) {
  const value = el('dd', {}, f.value);
  if (f.key === 'location') {
    value.append(el('br'), el('a', {
      href: `https://www.openstreetmap.org/?mlat=${f.lat}&mlon=${f.lon}#map=17/${f.lat}/${f.lon}`,
      target: '_blank', rel: 'noopener noreferrer',
    }, 'Show on map'), el('small', { class: 'hint' }, ' opens openstreetmap.org with these coordinates'));
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
    panel.append(el('p', { class: 'error' }, 'This image looks damaged, so it could not be cleaned safely.'));
    return;
  }
  const meta = await readMetadata(out.bytes);
  const after = hiddenFacts(meta.tags, meta.thumb);
  const url = URL.createObjectURL(new Blob([out.bytes], { type: file.type || `image/${EXT[kind]}` }));
  const name = downloadName(file.name, kind);
  const done = el('div', { class: 'cleaned' },
    el('p', {}, after.length === 0
      ? `Done. Removed: ${out.removed.join(', ') || 'metadata'}. Image quality is unchanged.`
      : 'Cleaned, but some details remain. Use the FileLens app for a deeper clean.'),
    out.keptOrientation ? el('p', { class: 'hint' }, 'Only the rotation flag was kept, so the photo is not shown sideways.') : null,
    el('a', { class: 'btn', href: url, download: name }, `Download ${name}`));
  button.replaceWith(done);
}

async function handle(file) {
  if (!file) return;
  result.hidden = false;
  result.replaceChildren(el('p', { class: 'muted' }, 'Reading the file on your device…'));

  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = checkFile(bytes, file.name || 'pasted-image');
  const isImage = IMAGE_KINDS.has(check.kind);
  const { tags, thumb } = isImage ? await readMetadata(bytes) : { tags: null, thumb: null };
  const facts = isImage ? hiddenFacts(tags, thumb) : [];
  const v = verdict(check, facts);

  const header = el('div', { class: 'file' },
    isImage && check.kind !== 'heic' && check.findings.length === 0
      ? el('img', { class: 'thumb', src: URL.createObjectURL(file), alt: '' })
      : el('div', { class: 'thumb icon' }, (check.ext || '?').slice(0, 4).toUpperCase()),
    el('div', {},
      el('p', { class: 'name' }, file.name || 'Pasted image'),
      el('p', { class: 'meta' }, `${formatSize(file.size)} · really: ${check.label}`)),
    el('span', { class: `verdict ${v.level}` }, v.text));

  const parts = [header];
  if (check.findings.length) parts.push(el('div', { class: 'findings' }, check.findings.map(findingCard)));

  if (isImage) {
    const panel = el('div', { class: 'photo' });
    if (facts.length) {
      panel.append(el('h2', {}, 'Hidden in this photo'), el('dl', {}, facts.flatMap(factRow)));
      if (EXT[check.kind]) {
        panel.append(el('button', { class: 'btn clean', type: 'button' }, 'Remove hidden details'));
        panel.querySelector('.clean').addEventListener('click', () => cleanAndOffer(file, bytes, check.kind, panel));
      } else {
        panel.append(el('p', { class: 'hint' }, `${check.label} files can't be cleaned in the browser yet. Share it as a normal photo from your gallery, or convert it to JPEG first.`));
      }
    } else {
      panel.append(el('h2', {}, 'No hidden location or camera details'), el('p', { class: 'muted' }, 'This image is safe to share as it is.'));
    }
    parts.push(panel);
  } else if (!check.findings.length) {
    parts.push(el('p', { class: 'muted' }, check.kind
      ? `The content matches the name. This page checks photos for hidden details; for documents, archives and apps, FileLens on Android shows much more.`
      : `Unknown file type. FileLens on Android can inspect it in more depth.`));
  }

  parts.push(el('button', { class: 'link again', type: 'button' }, 'Check another file'));
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
