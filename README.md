# xpostplate

A public X post, or one you fabricate and override, drawn as a PNG for the timeline, the opened post, a quote, or a broadcast plate.

`xpostplate` takes a post URL or status id and writes a picture. Leave `X_BEARER_TOKEN` unset and a public post still loads, from X's syndication feed, with no key and no keychain. Counts that feed does not carry stay off the image instead of turning into fake zeros. PNG bytes go to stdout when you pipe or redirect; on a TTY with no `-o`, the file is `{handle}-{YYYYMMDD-HHMMSS}.png` in the cwd (local time; `x-…` if fabricate or the handle is missing). Logs go to stderr. Pass `-o` for an explicit path.

`--view` picks the shape:

- `plate`, the default, is the bordered broadcast card: initials, name over handle, the X glyph, and a written timestamp.
- `timeline` is the home-feed row: name, a check when the account is verified, handle, a relative time like `13h`, and icon counts instead of words.
- `detail` is the opened post: full name and handle, the word X.com, and a clock time like `4:36 PM · 10/2/26`, plus views when that count is known.
- `quote` is the nested post: inset, a hairline border, smaller type, no action bar.

Photos stay off unless you pass `--media`. `--max-height` drops photos before it drops body lines, and it does not clip the header or the footer. The avatar is initials in every view.

`--fabricate` invents a post from `--text` with no URL and no network. `--name`, `--handle`, `--text`, `--verified`, `--posted`, and the count flags override that post or a real one. A count you set is real, even when it is zero. A count you leave unset stays hidden when the source never had it.

## Install

```bash
npm i -g xpostplate                                          # npm
brew tap jspeaks/xpostplate && brew install --HEAD xpostplate  # Homebrew (HEAD)
pnpm add -g xpostplate                                       # pnpm
bun add -g xpostplate                                        # Bun
npx xpostplate --help                                        # run once, no install
```

Homebrew is HEAD-only from the tap until a GitHub release; stable non-HEAD install needs that release.

From source: `git clone https://github.com/jspeaks/xpostplate && cd xpostplate && npm link`.

## Examples

```bash
# Broadcast plate. No token. Photos stay off. Redirect, or omit -o on a TTY.
xpostplate https://x.com/SpaceX/status/[slug] > plate.png

# Home-feed row, dark, with the photos.
xpostplate https://x.com/SpaceX/status/[slug] --view timeline --theme dark --media -o timeline.png

# The opened post.
xpostplate https://x.com/SpaceX/status/[slug] --view detail --theme dark -o detail.png

# The same post as a quote.
xpostplate https://x.com/SpaceX/status/[slug] --view quote -o quote.png

# Invent a post. No URL and no network.
xpostplate --fabricate --name "SpaceX" --handle SpaceX --text "Starship is stacked." --view timeline

# Start from a public post and replace the words.
xpostplate https://x.com/SpaceX/status/[slug] --text "A line written for the plate."
```

## Post JSON (`--json`, `--fixture`, fabricate shape)

`--json` prints this shaped post. `--fixture` accepts the same flat shape, or the X API envelope (`data` + `includes.users`) like `fixtures/sample-post.json`. Counts may be numbers or `null` (hidden).

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
    "verified": false
  },
  "photos": ["https://example.invalid/photo.jpg"]
}
```

## Requirements

Homebrew (HEAD tap) pulls in Node and ImageMagick for you. With npm, pnpm, or Bun you need Node 18 or newer and ImageMagick (`magick`) on `PATH`: `brew install imagemagick` or `apt install imagemagick`. `packaging/homebrew/xpostplate.rb` is the HEAD formula the tap serves.

## Agent skill

Open [Agent Skills](https://agentskills.io) skill at `skills/xpostplate/SKILL.md`. It ships with the npm package (`files` includes `skills`), so after `npm install` / `npm i -g xpostplate`, harnesses that scan `node_modules/**/skills/*/SKILL.md` (skills-npm, askill, and similar) can activate it. For agents that only watch a skills directory, copy or symlink that folder into `.agents/skills/`, `.claude/skills/`, `.cursor/skills/`, or the equivalent.

`xpostplate --help` lists every flag.
