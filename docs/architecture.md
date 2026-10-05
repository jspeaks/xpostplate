# Architecture

Args choose a source, overrides change the post, the view picks a drawing, and ImageMagick writes the PNG.

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
  images --> svg[Render SVG]
  svg --> magick[ImageMagick to PNG, composite photos and avatar]
  magick --> out[Stdout, -o file, or TTY auto-file]
```
