# Contributing

Thanks for your interest! Please read this first.

## License of contributions

FileLens Check is licensed under the [MIT License](LICENSE). By submitting a
pull request you confirm that you wrote the contribution (or have the right to
submit it) and that you license it under the same terms.

## Ground rules

- Keep the principles: everything runs locally in the browser, no network
  requests, no analytics, no third-party scripts, styles or fonts, no build step.
- Never put real photos, documents or locations in fixtures, issues or
  screenshots. Generate synthetic files with `scripts/make_fixtures.py`.
- Add or update tests and run them before opening a PR:

```bash
npm test
node test/e2e.mjs
```

- Small, focused pull requests are easier to review. Open an issue first for
  larger changes.
- All changes go through pull requests and need maintainer approval.
