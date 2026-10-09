# Launch

Status: Show HN posted 2026-10-08: https://news.ycombinator.com/item?id=50006685. X post published 2026-10-08 11:20 AM ET: https://x.com/jspeaks/status/2108216089788449185 (see below). Everything else still needs Jaye's explicit yes.

## Plan
1. Problem-first Show HN, Tue–Thu 8–10 AM ET. Lead with the pain, stay in the comments for 24–48 hours.
   - Title and first comment: see "Show HN draft" below.
   - URL: https://github.com/jspeaks/xpostplate
2. dev.to / Hashnode article, published ahead so it's indexed.
3. Seed r/commandline.
4. Reply in relevant X threads.
5. SEO for the pain ("X post to PNG"), not the name.
6. Product Hunt later.

## X angle (from Jaye)
"I'd been dormant on creating tools, but agentic opportunities give me a chance to publish my creativity and my ideas again."
Notepad & Megaphone drafts X posts in Jaye's voice.

## Positioning (updated 2026-10-08)
Past "tweet to image" Show HNs (2019–2021 web apps) got 2–6 points. Lead with what's different:
- CLI and chainable: `xpostplate <url> > post.png`, PNG on stdout when piped, logs on stderr.
- Agentic: ships an Agent Skills SKILL.md (npm package and Homebrew share dir), and `--json` returns post data without an image.
- Deterministic: same input, same PNG, byte for byte. An agent shells out instead of spending tokens generating, describing, or screenshotting an image; outputs can be cached or diffed.
- Encapsulated vector render (self-contained): the post is built as SVG in-process (lib/svg.js), rasterized by resvg, photos and avatar composited by sharp. No headless browser, no screenshot, no ImageMagick. One npm or brew install, no system packages. Emoji bundled (Twemoji). Network only to fetch the post, its photos, and its avatar.
- Offline: `--fabricate` and `--fixture` render with no URL and no network.
- Faithful: the default view matches the opened post on x.com, not a generic card.

What we can and can't claim (verified 2026-10-08 on 0.10.0):
- Byte-identical: the same fixture rendered twice gave identical PNGs in detail, timeline, plate (dark), and emoji renders on the Mac, and the default fixture matched itself on the Linux box. Two live renders of the SpaceX V3 post matched each other and the hero PNG rendered the night before (counts had not changed). TZ=UTC gave the same bytes as the default zone (times print in New York time).
- Varies: live posts change when their data changes (counts, avatar, photos); timeline and quote views show relative time until a post is a week old; `--fabricate` without `--posted` stamps the current time (two renders a minute apart differed).
- Fonts are NOT bundled: text uses system Arial (macOS) or DejaVu Sans / Liberation Sans (Linux), read straight from the TTF with system lookup off. Mac and Linux renders of the same fixture differ. Say "emoji bundled", not "fonts bundled"; say "same machine" when precision matters.
- No SVG output today: the CLI writes PNG only (open idea in discussion.md).

Reference posts: https://news.ycombinator.com/item?id=25983352, https://news.ycombinator.com/item?id=19336803, https://news.ycombinator.com/item?id=24322734

## Show HN draft
Posted 2026-10-08 11:02 AM ET by jspeaks: https://news.ycombinator.com/item?id=50006685
Text went in as the post body, shown under the title, with code blocks intact. Right after submission HN showed it as [flagged] and the API reports it dead, so it doesn't appear for logged-out readers. Not resubmitted.

Title: Show HN: X Post Plate – deterministic X post to PNG from the command line
URL: https://github.com/jspeaks/xpostplate

First comment (Jaye):

I kept needing a picture of an X post: in a doc, a deck, a chat message, and lately in reports my coding agents put together. The options were a screenshot (crop it, fix the theme, hide my own UI) or one of the tweet-to-image web apps, which want a browser and a person clicking.

xpostplate is a command instead:

    xpostplate https://x.com/<user>/status/<id> > post.png

Public posts load without an API key. The PNG goes to stdout when piped, so it chains with other tools.

Two things mattered to me for agents. It's deterministic: on a given machine, the same input gives the same PNG, byte for byte. An agent shells out once instead of spending tokens generating, describing, or screenshotting an image, and the result is safe to cache or diff. And the render is self-contained: the post is built as SVG in-process and rasterized with resvg, with sharp compositing the photos. No headless browser, no ImageMagick, and emoji are bundled. It ships an Agent Skills SKILL.md so agents can pick it up.

There are also timeline, quote, and bordered plate views, a dark theme, and --fabricate for posts that don't exist yet.

    brew install jspeaks/xpostplate/xpostplate
    npm i -g xpostplate

I'd like to hear where it breaks, which views you'd use, and whether SVG output would be worth adding.

## X post
Posted 2026-10-08 11:20 AM ET by @jspeaks: https://x.com/jspeaks/status/2108216089788449185
Text went in exactly as below. X turned the trailing link into a link card ("xpostplate · Turn an X post into a PNG", from code.jspeaks.com), so the URL doesn't show in the post text. One post, not a thread.

I'd been dormant on creating tools, but agentic opportunities give me a chance to publish my creativity and my ideas again. Here's one: xpostplate, a CLI that turns an X post into a PNG. Same input, same image, no browser, built for agents. https://code.jspeaks.com/xpostplate/

## dev.to article
Published 2026-10-09 11:51 AM ET by @jspeaks: https://dev.to/jspeaks/give-your-ai-agent-a-deterministic-way-to-turn-x-posts-into-images-20o6
Published from notes/devto-article.md exactly as written, with published: true. Tags: ai, cli, productivity, opensource. Cover: https://code.jspeaks.com/xpostplate/media/og.png
