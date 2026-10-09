# xpostplate

Turn an X post into a PNG from the command line.

[![npm version](https://img.shields.io/npm/v/xpostplate)](https://www.npmjs.com/package/xpostplate)
[![npm downloads](https://img.shields.io/npm/dw/xpostplate)](https://www.npmjs.com/package/xpostplate)
[![license](https://img.shields.io/github/license/jspeaks/xpostplate)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/jspeaks/xpostplate?style=flat)](https://github.com/jspeaks/xpostplate/stargazers)
[![CLI](https://img.shields.io/badge/interface-CLI-000000)](#quick-start)

<p align="center">
  <img src="assets/demo.gif" width="800" alt="Terminal demo: xpostplate https://x.com/SpaceX/status/2106090316747207047 > post.png prints PNG 506868 bytes (800x684) to stderr, chafa previews post.png in the terminal, then the real PNG fades in">
</p>

<p align="center">
  <img src="docs/media/readme-hero.png" width="600" alt="The PNG xpostplate wrote for the SpaceX Starlink V3 post: avatar, gold check, text, four photos, time and date, and the action bar, as on x.com">
</p>

## Quick start

```bash
brew install jspeaks/xpostplate/xpostplate        # or: npm i -g xpostplate
xpostplate https://x.com/SpaceX/status/2106090316747207047 > post.png
npx skills add jspeaks/xpostplate                 # optional: the agent skill
```

No API key needed for public posts. `xpostplate --help` lists every flag.

## Why

Tweet-to-image tools have mostly been web apps: paste a link, click, download. xpostplate is a command.

- **CLI and chainable.** PNG on stdout when piped, logs on stderr. `--fabricate` and `--fixture` render offline, with no URL.
- **Deterministic.** The same input renders the same PNG, byte for byte, so an agent can shell out instead of spending tokens generating, describing, or screenshotting an image, and cache or diff the result.
- **Self-contained vector render.** Built as SVG in-process and rasterized by resvg; sharp composites photos and the avatar. No headless browser, no screenshot, no ImageMagick.
- **Crisp at any size.** `--scale 3` draws the same layout with three times the pixels, vector-sharp, for print, 4K video, and retina.
- **Agent skill.** Ships an Agent Skills `SKILL.md`; `--json` returns the post data without an image.
- **Faithful.** The default view matches the opened post on x.com, not a generic card.

Deterministic means the same post data, flags, fonts, and package versions give the same bytes. A live post renders identically until its data changes (a new like count or avatar). Timeline and quote views show relative time (`13h`) until a post is a week old, `--fabricate` without `--posted` stamps the current time, and macOS (Arial) and Linux (DejaVu or Liberation) draw text with different fonts.

Since 1.0.0 the command-line interface (flags, defaults, stdout and stderr behavior) is stable and follows semver: a breaking change means a new major version.

## How it works

`xpostplate` takes a post URL or status id and writes a picture. Leave `X_BEARER_TOKEN` unset and a public post still loads, from X's syndication feed, with no key and no keychain. Counts that feed does not carry stay off the image instead of turning into fake zeros. PNG bytes go to stdout when you pipe or redirect; on a TTY with no `-o`, the file is `{handle}-{YYYYMMDD-HHMMSS}.png` in the cwd (local time; `x-…` if fabricate or the handle is missing). Logs go to stderr. Pass `-o` for an explicit path.

Bare `xpostplate <url>` aims to match the opened post on x.com: light theme, no border, no X mark, the real avatar (initials only when there is no avatar URL or it fails to load), the verified check when the post data says verified (blue, gold for organizations, gray for government), blue @mentions, #hashtags, $cashtags, and links (t.co links show their display URL), the photos under the text, a `time · date · views` line, and an action bar with the counts the source has. The media `t.co` link leaves the body when its photo is drawn.

Emoji draw in color in every view and both themes, including `--fabricate --text`: ZWJ families (👨‍👩‍👧‍👦), skin tones (👋🏽), flags (🇺🇬), keycaps (1️⃣), and plain emoji. Each one is a [Twemoji](https://github.com/jdecked/twemoji) graphic bundled in the package and inlined into the SVG, so a render needs no emoji font and no network. Wrapping counts each emoji at the width x.com draws it (1.2em plus a small margin). Symbols your text font already has, like © and ™, stay text.

`--view` picks the shape:

<p align="center"><img src="docs/media/readme-views.png" width="800" alt="The same SpaceX post in three views: detail (light), timeline (dark), and the bordered plate"></p>

- `detail`, the default, is the opened post: avatar, name and check over handle, body, photos, `10:52 AM · Aug 27, 2026 · 1.2K Views` (views only when that count is known), and the action bar. `--metrics none` hides the bar.
- `timeline` is the home-feed row: name, check, handle, a relative time like `13h`, and icon counts.
- `quote` is the nested post: inset, a gray hairline border, smaller type, no action bar.
- `plate` is the bordered broadcast card: initials, name over handle, the X glyph, and a written timestamp. Its border and initials are near-black by default; `--accent '#1D9BF0'` brings back Twitter blue.

Photos are on by default. `--no-media` turns them off and keeps the media link in the text. `--max-height` shrinks or drops photos before it drops body lines, and it does not clip the header or the footer. The X mark is on for `plate` and off for the other views unless you pass `--mark`. `--border`, `--accent`, `--radius`, `--mark-corner`, and `--mode` style the plate.

The old default, the primitive broadcast plate, is one flag pair away:

```bash
xpostplate https://x.com/SpaceX/status/[slug] --view plate --no-media                     # near-black border
xpostplate https://x.com/SpaceX/status/[slug] --view plate --no-media --accent '#1D9BF0'  # the old blue border
```

`--theme dark` is today's x.com dark mode (true black, gray hairlines).

`--fabricate` invents a post from `--text` with no URL and no network. `--name`, `--handle`, `--text`, `--verified`, `--posted`, and the count flags override that post or a real one. A count you set is real, even when it is zero. A count you leave unset stays hidden when the source never had it.

### Width vs scale

`--width` is layout: how wide the post is laid out, in pixels (200–4096, default 800). Text keeps its size, so a wider layout means longer lines and a shorter card. `--scale` is pixel density: the same layout drawn with more (or fewer) pixels, 0.5–8, decimals allowed, default 1. `--width 600 --scale 3` looks exactly like `--width 600` but writes an 1800px-wide PNG; `--width 1800` would instead lay out longer lines of the same-size text.

Width = layout, scale = pixel density. Because the post is a vector render, scale is not an upscaled bitmap: text, icons, the check, and emoji are rasterized at the target size and stay crisp for print, 4K video, and retina screens. Photos are resampled once, from the largest size X serves that covers the output (1200, 2048, or up to 4096px); the avatar comes from X's largest profile size (400x400, smaller for some accounts), so at high scales it is the one element that can be upscaled. `--max-height` is in layout pixels, before scale. Each output side is capped at 16384px, with a clear error past that. `--scale 1` is byte-identical to leaving it off.

## Install

```bash
npm i -g xpostplate                          # npm
brew install jspeaks/xpostplate/xpostplate   # Homebrew
pnpm add -g xpostplate                       # pnpm
bun add -g xpostplate                        # Bun
npx xpostplate --help                        # run once, no install
npx skills add jspeaks/xpostplate            # just the agent skill, into your agent's skills folder
```

Homebrew installs the latest tagged release from the `jspeaks/xpostplate` tap. For bleeding edge from `main`, add `--HEAD`: `brew install --HEAD jspeaks/xpostplate/xpostplate`.

From source: `git clone https://github.com/jspeaks/xpostplate && cd xpostplate && npm install && npm link`.

## Examples

```bash
# The opened post, as x.com shows it, photos included. No token. Redirect, or omit -o on a TTY.
xpostplate https://x.com/SpaceX/status/[slug] > post.png

# Same, text only, dark.
xpostplate https://x.com/SpaceX/status/[slug] --no-media --theme dark -o post-dark.png

# Home-feed row.
xpostplate https://x.com/SpaceX/status/[slug] --view timeline -o timeline.png

# The bordered broadcast plate, without photos.
xpostplate https://x.com/SpaceX/status/[slug] --view plate --no-media -o plate.png

# The same post as a quote.
xpostplate https://x.com/SpaceX/status/[slug] --view quote -o quote.png

# Same layout as --width 600, three times the pixels (1800px wide): print, 4K video, retina.
xpostplate https://x.com/SpaceX/status/[slug] --width 600 --scale 3 -o post@3x.png

# Invent a post. No URL and no network.
xpostplate --fabricate --name "SpaceX" --handle SpaceX --text "Starship is stacked." --view timeline

# Emoji in color, offline: family, skin tone, flag, keycap.
xpostplate --fabricate --name "Jaye" --handle jspeaks --text "Shipped 🚀 👨‍👩‍👧‍👦 👋🏽 🇺🇸 1️⃣"

# Start from a public post and replace the words.
xpostplate https://x.com/SpaceX/status/[slug] --text "A line written for the image."
```

## Post JSON (`--json`, `--fixture`, fabricate shape)

`--json` prints this shaped post. `--fixture` accepts the same flat shape, or the X API envelope (`data` + `includes.users`) like `fixtures/sample-post.json`. Counts may be numbers or `null` (hidden). `entities` and `display_text_range` are optional; they let the faithful views show link display URLs, drop the media link, and trim leading reply mentions. Fixtures never fetch photos or avatars.

```json
{
  "id": "1000000000000000001",
  "text": "Body text.",
  "created_at": "2026-10-02T18:30:00.000Z",
  "public_metrics": {
    "reply_count": 3,
    "retweet_count": 12,
    "quote_count": 1,
    "like_count": 48,
    "bookmark_count": 5,
    "impression_count": 1200
  },
  "author": {
    "id": "9001",
    "name": "Sample Author",
    "username": "sample_author",
    "profile_image_url": "https://example.invalid/avatar.png",
    "verified": false,
    "verified_type": null,
    "profile_image_shape": "circle"
  },
  "photos": ["https://example.invalid/photo.jpg"],
  "entities": {
    "urls": [{ "url": "https://t.co/abc", "display_url": "example.com/page", "expanded_url": "https://example.com/page" }],
    "media": [{ "url": "https://t.co/def", "display_url": "pic.x.com/def", "expanded_url": "https://x.com/sample_author/status/1000000000000000001/photo/1" }]
  },
  "display_text_range": [0, 10]
}
```

## Requirements

Node 20.9 or newer. Nothing else: no ImageMagick. Rendering uses npm packages that ship prebuilt binaries ([`@resvg/resvg-js`](https://github.com/thx/resvg-js) rasterizes the SVG, [`sharp`](https://sharp.pixelplumbing.com) crops, rounds, and composites photos and the avatar), so `npm i -g xpostplate`, pnpm, Bun, and Homebrew all work with no system packages. Homebrew pulls in Node for you. Text uses Arial on macOS, or DejaVu Sans or Liberation Sans on Linux, loaded straight from those TrueType files (system font lookup is off). Emoji come from the bundled Twemoji set in `assets/emoji/` (4,009 graphics, one brotli file of about 0.95 MB, loaded only when a post has emoji), not from a system font. Since 0.9.26 `MAGICK_BIN` is ignored. `packaging/homebrew/xpostplate.rb` mirrors the formula the tap serves (stable release, with `--HEAD` for `main`).

## Agent skill

Open [Agent Skills](https://agentskills.io) skill at `skills/xpostplate/SKILL.md`. It ships with the npm package (`files` includes `skills`), so after `npm install` / `npm i -g xpostplate`, harnesses that scan `node_modules/**/skills/*/SKILL.md` (skills-npm, askill, and similar) can activate it. Homebrew installs the same skill at `$(brew --prefix)/opt/xpostplate/share/xpostplate/skills/xpostplate/SKILL.md`. For agents that only watch a skills directory, copy or symlink that folder into `.agents/skills/`, `.claude/skills/`, `.cursor/skills/`, or the equivalent, or let `npx skills add jspeaks/xpostplate` copy it there for the agents it detects.

## License

Code: MIT, see [LICENSE](LICENSE).

Emoji graphics: [Twemoji](https://github.com/jdecked/twemoji) v17.0.3, Copyright 2014–2021 Twitter, Inc and other contributors, and 2022–present Jason Sofonia & Justine De Caires and other contributors, licensed under [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/). The license text and the build notes ship in [`assets/emoji/`](assets/emoji) (`LICENSE-GRAPHICS`, `SOURCE.txt`); `scripts/build-emoji.mjs` rebuilds the bundle from the official SVGs.
