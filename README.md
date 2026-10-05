# xpostplate

A public X post, or one you fabricate and override, drawn as a PNG for the timeline, the opened post, a quote, or a broadcast plate.

`xpostplate` takes a post URL or status id and writes a picture. Leave `X_BEARER_TOKEN` unset and a public post still loads, from X's syndication feed, with no key and no keychain. Counts that feed does not carry stay off the image instead of turning into fake zeros. PNG bytes go to stdout and logs go to stderr, so you can pipe the file or pass `-o`.

`--view` picks the shape:

- `plate`, the default, is the bordered broadcast card: initials, name over handle, the X glyph, and a written timestamp.
- `timeline` is the home-feed row: name, a check when the account is verified, handle, a relative time like `13h`, and icon counts instead of words.
- `detail` is the opened post: full name and handle, the word X.com, and a clock time like `4:36 PM · 10/2/26`, plus views when that count is known.
- `quote` is the nested post: inset, a hairline border, smaller type, no action bar.

Photos stay off unless you pass `--media`. `--max-height` drops photos before it drops body lines, and it does not clip the header or the footer. The avatar is initials in every view.

`--fabricate` invents a post from `--text` with no URL and no network. `--name`, `--handle`, `--text`, `--verified`, `--posted`, and the count flags override that post or a real one. A count you set is real, even when it is zero. A count you leave unset stays hidden when the source never had it.

## Install

ImageMagick `magick` is required and is not bundled. It must be on `PATH`.

Node 18 or newer. From a clone of this repo:

```bash
node bin/xpostplate.js --help
```

The npm package is not published yet. When it is, this is the install:

```bash
npm install -g xpostplate
```

`brew install` is blocked. `xpostplate` is not in homebrew-core and there is no tap. `packaging/homebrew/xpostplate.rb` is a head-only formula that depends on `node` and `imagemagick` and installs the CLI from this git repo. A stable archive URL and sha256 land on the first GitHub release.

```bash
# Broadcast plate. No token. PNG on stdout. Photos stay off.
xpostplate https://x.com/SpaceX/status/21…47 > plate.png

# Home-feed row, dark, with the photos.
xpostplate https://x.com/SpaceX/status/21…47 --view timeline --theme dark --media -o timeline.png

# The opened post.
xpostplate https://x.com/SpaceX/status/21…47 --view detail --theme dark -o detail.png

# The same post as a quote.
xpostplate https://x.com/SpaceX/status/21…47 --view quote -o quote.png

# Invent a post. No URL and no network.
xpostplate --fabricate --name "SpaceX" --handle SpaceX --text "Starship is stacked." --view timeline

# Start from a public post and replace the words.
xpostplate https://x.com/SpaceX/status/21…47 --text "A line written for the plate."
```

## Agent skill

Open [Agent Skills](https://agentskills.io) skill at `skills/xpostplate/SKILL.md`. It ships with the npm package (`files` includes `skills`), so after `npm install` / `npm i -g xpostplate`, harnesses that scan `node_modules/**/skills/*/SKILL.md` (skills-npm, askill, and similar) can activate it. For agents that only watch a skills directory, copy or symlink that folder into `.agents/skills/`, `.claude/skills/`, `.cursor/skills/`, or the equivalent.

`xpostplate --help` lists every flag.
