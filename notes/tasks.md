# Tasks

## Open
- [ ] Publish 1.0.0 to npm (Jaye): `cd ~/dev/xpostplate && git pull && npm whoami && npm publish` (0.11.0 is on npm)
- [ ] Upload a GitHub social preview image (Settings → General → Social preview; the API cannot set it). Candidate: docs/media/og.png (1200x630)
- [ ] Optional: add CI (GitHub Actions running `npm test`) so the README can carry honest build and coverage badges; today it shows npm version, downloads, license, stars, and CLI only
- [ ] Draft launch posts (Show HN, dev.to/Hashnode article, r/commandline, X) for Jaye's approval
- [ ] Decide whether package.json `license` should become `MIT AND CC-BY-4.0` now that Twemoji graphics ship in the package (the Homebrew formula already says `all_of: ["MIT", "CC-BY-4.0"]`)
- [ ] The local `package-lock.json` on diana.local still has an uncommitted version-field drift (0.9.25 → 0.9.26, engines >=18 → >=20.9); it now lags package.json 1.0.0. Refresh with `npm install --package-lock-only` when convenient

## Done
- [x] 1.0.0: stable CLI interface under semver; package.json, homepage version label, timeline, README; GitHub release v1.0.0 (2026-10-09)
- [x] README opens with the output: VHS terminal demo (assets/demo.tape → demo.gif/demo.mp4 via scripts/demo.sh, ending on the real PNG), 2x hero render (docs/media/readme-hero.png), three-view strip (docs/media/readme-views.png), badges, three-line quick start, `npx skills add jspeaks/xpostplate` (verified), tighter Why (2026-10-09)
- [x] GitHub repo topics, description, and homepage (https://code.jspeaks.com/xpostplate/) set (2026-10-09)
- [x] 0.11.0: `--scale <n>` (0.5–8) for pixel density independent of `--width` layout; vector-rasterized via resvg zoom, photos and avatar composited at the scaled size, larger photo sizes fetched when needed, 16384px-per-side cap; --help, README, /docs (#scale), FAB, timeline, skill, architecture updated; tests added (2026-10-09)
- [x] Tap formula 0.11.0 (url + sha256 8b01b825…8837, `--scale 2` check in `brew test`); packaging/homebrew synced; `brew upgrade` on diana.local verified (2026-10-09)
- [x] Homepage chips (CLI, agentic, chainable, deterministic, self-contained) get hover/focus/tap tooltips with one-line explanations; edge-aware at 390px, no layout shift (2026-10-09)
- [x] 0.10.0: color emoji in every view and theme via bundled Twemoji v17.0.3 (2026-10-07)
- [x] Docs hero, view samples, and og.png regenerated with the faithful detail view (2026-10-07)
- [x] Homepage simplified to one before-and-after (URL + `xpostplate <url> > post.png` → PNG); views, plate, and emoji moved to /docs (2026-10-07)
- [x] Tap formula 0.10.0 (url + sha256, license MIT and CC-BY-4.0, emoji fixture in `brew test`); packaging/homebrew synced (2026-10-07)
- [x] 0.9.26: drop ImageMagick, render SVG via @resvg/resvg-js + sharp (2026-10-06)
- [x] GA4 + event tracking on the site (G-YTNXQ6PRPH)
- [x] Clean URLs across the site (no index.html or .html)
- [x] Homebrew stable install from the v0.9.26 tag; packaging formula synced
