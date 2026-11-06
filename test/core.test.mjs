import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { TYPES, checkFile, detectKind, nameParts, stripMetadata } from '../src/core.js';

const fixture = (name) => new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));
const has = (bytes, text) => Buffer.from(bytes).includes(Buffer.from(text));

test('detects real types from bytes', () => {
  assert.equal(detectKind(fixture('gps.jpg')), 'jpeg');
  assert.equal(detectKind(fixture('gps.png')), 'png');
  assert.equal(detectKind(fixture('gps.webp')), 'webp');
  assert.equal(detectKind(fixture('invoice.pdf')), 'pdf');
  assert.equal(detectKind(fixture('wedding_invitation.jpg')), 'apk');
  assert.equal(detectKind(new TextEncoder().encode('<!DOCTYPE html><title>x</title>')), 'html');
  assert.equal(detectKind(Uint8Array.from([0x4d, 0x5a, 0x90, 0])), 'exe');
});

test('APK named .jpg is a danger', () => {
  const r = checkFile(fixture('wedding_invitation.jpg'), 'wedding_invitation.jpg');
  assert.equal(r.kind, 'apk');
  assert.equal(r.findings[0].severity, 'danger');
  assert.equal(r.findings[0].code, 'mismatchRisky');
  assert.deepEqual(r.findings[0].params, { ext: 'jpg', kind: 'apk', right: 'apk' });
});

test('double extension on a program is a danger', () => {
  const r = checkFile(fixture('wedding_invitation.jpg'), 'card.pdf.apk');
  assert.ok(r.findings.some((f) => f.severity === 'danger' && f.code === 'doubleExt' && f.params.inner === 'pdf'));
});

test('right-to-left override in the name is flagged', () => {
  assert.equal(nameParts('photo‮gpj.apk').bidi, true);
  const r = checkFile(fixture('wedding_invitation.jpg'), 'photo‮gpj.apk');
  assert.ok(r.findings.some((f) => f.code === 'bidi'));
});

test('PDF with JavaScript is flagged, plain PDF is clean', () => {
  const bad = checkFile(fixture('invoice.pdf'), 'invoice.pdf');
  assert.deepEqual(bad.findings.map((f) => f.code), ['pdfJavaScript', 'pdfOpenAction']);
  assert.deepEqual(checkFile(fixture('report.pdf'), 'report.pdf').findings, []);
});

test('matching image has no findings', () => {
  assert.deepEqual(checkFile(fixture('gps.jpg'), 'IMG_2041.JPG').findings, []);
});

for (const [file, kind] of [['gps.jpg', 'jpeg'], ['gps.png', 'png'], ['gps.webp', 'webp']]) {
  test(`strips GPS and camera data from ${kind}`, () => {
    const input = fixture(file);
    assert.ok(has(input, 'DemoCam'), 'fixture should contain metadata');
    const { bytes, removed } = stripMetadata(input, kind);
    assert.ok(removed.includes('exif'));
    assert.ok(!has(bytes, 'DemoCam'));
    assert.ok(!has(bytes, 'Model X'));
    assert.ok(removed.length > 0);
    assert.equal(detectKind(bytes), kind);
    assert.ok(bytes.length < input.length);
  });
}

test('JPEG keeps orientation only, image data untouched', () => {
  const input = fixture('gps.jpg');
  const { bytes, keptOrientation } = stripMetadata(input, 'jpeg');
  assert.equal(keptOrientation, true);
  const sos = (b) => Buffer.from(b).indexOf(Buffer.from([0xff, 0xda]));
  assert.deepEqual(Buffer.from(bytes.subarray(sos(bytes))), Buffer.from(input.subarray(sos(input))));
});

test('WebP RIFF size stays consistent', () => {
  const { bytes } = stripMetadata(fixture('gps.webp'), 'webp');
  const size = bytes[4] | (bytes[5] << 8) | (bytes[6] << 16) | (bytes[7] << 24);
  assert.equal(size, bytes.length - 8);
});

test('every translation has the same keys and placeholders as English', () => {
  const out = execFileSync(process.execPath, [new URL('../scripts/build.mjs', import.meta.url).pathname, '--check'], { encoding: 'utf8' });
  assert.match(out, /translations ok/);
});

test('every finding code and removed-part code has an English text', () => {
  const en = JSON.parse(readFileSync(new URL('../i18n/en.json', import.meta.url)));
  for (const code of ['bidi', 'mismatchRisky', 'mismatch', 'riskyType', 'doubleExt', 'pdfJavaScript', 'pdfLaunch', 'pdfEmbedded', 'pdfOpenAction', 'macros']) {
    assert.ok(en.findings[code]?.title, code);
  }
  for (const code of ['exif', 'iptc', 'comment', 'vendor', 'text', 'xmp', 'time']) assert.ok(en.removed[code], code);
  for (const kind of Object.keys(TYPES)) assert.ok(en.types[kind], kind);
});
