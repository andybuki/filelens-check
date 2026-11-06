import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkFile, detectKind, nameParts, stripMetadata } from '../src/core.js';

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
  assert.match(r.findings[0].title, /\.jpg" is really an Android app/);
});

test('double extension on a program is a danger', () => {
  const r = checkFile(fixture('wedding_invitation.jpg'), 'card.pdf.apk');
  assert.ok(r.findings.some((f) => f.severity === 'danger' && /Double extension/.test(f.title)));
});

test('right-to-left override in the name is flagged', () => {
  assert.equal(nameParts('photo‮gpj.apk').bidi, true);
  const r = checkFile(fixture('wedding_invitation.jpg'), 'photo‮gpj.apk');
  assert.ok(r.findings.some((f) => /hides its real ending/.test(f.title)));
});

test('PDF with JavaScript is flagged, plain PDF is clean', () => {
  const bad = checkFile(fixture('invoice.pdf'), 'invoice.pdf');
  assert.ok(bad.findings.some((f) => /JavaScript/.test(f.title)));
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
