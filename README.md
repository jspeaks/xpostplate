# xpostplate

Local CLI that turns an X post URL or status id into a broadcast-style PNG plate.

With `X_BEARER_TOKEN` set, it loads the post as JSON from the X API v2 (`GET https://api.x.com/2/tweets/:id`, the same resource as `api.twitter.com`). Without a token, a public post is loaded from X's syndication endpoint. It then draws an SVG card and converts it with ImageMagick. It does not open a browser. Photos stay off unless you pass `--media`.

PNG bytes go to stdout and logs go to stderr, so an agent can pipe the image. `--json` prints the post and skips the image.

## Install

Node 20 or newer, and ImageMagick's `magick` on `PATH` (on this Mac: `/opt/homebrew/bin/magick`).

```bash
cd /Users/jspeaks/dev/xpostplate
chmod +x bin/xpostplate.js
npm link
```

`npm link` is optional. Without it, call `bin/xpostplate.js` directly or add `bin/` to `PATH`.

A bearer token is optional. The CLI reads `X_BEARER_TOKEN` only and does not look in the macOS keychain. Without it, public posts are fetched from X's syndication endpoint, and reposts, quotes, bookmarks, and views are omitted. Protected or deleted posts fail. Set the token when you want the API v2 payload, including full `public_metrics`.

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

`--fixture` renders a checked-in fake post and does not call the network, even if a token is set, and it does not fetch photos. Pass a path to use another JSON file in the API v2 shape (`data` plus `includes.users`).

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
| `--max-height <px>` | none | Cap height from 120 to 8192. Shrink or drop photos before body lines, then truncate the body from the end with an ellipsis. Header, footer, and border stay intact |
| `--media` | off | Draw post photos under the text and above the footer. A post with no still gets no empty box |
| `--mark` / `--no-mark` | show mark | Official X glyph in a corner. `--no-mark` removes it and leaves no gap. Last of the two flags wins |
| `--mark-corner tl\|tr\|bl\|br` | `tr` | Corner for the X mark |
| `-o`, `--output <path>` | stdout | File path, or `-` for stdout |
| `--json` | off | Print normalized post JSON to stdout and skip the image |
| `--fixture [path]` | off | Local JSON instead of the API |

`text` mode draws the author name, `@handle`, post text, and timestamp, and no metrics. `full` adds replies, reposts, quotes, likes, bookmarks, and views. `--metrics` overrides that preset, including a subset while `--mode text`. `--no-time` removes the timestamp line and the gap under the body. `--max-height` keeps the header and whatever footer is enabled. With `--media`, the photo block shrinks and then drops before any body line is removed. Body lines then drop from the end, with `…` on the last visible body line when any were dropped. If the header and footer alone are taller than the cap, the command exits 1 instead of clipping them or the border.

When a token is set, the live request asks for `tweet.fields=text,created_at,public_metrics,attachments`, `expansions=author_id,attachments.media_keys`, `user.fields=name,username,profile_image_url`, and `media.fields=url,preview_image_url,type,width,height`. Without a token, likes and replies come from the syndication feed, which also carries photo URLs. Reposts, quotes, bookmarks, and views are left unset and are not drawn, including with `--mode full` or `--metrics`. A count of zero still renders. The avatar stays initials from the display name; the profile image URL is kept on the JSON and is not downloaded. Photo URLs are kept on the normalized post either way. They are fetched and drawn under the text only with `--media`. Video is not played; a preview still is used when the payload has one. No still means no photo block.
