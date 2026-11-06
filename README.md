# FileLens Check

**What is your file hiding?** A free web page that shows the GPS location,
camera and date hidden in a photo and removes them, and tells you what a file
really is — for example an Android app (APK) disguised as `invitation.jpg`.

**→ https://andybuki.github.io/filelens-check/**

![FileLens Check](assets/og.png)

- **Private by design:** everything runs in your browser. The page's security
  policy blocks every network request (`connect-src 'none'`), so files cannot
  be uploaded. No cookies, no analytics, no third-party scripts or fonts.
- **Lossless cleaning:** removes EXIF, XMP, IPTC and comments from JPEG, PNG
  and WebP without re-compressing the image. JPEG keeps only its orientation
  so photos are not shown sideways.
- **Fake-file check:** reads the file's first bytes to find its real type and
  warns about mismatched or double extensions (`bill.pdf.apk`), hidden
  right-to-left characters in names, scripts in PDFs and macros in Office
  files.

Not an antivirus: it does not compare files with virus databases.

It is the web companion of [FileLens](https://play.google.com/store/apps/details?id=app.com.filelens&referrer=utm_source%3Dgithub%26utm_medium%3Dreadme),
an Android file manager that does all of this automatically when you share or
open a file.

## Run it locally

It is a static page with no build step:

```bash
python3 -m http.server 8000     # then open http://localhost:8000
```

## Tests

```bash
npm test                                   # byte-level logic (Node 22+)
npm install --no-save playwright && npx playwright install chromium
node test/e2e.mjs                          # real browser, also fails on any network request
python3 scripts/make_fixtures.py           # regenerate synthetic test files (Pillow)
```

## How it is built

| File | What it does |
|---|---|
| `src/core.js` | Real file type from magic bytes, risk findings, lossless JPEG/PNG/WebP metadata removal. No DOM, no network. |
| `app.js` | Page logic: reads the file locally, shows findings, offers the cleaned download. |
| `vendor/exifr.umd.js` | [exifr](https://github.com/MikeKovarik/exifr) 7.1.3 (MIT), served from this site, used to read the metadata. |

Pushes to `main` deploy to GitHub Pages (`.github/workflows/pages.yml`); only
the site files are published, not tests or fixtures.

## License

[MIT](LICENSE). exifr is MIT-licensed, see `vendor/exifr.LICENSE`.
