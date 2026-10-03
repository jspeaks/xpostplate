# xpostplate

Local CLI that turns an X post URL or status id into a broadcast-style PNG plate.

It loads the post as JSON from the X API v2 (`GET https://api.x.com/2/tweets/:id`, the same resource as `api.twitter.com`), then draws an SVG card and converts it with ImageMagick. It does not open a browser and it does not scrape X.

PNG bytes go to stdout and logs go to stderr, so an agent can pipe the image. `--json` prints the post and skips the image.

## Install

Node 20 or newer, and ImageMagick's `magick` on `PATH` (on this Mac: `/opt/homebrew/bin/magick`).

```bash
cd /Users/jspeaks/dev/xpostplate
chmod +x bin/xpostplate.js
npm link
```

`npm link` is optional. Without it, call `bin/xpostplate.js` directly or add `bin/` to `PATH`.

Fetching a live post needs a bearer token in the environment. The CLI reads `X_BEARER_TOKEN` only. It does not look in the macOS keychain, and it will exit 1 if the variable is missing.

```bash
export X_BEARER_TOKEN="your-token"
```

## Pipe and file output

```bash
xpostplate https://x.com/example/status/1234567890123456789 > plate.png
xpostplate 1234567890123456789 -o plate.png
xpostplate 1234567890123456789 -o - >/tmp/plate.png
xpostplate 1234567890123456789 --json
```

`-o -` is stdout, which is also the default when `-o` is omitted.

## Offline fixture

`--fixture` renders a checked-in fake post and does not call the network, even if a token is set. Pass a path to use another JSON file in the API v2 shape (`data` plus `includes.users`).

```bash
xpostplate --fixture -o examples/plate-sample.png
xpostplate --fixture --theme dark --mode full -o plate-dark.png
xpostplate --fixture --json
```

## Options

| Flag | Default | What it does |
| --- | --- | --- |
| `--theme light\|dark` | `light` | Card colors |
| `--width <px>` | `800` | Plate width |
| `--radius <px>` | `24` | Corner radius |
| `--border <px>` | `4` | Accent border thickness |
| `--accent <hex>` | `#1D9BF0` | Border and avatar color |
| `--mode text\|full` | `text` | `text` draws author, body, and time. `full` also draws metrics, unless `--metrics` is set |
| `--time` / `--no-time` | show time | `--no-time` hides the timestamp and its gap. Last of the two flags wins |
| `--metrics <list>` | mode default | `all`, `none`, or a comma-separated subset: replies, reposts, quotes, likes, bookmarks, views. Overrides the mode default |
| `--max-height <px>` | none | Cap height from 120 to 8192. Truncate the body from the end with an ellipsis. Header, footer, and border stay intact |
| `-o`, `--output <path>` | stdout | File path, or `-` for stdout |
| `--json` | off | Print normalized post JSON to stdout and skip the image |
| `--fixture [path]` | off | Local JSON instead of the API |

`text` mode draws the author name, `@handle`, post text, and timestamp, and no metrics. `full` adds replies, reposts, quotes, likes, bookmarks, and views. `--metrics` overrides that preset, including a subset while `--mode text`. `--no-time` removes the timestamp line and the gap under the body. `--max-height` keeps the header and whatever footer is enabled, drops body lines from the end, and puts `…` on the last visible body line when any were dropped. If the header and footer alone are taller than the cap, the command exits 1 instead of clipping them or the border.

The live request asks for `tweet.fields=text,created_at,public_metrics`, `expansions=author_id`, and `user.fields=name,username,profile_image_url`. The plate itself is typographic: the avatar is initials from the display name, so the profile image URL is kept on the JSON and is not downloaded.
