# xpostplate

A public X post, or one you fabricate and override, drawn as a PNG that looks like x.com: the opened post by default, or a timeline row, a quote, or a bordered broadcast plate.

`xpostplate` takes a post URL or status id and writes a picture. Leave `X_BEARER_TOKEN` unset and a public post still loads, from X's syndication feed, with no key and no keychain. Counts that feed does not carry stay off the image instead of turning into fake zeros. PNG bytes go to stdout when you pipe or redirect; on a TTY with no `-o`, the file is `{handle}-{YYYYMMDD-HHMMSS}.png` in the cwd (local time; `x-…` if fabricate or the handle is missing). Logs go to stderr. Pass `-o` for an explicit path.

Bare `xpostplate <url>` aims to match the opened post on x.com: light theme, no border, no X mark, the real avatar (initials only when there is no avatar URL or it fails to load), the verified check when the post data says verified (blue, gold for organizations, gray for government), blue @mentions, #hashtags, $cashtags, and links (t.co links show their display URL), the photos under the text, a `time · date · views` line, and an action bar with the counts the source has. The media `t.co` link leaves the body when its photo is drawn.

`--view` picks the shape:

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

## Install

```bash
npm i -g xpostplate                          # npm
brew install jspeaks/xpostplate/xpostplate   # Homebrew
pnpm add -g xpostplate                       # pnpm
bun add -g xpostplate                        # Bun
npx xpostplate --help                        # run once, no install
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

# Invent a post. No URL and no network.
xpostplate --fabricate --name "SpaceX" --handle SpaceX --text "Starship is stacked." --view timeline

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

Node 20.9 or newer. Nothing else: no ImageMagick. Rendering uses npm packages that ship prebuilt binaries ([`@resvg/resvg-js`](https://github.com/thx/resvg-js) rasterizes the SVG, [`sharp`](https://sharp.pixelplumbing.com) crops, rounds, and composites photos and the avatar), so `npm i -g xpostplate`, pnpm, Bun, and Homebrew all work with no system packages. Homebrew pulls in Node for you. Text uses Arial on macOS, or DejaVu Sans or Liberation Sans on Linux, loaded straight from those TrueType files (system font lookup is off). Since 0.9.26 `MAGICK_BIN` is ignored. `packaging/homebrew/xpostplate.rb` mirrors the formula the tap serves (stable release, with `--HEAD` for `main`).

## Agent skill

Open [Agent Skills](https://agentskills.io) skill at `skills/xpostplate/SKILL.md`. It ships with the npm package (`files` includes `skills`), so after `npm install` / `npm i -g xpostplate`, harnesses that scan `node_modules/**/skills/*/SKILL.md` (skills-npm, askill, and similar) can activate it. Homebrew installs the same skill at `$(brew --prefix)/opt/xpostplate/share/xpostplate/skills/xpostplate/SKILL.md`. For agents that only watch a skills directory, copy or symlink that folder into `.agents/skills/`, `.claude/skills/`, `.cursor/skills/`, or the equivalent.

`xpostplate --help` lists every flag.
