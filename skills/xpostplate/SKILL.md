---
name: xpostplate
description: Render or fabricate an X/Twitter post as a PNG (broadcast plate, timeline row, opened post, or quote). Trigger when the user wants a post image, PNG of a tweet/X post, fabricate a fake post image, or pipe a post card in a shell/agent workflow.
---

# xpostplate

CLI that draws a public X post, or one you invent, as a PNG.

## Prerequisites

- Node 18+
- ImageMagick `magick` on PATH
- Optional `X_BEARER_TOKEN` for API counts the public syndication feed lacks (reposts, quotes, bookmarks, views)

## Install

```bash
npm i -g xpostplate
```

Or from a clone:

```bash
node bin/xpostplate.js --help
```

This skill ships at `skills/xpostplate/` in the repo and in the npm package (`files` includes `skills`). After `npm install` / `npm i -g xpostplate`, harnesses that scan `node_modules/**/skills/*/SKILL.md` (skills-npm, askill, and similar) can activate it. For agents that only watch a skills directory, copy or symlink this folder into `.agents/skills/`, `.claude/skills/`, `.cursor/skills/`, or the equivalent.

## Defaults

- PNG on stdout when piped/redirected; on a TTY with no `-o`, writes `{handle}-{YYYYMMDD-HHMMSS}.png` in cwd (`x-…` if fabricate/missing handle)
- Prefer `-o path.png` when you need a specific path
- Prefer `--json` when you only need post data
- Public URLs work with no token via syndication
- Do not invent missing counts as zeros; leave them unset so they stay off the image

## Flags you need

| Flag | Notes |
|------|--------|
| `--view plate\|timeline\|detail\|quote` | Shape. Default `plate` |
| `--fabricate` | Offline invent; requires `--text` |
| `--media` | Draw photos under the text (off by default) |
| `--theme light\|dark` | Default `light` |
| `--name`, `--handle`, `--text` | Overrides; `--text` required with `--fabricate` |
| `--replies`, `--reposts`, `--quotes`, `--likes`, `--bookmarks`, `--views` | Count overrides; a set zero is real |
| `-o`, `--output <path>` | Write PNG to a file (`-` = stdout; skips TTY auto-file) |
| `--json` | Post JSON on stdout; skip the image |
| `--fixture [path]` | Local JSON instead of the network |

Full list: `xpostplate --help`.

## Patterns

```bash
# Pipe PNG
xpostplate https://x.com/SpaceX/status/[slug] > plate.png

# Write a file
xpostplate https://x.com/SpaceX/status/[slug] --view timeline --theme dark -o timeline.png

# Data only, then decide
xpostplate https://x.com/SpaceX/status/[slug] --json

# Offline fabricate
xpostplate --fabricate --name "SpaceX" --handle SpaceX --text "Starship is stacked." --view timeline -o fake.png

# Local fixture
xpostplate --fixture
```

Do not invent real status ids in examples. Use the project's placeholder style (`https://x.com/SpaceX/status/[slug]`), `--fabricate`, or `--fixture`.
