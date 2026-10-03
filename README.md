# xpostplate

A public X post, drawn as a PNG for the timeline, the opened post, a quote, or a broadcast plate.

`xpostplate` takes a post URL or status id and writes a picture. Leave `X_BEARER_TOKEN` unset and a public post still loads, from X's syndication feed, with no key and no keychain. Counts that feed does not carry stay off the image instead of turning into fake zeros. PNG bytes go to stdout and logs go to stderr, so you can pipe the file or pass `-o`.

`--view` picks the shape:

- `plate`, the default, is the bordered broadcast card: initials, name over handle, the X glyph, and a written timestamp.
- `timeline` is the home-feed row: name, a check when the account is verified, handle, a relative time like `13h`, and icon counts instead of words.
- `detail` is the opened post: full name and handle, the word X.com, and a clock time like `4:36 PM · 10/2/26`, plus views when that count is known.
- `quote` is the nested post: inset, a hairline border, smaller type, no action bar.

Photos stay off unless you pass `--media`. `--max-height` drops photos before it drops body lines, and it does not clip the header or the footer. The avatar is initials in every view.

Node 20 or newer, and ImageMagick `magick` on `PATH`. Run `bin/xpostplate.js` from this repo, or `npm link` if you want `xpostplate` on `PATH`.

```bash
# Broadcast plate. No token. PNG on stdout. Photos stay off.
xpostplate https://x.com/SpaceX/status/21…47 > plate.png

# Home-feed row, dark, with the photos.
xpostplate https://x.com/SpaceX/status/21…47 --view timeline --theme dark --media -o timeline.png

# The opened post.
xpostplate https://x.com/SpaceX/status/21…47 --view detail --theme dark -o detail.png

# The same post as a quote.
xpostplate https://x.com/SpaceX/status/21…47 --view quote -o quote.png

# Shorter card. Extra lines drop from the end.
xpostplate https://x.com/SpaceX/status/21…47 --max-height 420
```

`xpostplate --help` lists every flag.
