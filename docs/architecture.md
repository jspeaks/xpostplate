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
  made --> view[Choose plate, timeline, detail, or quote]
  overrides --> view
  view --> svg[Render SVG]
  svg --> magick[ImageMagick to PNG]
  magick --> out[Stdout or -o file]
```
