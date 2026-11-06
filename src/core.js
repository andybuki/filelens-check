// Pure byte-level logic shared by the page and the tests. No DOM, no network.

const ascii = (bytes, start, len) => String.fromCharCode(...bytes.subarray(start, start + len));

const article = (label) => (/^[AEIOU]/.test(label) ? 'an' : 'a');

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

// kind: what the bytes really are. risky: can run code or phish when opened.
export const TYPES = {
  apk: { label: 'Android app (APK)', exts: ['apk', 'apks', 'xapk'], risky: true },
  exe: { label: 'Windows program (EXE/DLL)', exts: ['exe', 'dll', 'scr', 'com', 'sys', 'msi'], risky: true },
  elf: { label: 'Linux/Android native program (ELF)', exts: ['so', 'elf', 'bin', ''], risky: true },
  dex: { label: 'Android code (DEX)', exts: ['dex'], risky: true },
  jar: { label: 'Java program (JAR)', exts: ['jar'], risky: true },
  html: { label: 'Web page (HTML)', exts: ['html', 'htm', 'xhtml', 'svg'], risky: true },
  script: { label: 'Script', exts: ['sh', 'py', 'pl', 'rb', 'bash'], risky: true },
  pdf: { label: 'PDF document', exts: ['pdf'] },
  docx: { label: 'Word document (DOCX)', exts: ['docx', 'docm', 'dotx', 'dotm'] },
  xlsx: { label: 'Excel workbook (XLSX)', exts: ['xlsx', 'xlsm', 'xltx', 'xltm'] },
  pptx: { label: 'PowerPoint (PPTX)', exts: ['pptx', 'pptm', 'potx', 'ppsx'] },
  ole: { label: 'Old Office document (DOC/XLS/PPT)', exts: ['doc', 'xls', 'ppt', 'msg', 'msi'] },
  epub: { label: 'E-book (EPUB)', exts: ['epub'] },
  zip: { label: 'ZIP archive', exts: ['zip', 'cbz', 'kmz', 'xpi', 'odt', 'ods', 'odp'] },
  rar: { label: 'RAR archive', exts: ['rar', 'cbr'] },
  '7z': { label: '7-Zip archive', exts: ['7z'] },
  gzip: { label: 'GZIP archive', exts: ['gz', 'tgz'] },
  jpeg: { label: 'JPEG image', exts: ['jpg', 'jpeg', 'jpe', 'jfif'] },
  png: { label: 'PNG image', exts: ['png'] },
  gif: { label: 'GIF image', exts: ['gif'] },
  webp: { label: 'WebP image', exts: ['webp'] },
  heic: { label: 'HEIC/AVIF image', exts: ['heic', 'heif', 'avif'] },
  mp4: { label: 'Video (MP4/MOV)', exts: ['mp4', 'm4v', 'mov', 'm4a', '3gp'] },
  mp3: { label: 'Audio (MP3)', exts: ['mp3'] },
  ogg: { label: 'Audio (OGG/Opus)', exts: ['ogg', 'oga', 'opus'] },
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

// Findings follow the FileLens three-beat style: what, why it matters, what to do.
// severity: danger | warning | info | ok
export function checkFile(bytes, name) {
  const kind = detectKind(bytes);
  const { ext, innerExt, bidi } = nameParts(name);
  const findings = [];
  const type = kind ? TYPES[kind] : null;

  if (bidi) {
    findings.push({
      severity: 'danger',
      title: 'The file name hides its real ending',
      why: 'It contains invisible right-to-left characters, a trick to make "gpj.apk" look like ".jpg".',
      action: 'Do not open it. Delete it unless you trust the sender completely.',
    });
  }

  if (type && ext && !type.exts.includes(ext) && !(kind === 'zip' && ['apk', 'jar', 'docx', 'xlsx', 'pptx', 'epub'].includes(ext))) {
    findings.push({
      severity: type.risky ? 'danger' : 'warning',
      title: `".${ext}" is really ${article(type.label)} ${type.label}`,
      why: type.risky
        ? 'The name pretends to be a harmless file, but opening it can install or run a program.'
        : 'The extension does not match the content. Usually harmless, sometimes a sign of tampering.',
      action: type.risky
        ? 'Do not open or install it. Ask the sender how they made it, or delete it.'
        : `Rename it to .${type.exts[0]} if you trust it.`,
    });
  } else if (type && type.risky) {
    findings.push({
      severity: 'warning',
      title: `This is ${article(type.label)} ${type.label}`,
      why: 'Opening it can install or run a program on your device.',
      action: 'Only open it if it comes from a source you trust, such as an official store.',
    });
  }

  if (type && innerExt && TYPES[kind].exts.includes(ext) && Object.values(TYPES).some((t) => t.exts.includes(innerExt)) && type.risky) {
    findings.push({
      severity: 'danger',
      title: `Double extension: ".${innerExt}.${ext}"`,
      why: `Phones and PCs often hide the last ending, so this looks like a .${innerExt} file.`,
      action: 'Do not open it. This is a common trick in scam messages.',
    });
  }

  if (kind === 'pdf') {
    const pdfChecks = [
      ['/JavaScript', 'PDF contains JavaScript', 'Scripts in PDFs are rarely needed and are used in attacks.'],
      ['/Launch', 'PDF can launch other programs', 'A /Launch action can try to start a program on your computer.'],
      ['/EmbeddedFile', 'PDF has files hidden inside', 'Attachments inside a PDF can carry other documents or programs.'],
      ['/OpenAction', 'PDF runs an action when opened', 'Often harmless (jump to a page), but also how scripts start automatically.'],
    ];
    for (const [needle, title, why] of pdfChecks) {
      if (contains(bytes, needle)) {
        findings.push({ severity: needle === '/OpenAction' ? 'info' : 'warning', title, why, action: 'Open it in a viewer that blocks scripts, or check it with FileLens first.' });
      }
    }
  }

  if (['docx', 'xlsx', 'pptx'].includes(kind) && contains(bytes, 'vbaProject.bin')) {
    findings.push({
      severity: 'danger',
      title: 'Office file contains macros',
      why: 'Macros are small programs. Malicious macros are a classic way to infect computers.',
      action: 'Do not enable editing or macros unless you expected them.',
    });
  }

  return { kind, label: type ? type.label : 'Unknown type', ext, findings };
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

const JPEG_DROP = {
  0xe1: 'EXIF / XMP (GPS, camera, dates)',
  0xed: 'IPTC (author, caption, location names)',
  0xfe: 'Comment',
};
for (let m = 0xe3; m <= 0xef; m++) if (!(m in JPEG_DROP) && m !== 0xee) JPEG_DROP[m] = `APP${m - 0xe0} vendor data`;

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

const PNG_DROP = { eXIf: 'EXIF (GPS, camera, dates)', tEXt: 'Text notes', iTXt: 'Text / XMP', zTXt: 'Compressed text', tIME: 'Last-modified time' };

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

const WEBP_DROP = { EXIF: 'EXIF (GPS, camera, dates)', 'XMP ': 'XMP' };

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
