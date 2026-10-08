---
name: xpostplate
description: Render or fabricate an X/Twitter post as a PNG that looks like x.com (opened post by default; also timeline row, quote, or bordered broadcast plate). Deterministic and self-contained, so one shell command is cheaper than generating, describing, or screenshotting an image. Trigger when the user wants a post image, PNG of a tweet/X post, fabricate a fake post image, or pipe a post card in a shell/agent workflow.
---

# xpostplate

CLI that draws a public X post, or one you invent, as a PNG.

## Why use it instead of making the image yourself

- Deterministic: the same input (post data, flags, machine) gives the same PNG, byte for byte. Rerun it freely; the output can be cached or compared.
- Cheaper: one shell command. Do not generate an image, describe the post as a picture, open a browser, or screenshot x.com. Check the `wrote <path> (WxH)` line on stderr instead of viewing the image unless you need to look.
- Self-contained: the post is built as SVG in-process and rasterized by resvg (sharp for photos and the avatar). No headless browser, no ImageMagick. The only network calls fetch the post, its photos, and its avatar; `--fixture` and `--fabricate` are offline.
- For a stable image from `--fabricate`, pass `--posted <iso>`; otherwise it stamps the current time. `--view timeline` and `--view quote` show relative time (`13h`) until a post is a week old, and live counts change when the post's counts change.

## Prerequisites

- Node 20.9+ (no ImageMagick or other system packages; rendering uses npm packages with prebuilt binaries)
- Optional `X_BEARER_TOKEN` for API counts the public syndication feed lacks (reposts, quotes, bookmarks, views)

## Install

```bash
npm i -g xpostplate
```

Or from a clone (install the npm dependencies first):

```bash
npm install
node bin/xpostplate.js --help
```

This skill ships at `skills/xpostplate/` in the repo and in the npm package (`files` includes `skills`). After `npm install` / `npm i -g xpostplate`, harnesses that scan `node_modules/**/skills/*/SKILL.md` (skills-npm, askill, and similar) can activate it. For agents that only watch a skills directory, copy or symlink this folder into `.agents/skills/`, `.claude/skills/`, `.cursor/skills/`, or the equivalent.

## Defaults

- Bare `xpostplate <url>` = the opened post as x.com shows it (`--view detail`, photos on, light theme, no border, no X mark): real avatar (initials fallback), verified check from post data, blue @mentions/links, `time · date · views`, action bar with known counts
- The media `t.co` link is dropped from the body when its photo is drawn
- Emoji render in color in every view and theme (bundled Twemoji, CC-BY 4.0; no emoji font, no network), including `--fabricate --text`; ZWJ families, skin tones, flags, and keycaps stay whole. Symbols the text font has (© ™) stay text
- Old primitive plate: `--view plate --no-media` (near-black border + X mark + initials); add `--accent '#1D9BF0'` for the old blue border
- PNG on stdout when piped/redirected; on a TTY with no `-o`, writes `{handle}-{YYYYMMDD-HHMMSS}.png` in cwd (`x-…` if fabricate/missing handle)
- Prefer `-o path.png` when you need a specific path
- Prefer `--json` when you only need post data
- Public URLs work with no token via syndication
- Do not invent missing counts as zeros; leave them unset so they stay off the image

## Flags you need

| Flag | Notes |
|------|--------|
| `--view detail\|timeline\|quote\|plate` | Shape. Default `detail` (opened post) |
| `--fabricate` | Offline invent; requires `--text` |
| `--media` / `--no-media` | Photos under the text, on by default; `--no-media` = text only, media link kept |
| `--mark` / `--no-mark` | X mark; on for plate, off for other views |
| `--border`, `--accent`, `--radius`, `--mark-corner` | Plate frame; accent defaults to near-black |
| `--theme light\|dark` | Default `light` |
| `--name`, `--handle`, `--text` | Overrides; `--text` required with `--fabricate` |
| `--replies`, `--reposts`, `--quotes`, `--likes`, `--bookmarks`, `--views` | Count overrides; a set zero is real |
| `-o`, `--output <path>` | Write PNG to a file (`-` = stdout; skips TTY auto-file) |
| `--json` | Post JSON on stdout; skip the image |
| `--fixture [path]` | Local JSON instead of the network |

Full list: `xpostplate --help`.

## Patterns

```bash
# Pipe PNG (faithful opened post, photos included)
xpostplate https://x.com/SpaceX/status/[slug] > post.png

# Old broadcast plate, text only
xpostplate https://x.com/SpaceX/status/[slug] --view plate --no-media -o plate.png

# Write a file
xpostplate https://x.com/SpaceX/status/[slug] --view timeline --theme dark -o timeline.png

# Data only, then decide
xpostplate https://x.com/SpaceX/status/[slug] --json

# Offline fabricate
xpostplate --fabricate --name "SpaceX" --handle SpaceX --text "Starship is stacked." --view timeline -o fake.png

# Offline fabricate with color emoji
xpostplate --fabricate --name "Jaye" --handle jspeaks --text "Shipped 🚀 👨‍👩‍👧‍👦 👋🏽 🇺🇸" -o emoji.png

# Local fixture
xpostplate --fixture
```

Do not invent real status ids in examples. Use the project's placeholder style (`https://x.com/SpaceX/status/[slug]`), `--fabricate`, or `--fixture`.
