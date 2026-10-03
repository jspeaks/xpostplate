# FAB

## Features

xpostplate turns an X post into a PNG. `--view` selects `plate` (the default bordered card), `timeline` (a home-feed row), `detail` (the opened post), or `quote` (a nested post). A public URL loads with no bearer token. `--fabricate` invents a post from `--text` with no URL and no network. `--name`, `--handle`, `--text`, `--verified`, `--no-verified`, `--posted`, and the count flags `--replies`, `--reposts`, `--quotes`, `--likes`, `--bookmarks`, and `--views` override a fabricated post or a real one. Photos are drawn only with `--media`. PNG bytes go to stdout unless `-o` names a file. `--json` prints the post and skips the image.

## Architecture

`bin/xpostplate.js` parses flags in `lib/args.js`. A URL is fetched from the X API when `X_BEARER_TOKEN` is set, and from X's syndication feed when it is not. `--fixture` reads a local JSON file instead. `--fabricate` builds the post from `--text` and the override flags. Fetched and fixture posts then pass through the same overrides. `lib/svg.js` draws the chosen view. ImageMagick turns that SVG into a PNG, and composites photo files when `--media` reserved boxes for them.

## Behavior

Counts the source does not have stay off the image. A count you pass, including zero, is shown. On `detail`, views are omitted when the count is null. `--max-height` drops photos before body lines and does not clip the header or the footer. The avatar is initials in every view. `--fabricate` requires `--text`, and it refuses a URL or a fixture. `--version` prints the version in `package.json`.
