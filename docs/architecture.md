# Architecture

Args choose a source, overrides change the post, the view picks a drawing, and resvg plus sharp write the PNG (npm packages with prebuilt binaries; no ImageMagick since 0.9.26). Since 0.10.0, emoji graphemes (split with `Intl.Segmenter`) are drawn as inline Twemoji SVGs from `assets/emoji/twemoji.json.br`, at the x positions the text measurement reserved for them. Since 0.11.0, `--scale` zooms the rasterization (resvg `fitTo` zoom) without touching the layout: the SVG stays in `--width` pixels, sharp maps photo and avatar slots onto the zoomed canvas, and larger photo sizes are fetched from pbs.twimg.com when the output is wider than 1200px.

```mermaid
flowchart TD
  args[Parse args] --> source{Source}
  source -->|URL| fetch[Fetch API or syndication]
  source -->|fixture| fixture[Load fixture JSON]
  source -->|--fabricate| made[Build post from --text]
  fetch --> overrides[Apply name, text, time, and counts]
  fixture --> overrides
  made --> view[Choose detail default, timeline, quote, or plate]
  overrides --> view
  view --> images[Fetch photos and avatar, larger photo size when --scale needs it; skip any that fail]
  images --> svg[Render SVG: measured text, emoji graphemes inlined as bundled Twemoji SVGs]
  svg --> resvg[resvg rasterizes the SVG at --scale with the measured TTFs, system fonts off]
  resvg --> sharp[sharp crops, rounds, and composites photos and avatar at the scaled size]
  sharp --> out[Stdout, -o file, or TTY auto-file]
```
