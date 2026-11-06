// Pure byte-level logic shared by the page and the tests. No DOM, no network.

const ascii = (bytes, start, len) => String.fromCharCode(...bytes.subarray(start, start + len));

const startsWith = (bytes, sig, offset = 0) =>
  sig.every((b, i) => bytes[offset + i] === b);

// Finds an ASCII needle anywhere in the first `limit` bytes.
function contains(bytes, needle, limit = bytes.length) {
  const n = needle.length;
  const end = Math.min(bytes.length, limit) - n;
  const first = needle.charCodeAt(0);
  outer: for (let i = 0; i <= end; i++) {
    if (bytes[i] !== first) continue;
    for (let j = 1; j < n; j++) if (bytes[i + j] !== needle.charCodeAt(j)) continue outer;
    return true;
  }
  return false;
}

// kind: what the bytes really are (labels live in i18n/). risky: can run code or phish when opened.
export const TYPES = {
  apk: { exts: ['apk', 'apks', 'xapk'], risky: true },
  exe: { exts: ['exe', 'dll', 'scr', 'com', 'sys', 'msi'], risky: true },
  elf: { exts: ['so', 'elf', 'bin', ''], risky: true },
  dex: { exts: ['dex'], risky: true },
  jar: { exts: ['jar'], risky: true },
  html: { exts: ['html', 'htm', 'xhtml', 'svg'], risky: true },
  script: { exts: ['sh', 'py', 'pl', 'rb', 'bash'], risky: true },
  pdf: { exts: ['pdf'] },
  docx: { exts: ['docx', 'docm', 'dotx', 'dotm'] },
  xlsx: { exts: ['xlsx', 'xlsm', 'xltx', 'xltm'] },
  pptx: { exts: ['pptx', 'pptm', 'potx', 'ppsx'] },
  ole: { exts: ['doc', 'xls', 'ppt', 'msg', 'msi'] },
  epub: { exts: ['epub'] },
  zip: { exts: ['zip', 'cbz', 'kmz', 'xpi', 'odt', 'ods', 'odp'] },
  rar: { exts: ['rar', 'cbr'] },
  '7z': { exts: ['7z'] },
  gzip: { exts: ['gz', 'tgz'] },
  jpeg: { exts: ['jpg', 'jpeg', 'jpe', 'jfif'] },
  png: { exts: ['png'] },
  gif: { exts: ['gif'] },
  webp: { exts: ['webp'] },
  heic: { exts: ['heic', 'heif', 'avif'] },
  mp4: { exts: ['mp4', 'm4v', 'mov', 'm4a', '3gp'] },
  mp3: { exts: ['mp3'] },
  ogg: { exts: ['ogg', 'oga', 'opus'] },
};

export function detectKind(bytes) {
  const b = bytes;
  if (startsWith(b, [0x50, 0x4b, 0x03, 0x04])) {
    if (contains(b, 'AndroidManifest.xml') && contains(b, 'classes')) return 'apk';
    if (contains(b, 'mimetypeapplication/epub+zip', 128)) return 'epub';
    if (contains(b, 'word/')) return 'docx';
    if (contains(b, 'xl/')) return 'xlsx';
    if (contains(b, 'ppt/')) return 'pptx';
    if (contains(b, 'META-INF/MANIFEST.MF') && contains(b, '.class')) return 'jar';
    return 'zip';
  }
  if (startsWith(b, [0x25, 0x50, 0x44, 0x46])) return 'pdf';
  if (startsWith(b, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (ascii(b, 0, 4) === 'GIF8') return 'gif';
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return 'webp';
  if (ascii(b, 4, 4) === 'ftyp') {
    const brand = ascii(b, 8, 4);
    return ['heic', 'heix', 'hevc', 'mif1', 'msf1', 'avif'].includes(brand) ? 'heic' : 'mp4';
  }
  if (startsWith(b, [0x4d, 0x5a])) return 'exe';
  if (startsWith(b, [0x7f, 0x45, 0x4c, 0x46])) return 'elf';
  if (ascii(b, 0, 4) === 'dex\n') return 'dex';
  if (ascii(b, 0, 4) === 'Rar!') return 'rar';
  if (startsWith(b, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) return '7z';
  if (startsWith(b, [0x1f, 0x8b])) return 'gzip';
  if (startsWith(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return 'ole';
  if (ascii(b, 0, 3) === 'ID3' || startsWith(b, [0xff, 0xfb]) || startsWith(b, [0xff, 0xf3])) return 'mp3';
  if (ascii(b, 0, 4) === 'OggS') return 'ogg';
  if (ascii(b, 0, 2) === '#!') return 'script';
  const head = ascii(b, 0, Math.min(b.length, 512)).replace(/^﻿/, '').trimStart().toLowerCase();
  if (head.startsWith('<!doctype html') || head.startsWith('<html') || /<script[\s>]/.test(head)) return 'html';
  return null;
}

// Extension the user sees: the last one, plus a hidden earlier one ("a.pdf.apk").
export function nameParts(name) {
  const clean = name.replace(/[‪-‮⁦-⁩]/g, '');
  const parts = clean.toLowerCase().split('.');
  return {
    ext: parts.length > 1 ? parts.at(-1) : '',
    innerExt: parts.length > 2 ? parts.at(-2) : '',
    bidi: clean !== name,
  };
}

// A finding is a code plus parameters; the page turns it into localized text
// (what was found, why it matters, what to do). severity: danger | warning | info
export function checkFile(bytes, name) {
  const kind = detectKind(bytes);
  const { ext, innerExt, bidi } = nameParts(name);
  const findings = [];
  const type = kind ? TYPES[kind] : null;
  const add = (code, severity, params = {}) => findings.push({ code, severity, params });

  if (bidi) add('bidi', 'danger');

  const zipFamily = kind === 'zip' && ['apk', 'jar', 'docx', 'xlsx', 'pptx', 'epub'].includes(ext);
  if (type && ext && !type.exts.includes(ext) && !zipFamily) {
    add(type.risky ? 'mismatchRisky' : 'mismatch', type.risky ? 'danger' : 'warning', { ext, kind, right: type.exts[0] });
  } else if (type && type.risky) {
    add('riskyType', 'warning', { kind });
  }

  if (type && type.risky && innerExt && type.exts.includes(ext) && Object.values(TYPES).some((t) => t.exts.includes(innerExt))) {
    add('doubleExt', 'danger', { inner: innerExt, ext });
  }

  if (kind === 'pdf') {
    if (contains(bytes, '/JavaScript')) add('pdfJavaScript', 'warning');
    if (contains(bytes, '/Launch')) add('pdfLaunch', 'warning');
    if (contains(bytes, '/EmbeddedFile')) add('pdfEmbedded', 'warning');
    if (contains(bytes, '/OpenAction')) add('pdfOpenAction', 'info');
  }

  if (['docx', 'xlsx', 'pptx'].includes(kind) && contains(bytes, 'vbaProject.bin')) add('macros', 'danger');

  return { kind, ext, findings };
}

// ---------- Lossless metadata removal ----------

// Minimal EXIF block that keeps only the orientation, so phones still show the
// photo the right way up after everything else is removed.
function orientationApp1(orientation) {
  const tiff = [0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0, 0, 0, 0, 0];
  const payload = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const len = payload.length + 2;
  return Uint8Array.from([0xff, 0xe1, len >> 8, len & 0xff, ...payload]);
}

// Reads the EXIF orientation (1-8) from an APP1 segment payload, or 0.
function readOrientation(seg) {
  if (ascii(seg, 0, 6) !== 'Exif\0\0') return 0;
  const t = seg.subarray(6);
  const le = t[0] === 0x49;
  const u16 = (o) => (le ? t[o] | (t[o + 1] << 8) : (t[o] << 8) | t[o + 1]);
  const u32 = (o) => (le ? (t[o] | (t[o + 1] << 8) | (t[o + 2] << 16) | (t[o + 3] << 24)) >>> 0 : ((t[o] << 24) | (t[o + 1] << 16) | (t[o + 2] << 8) | t[o + 3]) >>> 0);
  const ifd = u32(4);
  if (ifd + 2 > t.length) return 0;
  const count = u16(ifd);
  for (let i = 0; i < count; i++) {
    const e = ifd + 2 + i * 12;
    if (e + 12 > t.length) break;
    if (u16(e) === 0x0112) return u16(e + 8);
  }
  return 0;
}

// Values are codes of what was removed; the page shows them localized.
const JPEG_DROP = { 0xe1: 'exif', 0xed: 'iptc', 0xfe: 'comment' };
for (let m = 0xe3; m <= 0xef; m++) if (!(m in JPEG_DROP) && m !== 0xee) JPEG_DROP[m] = 'vendor';

export function stripJpeg(bytes) {
  const out = [bytes.subarray(0, 2)];
  const removed = new Set();
  let orientation = 0;
  let i = 2;
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) throw new Error('Damaged JPEG');
    const marker = bytes[i + 1];
    if (marker === 0xda) break; // start of scan: the rest is image data
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { out.push(bytes.subarray(i, i + 2)); i += 2; continue; }
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    const seg = bytes.subarray(i, i + 2 + len);
    if (marker in JPEG_DROP) {
      if (marker === 0xe1) orientation ||= readOrientation(seg.subarray(4));
      removed.add(JPEG_DROP[marker]);
    } else {
      out.push(seg);
    }
    i += 2 + len;
  }
  out.push(bytes.subarray(i));
  if (orientation > 1 && orientation <= 8) out.splice(1, 0, orientationApp1(orientation));
  return { bytes: concat(out), removed: [...removed], keptOrientation: orientation > 1 };
}

const PNG_DROP = { eXIf: 'exif', tEXt: 'text', iTXt: 'text', zTXt: 'text', tIME: 'time' };

export function stripPng(bytes) {
  const out = [bytes.subarray(0, 8)];
  const removed = new Set();
  let i = 8;
  while (i + 12 <= bytes.length) {
    const len = ((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >>> 0;
    const type = ascii(bytes, i + 4, 4);
    const end = i + 12 + len;
    if (type in PNG_DROP) removed.add(PNG_DROP[type]);
    else out.push(bytes.subarray(i, end));
    i = end;
    if (type === 'IEND') break;
  }
  return { bytes: concat(out), removed: [...removed], keptOrientation: false };
}

const WEBP_DROP = { EXIF: 'exif', 'XMP ': 'xmp' };

export function stripWebp(bytes) {
  const out = [];
  const removed = new Set();
  let i = 12;
  while (i + 8 <= bytes.length) {
    const type = ascii(bytes, i, 4);
    const len = (bytes[i + 4] | (bytes[i + 5] << 8) | (bytes[i + 6] << 16) | (bytes[i + 7] << 24)) >>> 0;
    const end = i + 8 + len + (len & 1);
    if (type in WEBP_DROP) {
      removed.add(WEBP_DROP[type]);
    } else {
      const chunk = bytes.slice(i, end);
      if (type === 'VP8X') chunk[8] &= ~(0x08 | 0x04); // clear EXIF + XMP flags
      out.push(chunk);
    }
    i = end;
  }
  const body = concat(out);
  const header = new Uint8Array(12);
  header.set(bytes.subarray(0, 12));
  const size = body.length + 4;
  header.set([size & 0xff, (size >> 8) & 0xff, (size >> 16) & 0xff, (size >>> 24) & 0xff], 4);
  return { bytes: concat([header, body]), removed: [...removed], keptOrientation: false };
}

export function stripMetadata(bytes, kind) {
  if (kind === 'jpeg') return stripJpeg(bytes);
  if (kind === 'png') return stripPng(bytes);
  if (kind === 'webp') return stripWebp(bytes);
  return null;
}

function concat(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
