---
title: Give your AI agent a deterministic way to turn X posts into images
published: false
description: xpostplate is a CLI that turns an X post URL into a PNG that looks like x.com. One command, no browser, the same bytes every time, sharp at any scale, and a SKILL.md your coding agent can pick up.
tags: ai, cli, productivity, opensource
cover_image: https://code.jspeaks.com/xpostplate/media/og.png
---

If you work with coding agents, you have probably watched one try to put an X post into a document. It opens a browser it may not have, takes a screenshot it can't crop well, or gives up and pastes the link.

I'd been dormant on creating tools for a while. Agentic work changed that: it gave me a chance to publish my creativity and my ideas again. This is one of them. xpostplate is a CLI that turns an X post into a PNG that looks like x.com, built so an agent (or you) can do it in one command and get the same result every time.

```bash
xpostplate https://x.com/SpaceX/status/[slug] > post.png
```

## What you get, and why it matters

**One shell command instead of a browser.** Public posts load without an API key. There is no headless browser, no screenshot, and no ImageMagick. For an agent, that means no browser automation to set up or babysit.

**Deterministic: same input, same PNG.** Byte for byte. I rendered the same post repeatedly and got identical SHA-256 hashes every time. That is what makes it belong in a skills library:

- The agent doesn't need to look at the result to trust it. It reads the `wrote <path> (WxH)` line on stderr and moves on instead of spending tokens viewing the image.
- Outputs can be cached. If the inputs haven't changed, the image hasn't either.
- Outputs can be diffed. A changed file means the post changed, not that the renderer drifted.
- It's far cheaper than having a model draw or describe an image, and the result is the real post, not an approximation.

**Fast.** An offline render takes about a quarter of a second, start to finish. A live post with four photos takes about a second, most of it spent fetching the post and its images.

**Faithful by default.** Bare `xpostplate <url>` matches the opened post on x.com: real avatar, verified check, blue mentions and links, photos, the time and date line, and the action bar. Counts the source doesn't carry stay off the image instead of showing up as fake zeros. Color emoji are bundled, so they render without an emoji font or a network call.

## Sharp at the resolution you need

The post is built as an SVG and rasterized at the end, so nothing is captured as pixels and then stretched. `--scale` (0.5 to 8) sets the pixel density, and `--width` sets the layout:

```bash
xpostplate https://x.com/SpaceX/status/[slug] --scale 3 > print.png
```

That gives a 2400-pixel-wide image of the same 800-pixel layout. Text, icons, and emoji are vectors, so they stay sharp at any scale, and photos are fetched from X at larger sizes to match. The SpaceX post with four photos at `--scale 3` came out 2400x2052 in about 2 seconds.

Use `--scale 2` for retina slides, `--scale 3` or higher for print, and `--scale 4` or 5 for a card that fills a 4K video frame. `--width` changes how the text wraps, `--scale` changes how many pixels you get, and the two don't interfere.

## Things you can do with it

**Documents and reports**
- Agent-written reports, Google Docs, Notion pages, and wikis with real post images instead of bare links that may rot or render as nothing.
- Newsletter images that look the same in every email client.
- Slide decks: a post as a clean card on a light or dark slide, sharp on a retina display.

**Video and broadcast**
- Lower thirds and b-roll for YouTube or news-style edits. `--view plate --theme dark --no-media` gives a bordered card that sits on footage, `--accent` matches your graphics, and `--scale` makes it hold up in 4K.

**Print**
- Printable cards, conference handouts, posters, or a framed print of a post that meant something to you.

**Planning and design**
- Preview a post before publishing: see how the wording, line breaks, and length land in the x.com layout.
- Product and pitch mockups: show what a launch post or a customer reaction could look like.
- UX prototypes and test fixtures for apps that display posts. `--fixture` renders a local JSON file with no network, so tests stay stable.

**Pipelines**
- CI jobs that regenerate a post image only when the post changes. Because output is deterministic, a byte comparison tells you whether anything changed:

```bash
xpostplate "$URL" > new.png
cmp -s new.png post.png || mv new.png post.png
```

- Snapshots of a post's text and counts at a moment in time, with `--json` for the data alongside the image.

## Fabricate: sketch a post that doesn't exist yet

`--fabricate` draws a post from flags, with no URL and no network:

```bash
xpostplate --fabricate \
  --name "Acme" --handle acme --verified \
  --text "Acme 2.0 is out today: offline mode, faster sync, and a new CLI." \
  --posted 2026-11-04T14:00:00Z --likes 1200 --replies 85 \
  -o launch-mock.png
```

It's for concept work: a launch-day mock for a pitch deck, a storyboard frame, a scene in a screenplay, teaching materials about how posts spread, or a draft you want a teammate to react to before it goes live. The same flags can override the text or counts of a real post. Label mockups as mockups; don't pass them off as real posts.

## Install and use

```bash
brew install jspeaks/xpostplate/xpostplate
# or
npm i -g xpostplate
```

It needs Node 20.9 or newer, and Homebrew pulls Node in for you. There are no system packages.

```bash
xpostplate https://x.com/SpaceX/status/[slug] > post.png               # the opened post
xpostplate https://x.com/SpaceX/status/[slug] --view timeline -o row.png
xpostplate https://x.com/SpaceX/status/[slug] --view quote --theme dark -o quote.png
xpostplate https://x.com/SpaceX/status/[slug] --json | jq -r .text     # data, no image
```

When piped, the PNG goes to stdout and logs go to stderr, so it chains with other tools. In a terminal without a redirect, it writes a named file instead.

## Give it to your agent

xpostplate ships an Agent Skills `SKILL.md` at `skills/xpostplate/SKILL.md`. It's in the npm package, so harnesses that scan `node_modules/**/skills/*/SKILL.md` can find it after install. Homebrew puts it under `$(brew --prefix)/opt/xpostplate/share/xpostplate/skills/xpostplate/SKILL.md`. If your agent only watches a skills folder, copy or symlink it into `.agents/skills/`, `.claude/skills/`, `.cursor/skills/`, or the equivalent. The skill tells the agent to prefer one shell command over drawing, describing, or screenshotting, and to use `--json` when it only needs the post's data.

## Try it

It's MIT licensed.

- Repo: https://github.com/jspeaks/xpostplate
- Docs, including every flag and the fine print: https://code.jspeaks.com/xpostplate/docs

This is v0.11.0. If you try it with your agents, I'd like to hear what you used it for, where it rendered something wrong, and whether SVG output would be worth adding.
