# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems.
Use GitHub's private reporting: **Security → Report a vulnerability** on
<https://github.com/andybuki/filelens-check/security/advisories/new>.

Include what you found, how to reproduce it, and the impact. This is a
one-person project, so please allow a few days for an answer.

## Scope

- The page and its scripts (`index.html`, `app.js`, `src/`, `vendor/`).
- Anything that could make the page send file contents or metadata anywhere,
  or make the cleaned file keep data it claims to remove.

## Design notes relevant to security

- Files are read with the browser's File API and never leave the device. The
  Content-Security-Policy forbids network requests, external scripts, styles
  and fonts. A change that loosens it needs a very good reason.
- File names and metadata are always inserted as text, never as HTML.
- The only external link built from file data is the optional "Show on map"
  link, which the user must click and which says where it goes.
