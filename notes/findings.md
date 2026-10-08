# Findings

- 2026-10-06: The resvg + sharp renderer matched the old ImageMagick output on 59 renders (same dimensions and line breaks) and runs about 40% faster. Requires Node >= 20.9.
- 2026-10-06: Emoji don't render with the SVG pipeline yet. (Fixed in 0.10.0, see below.)
- Public posts load from X's syndication feed with no token; `X_BEARER_TOKEN` is only needed for views, reposts, and bookmarks.
- `brew reinstall --HEAD` is invalid; uninstall, then `brew install --HEAD`.
- A stale checkout once caused npm's "cannot publish over" error; always `git pull` before bumping.
- The code.jspeaks.com DNS record (Porkbun) went missing once and was restored; check it if the site 404s.
- 2026-10-07: Emoji approach: inline Twemoji SVGs, one nested `<svg>` per emoji grapheme, placed at the x the text measurement reserved. resvg-js 2.6.2 renders nested `<svg viewBox>` (including Twemoji's few non-square viewBoxes and clip paths) reliably; ids are prefixed per use so repeated emoji don't collide. A color emoji font was not used: resvg's color-font support depends on the bundled resvg version and the font format, and it would add a multi-MB font.
- 2026-10-07: Bundle size: 4,009 Twemoji v17.0.3 SVGs = 10.1 MB raw, 1.8 MB gzip -9, 0.95 MB brotli q11 as one JSON (`assets/emoji/twemoji.json.br`). Decompress + parse is ~50 ms and only happens when a post has emoji. npm tarball went from ~110 KB unpacked (0.9.26) to 992 KB packed / 1.1 MB unpacked (17 files).
- 2026-10-07: Lookup keys drop U+FE0F (no collisions in v17.0.3); fallbacks: without skin tone, then the first pictograph. Grapheme splitting uses `Intl.Segmenter` (full ICU in Node and Homebrew node), with a hand-rolled fallback.
- 2026-10-07: x.com draws emoji at 1.2em with 0.075em margins, so an emoji advances 1.35em; the plate's character estimate counts one emoji as ~2.4 chars. Symbols the text face has (©, ™, →) stay text, as on x.com.
- 2026-10-07: Renders without emoji are byte-identical to 0.9.26 (checked all four views on the fixture plus accented/CJK text).
- 2026-10-07: Real emoji post for samples: https://x.com/Starlink/status/2094882783915295062 (🛰️🇺🇬❤️). The brew 0.10.0 build renders it byte-identical to the checkout.
