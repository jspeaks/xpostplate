# FAB

Features, advantages, and benefits of xpostplate.

## Features

- Turns an X post URL or status id into a PNG.
- Four views with `--view`: `plate` (the default bordered card), `timeline` (a home-feed row), `detail` (the opened post), and `quote` (a nested post).
- Light or dark with `--theme`. Photos drawn under the text with `--media`.
- A public post loads with no bearer token, from X's syndication feed.
- `--fabricate` invents a post from `--text` with no URL and no network.
- `--name`, `--handle`, `--text`, `--verified`, `--posted`, and the count flags override a fabricated post or a real one.
- PNG bytes go to stdout unless `-o` names a file. `--json` prints the post and skips the image.
- Ships an Agent Skills `SKILL.md` with the CLI.

## Advantages

- Drawn from the post's data, not cropped from a screenshot, so every image has the same clean layout and type.
- No API key for a public post. Leave `X_BEARER_TOKEN` unset and it still loads.
- Honest counts. A count the source does not carry stays off the image instead of becoming a fake zero. A count you pass, including zero, is shown.
- Built for pipes. PNG on stdout, logs on stderr, one command per image, so it chains in shell scripts and agent tool calls.
- `--fabricate` and `--fixture` run with no network.
- `--max-height` drops photos before body lines and never clips the header or the footer.

## Benefits

- Put a post on screen for a broadcast, a video, slides, or an article in one command.
- Mock up a post before it exists, or rewrite one for a draft, without editing pixels.
- Let a script or an agent make post images in batch, with no account setup and no manual cleanup.
- Trust what the image shows. Nothing appears that the post did not have, unless you set it.

Architecture lives in [architecture.md](architecture.md).
