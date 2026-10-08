# FAB

Features, advantages, and benefits of xpostplate.

| Feature | Advantage | Benefit |
| --- | --- | --- |
| Turns an X post into a PNG for documents, messages, agentic workflows, and more. | Reuse a post as a portable image wherever a screenshot would go. | A clean card ready for docs, chat, decks, and pipelines. |
| Deterministic: the same input renders the same PNG, byte for byte (same post data, flags, and machine). | An agent runs one shell command instead of generating, describing, or screenshotting an image; reruns match. | Fewer tokens per image, and output you can cache, diff, and test. |
| Encapsulated vector pipeline: the post is built as SVG in-process (`lib/svg.js`), rasterized by resvg, with sharp compositing photos and the avatar. | No headless browser, no screenshot, no ImageMagick, no font or emoji downloads. The only network calls fetch the post, its photos, and its avatar. | One npm or Homebrew install that works on a laptop, a CI runner, or an agent's sandbox. |
| Bare `xpostplate <url>` draws the opened post as x.com shows it: real avatar, verified check, blue mentions, photos, time · date · views. | No flags to look right; counts the source lacks stay off. | A post image that reads like the post, not a mockup. |
| Four views: `detail` (default), `timeline`, `quote`, and `plate` (`--view`). | One tool adapts to the different formats a post can take. | Pick the layout that fits how you want the post to read: broadcast, slide, article, and more. |
| `--theme light\|dark`, photos on by default, `--no-media` for text only, and `--view plate` for the bordered card. | Matches the surface the image lands on. | Drops into light or dark decks and lower thirds without touch-ups. |
| Emoji draw in color in every view and theme: ZWJ families, skin tones, flags, keycaps (bundled Twemoji, CC-BY 4.0). | No emoji font, no network, no blank gaps; wrapping counts each emoji at its drawn width. | Posts keep their tone, 🚀 and 🇺🇬 included, exactly where the author put them. |
| Loads public posts from X’s feed. | Works from a public URL without setup. | First plate from a link, not an API account. |
| Counts can be modified for adaptation. | Tune likes, replies, and views to fit the story. | Adapt a post for a mock, a draft, or a cleaner card. |
| `--fabricate` and `--fixture` invent posts from flags (`--name`, `--handle`, `--text`, …) or JSON. | Invent a post from imagination, or reshape one you already have. | Sketch a post that does not exist yet, without waiting on a live URL. |
| PNG defaults to a file; stdout when piped; logs also supported. | Terminal-friendly by default, and pipeable when you need it. | Save a plate, or stream it into the next tool. |
| `--max-height` caps the image height. | Drops photos before body lines and never clips the header or footer. | Fits a fixed slot without a broken card. |
| Ships an Agent Skills `SKILL.md` with the CLI. | The skill is included with the CLI. | An agent can plate a post without a separate teach-in. |
| `--json` prints the post as JSON and skips the image. | An agent can read the text, author, and counts before it draws anything. | Data and picture from one tool, one command each. |

Architecture lives in [architecture.md](architecture.md).
