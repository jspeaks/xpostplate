# Findings

- 2026-10-06: The resvg + sharp renderer matched the old ImageMagick output on 59 renders (same dimensions and line breaks) and runs about 40% faster. Requires Node >= 20.9.
- 2026-10-06: Emoji don't render with the SVG pipeline yet.
- Public posts load from X's syndication feed with no token; `X_BEARER_TOKEN` is only needed for views, reposts, and bookmarks.
- `brew reinstall --HEAD` is invalid; uninstall, then `brew install --HEAD`.
- A stale checkout once caused npm's "cannot publish over" error; always `git pull` before bumping.
- The code.jspeaks.com DNS record (Porkbun) went missing once and was restored; check it if the site 404s.
