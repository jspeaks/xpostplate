# Architecture

Args choose a source, overrides change the post, the view picks a drawing, and resvg plus sharp write the PNG (npm packages with prebuilt binaries; no ImageMagick since 0.9.26). Since 0.10.0, emoji graphemes (split with `Intl.Segmenter`) are drawn as inline Twemoji SVGs from `assets/emoji/twemoji.json.br`, at the x positions the text measurement reserved for them.

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
  view --> images[Fetch photos and avatar, skip any that fail]
  images --> svg[Render SVG: measured text, emoji graphemes inlined as bundled Twemoji SVGs]
  svg --> resvg[resvg rasterizes the SVG with the measured TTFs, system fonts off]
  resvg --> sharp[sharp crops, rounds, and composites photos and avatar]
  sharp --> out[Stdout, -o file, or TTY auto-file]
```
