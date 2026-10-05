# FAB

Features, advantages, and benefits of xpostplate. One row per feature.

| Feature | Advantage | Benefit |
| --- | --- | --- |
| Turns an X post URL or status id into a PNG. | Drawn from the post’s data, not cropped from a screenshot. | Every image has the same clean layout and type, with no pixel editing. |
| Four views with `--view`: `plate`, `timeline`, `detail`, `quote`. | One tool covers every shape a post takes on X. | Pick the shape that fits a broadcast, a slide, a video, or an article. |
| `--theme light\|dark` and `--media` for photos. | Matches the surface the image lands on. | Drops into light or dark decks and lower thirds without touch-ups. |
| Loads a public post with no bearer token, from X’s syndication feed. | No API key. Leave `X_BEARER_TOKEN` unset and it still works. | No account setup and no API approval before the first image. |
| Counts come only from the source or from you. | A count the source lacks stays off the image; a count you pass, even zero, is shown. | Trust what the image shows. Nothing appears that the post did not have, unless you set it. |
| `--fabricate` plus `--name`, `--handle`, `--text`, `--verified`, `--posted`, and count flags. | Invent a post, or override any field of a real one. | Mock up a post before it exists, or rewrite one for a draft. |
| PNG on stdout when piped, TTY auto-file `{handle}-{YYYYMMDD-HHMMSS}.png`, `-o` for a path, `--json` for data. | Built for pipes and a clean terminal default. | Scripts and agents make post images in batch with no manual cleanup. |
| `--fabricate` and `--fixture` run offline. | No network needed. | Runs in CI, in tests, and on a plane. |
| `--max-height` caps the image height. | Drops photos before body lines and never clips the header or footer. | Fits a fixed slot without a broken card. |
| Ships an Agent Skills `SKILL.md` with the CLI. | Agent harnesses find it after `npm i -g xpostplate`. | An agent can make post images without being taught the flags. |

Architecture lives in [architecture.md](architecture.md).
