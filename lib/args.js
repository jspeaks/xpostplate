import { missingTokenMessage } from "./post.js";

const THEMES = new Set(["light", "dark"]);
const MODES = new Set(["text", "full"]);
const CORNERS = new Set(["tl", "tr", "bl", "br"]);
const VIEWS = new Set(["plate", "timeline", "detail", "quote"]);
const COUNT_FLAGS = {
  "--replies": "reply_count",
  "--reposts": "retweet_count",
  "--quotes": "quote_count",
  "--likes": "like_count",
  "--bookmarks": "bookmark_count",
  "--views": "impression_count",
};
const METRIC_ORDER = ["replies", "reposts", "quotes", "likes", "bookmarks", "views"];
const METRIC_NAMES = new Set(METRIC_ORDER);

export function helpText() {
  return `xpostplate — render an X post as a broadcast-style PNG plate

Usage:
  xpostplate <url-or-status-id> [options]
  xpostplate --fixture [fixture.json] [options]

Default output is PNG bytes on stdout. Logs go to stderr.

Options:
  --view <name>          plate (default), timeline, detail, or quote
                         plate is the bordered card. timeline is the home-feed row.
                         detail is the opened post. quote is the nested post
  --fabricate            Invent a post from --text and the override flags. No URL and no network
  --name <text>          Override the display name
  --handle <text>        Override the @handle
  --text <text>          Override the post text. Required with --fabricate
  --verified             Show the verified check. Last of --verified/--no-verified wins
  --no-verified          Hide the verified check. Last of --verified/--no-verified wins
  --posted <iso>         Override the timestamp, such as 2026-10-02T18:33:00Z
  --replies <n>          Override the reply count. Zero is a real count, not a missing one
  --reposts <n>          Override the repost count. Zero is a real count
  --quotes <n>           Override the quote count. Zero is a real count
  --likes <n>            Override the like count. Zero is a real count
  --bookmarks <n>        Override the bookmark count. Zero is a real count
  --views <n>            Override the view count. Zero is a real count
  --theme light|dark     Plate theme (default: light)
  --width <px>           Plate width (default: 800)
  --radius <px>          Corner radius (default: 24)
  --border <px>          Accent border thickness (default: 4)
  --accent <hex>         Accent color (default: #1D9BF0)
  --mode text|full       text (default) or full. full shows every metric unless --metrics overrides it
  --time                 Show the timestamp footer (default). Last of --time/--no-time wins
  --no-time              Hide the timestamp footer and its gap. Last of --time/--no-time wins
  --metrics <list>       all, none, or a comma-separated subset of replies, reposts, quotes, likes, bookmarks, views
                         Omitted: none in text mode, all in full mode. Overrides --mode when set
  --max-height <px>      Cap plate height (120–8192). Shrink or drop photos before body lines; header, footer, and border stay
  --media                Draw post photos under the text. Off by default
  --mark                 Show the X mark (default). Last of --mark/--no-mark wins
  --no-mark              Hide the X mark. Last of --mark/--no-mark wins
  --mark-corner <corner> tl, tr, bl, or br (default: tr)
  -o, --output <path>    Write PNG to a file. Use - for stdout (the default)
  --json                 Print the post JSON to stdout and skip the image
  --fixture [path]       Render a local JSON fixture instead of calling the API
  -h, --help             Show this help

Environment:
  X_BEARER_TOKEN         Optional bearer token for GET https://api.x.com/2/tweets/:id
                         ${missingTokenMessage()}
                         Not read from the keychain.

Examples:
  # Public post, no token. PNG bytes go to stdout. Photos stay off.
  xpostplate https://x.com/SpaceX/status/21…47 > plate.png

  # Home-feed row: name, handle, relative time, and icon counts.
  xpostplate https://x.com/SpaceX/status/21…47 --view timeline

  # The opened post, with a clock time and views when the count is known.
  xpostplate https://x.com/SpaceX/status/21…47 --view detail

  # A quoted post: inset, smaller type, no action bar.
  xpostplate https://x.com/SpaceX/status/21…47 --view quote

  # Draw that post's photos under the text.
  xpostplate https://x.com/SpaceX/status/21…47 --media

  # Same post, written to a file.
  xpostplate https://x.com/SpaceX/status/21…47 -o plate.png

  # A bearer token is optional. Set it only for the counts the public feed lacks: reposts, quotes, bookmarks, and views.
  X_BEARER_TOKEN=... xpostplate https://x.com/SpaceX/status/21…47 --mode full

  # Pick footer pieces: hide the timestamp, and show only likes and replies.
  xpostplate https://x.com/SpaceX/status/21…47 --no-time --metrics likes,replies

  # Cap the plate height. Extra body lines drop from the end.
  xpostplate https://x.com/SpaceX/status/21…47 --max-height 420

  # The X mark is on by default, in the top right. Hide it.
  xpostplate https://x.com/SpaceX/status/21…47 --no-mark

  # Or move the mark to the bottom left.
  xpostplate https://x.com/SpaceX/status/21…47 --mark-corner bl

  # Look, not data: theme, accent, corner radius, and border.
  xpostplate https://x.com/SpaceX/status/21…47 --theme dark --accent '#E8A838' --radius 8 --border 0

  # Agents: print the post JSON and skip the image.
  xpostplate https://x.com/SpaceX/status/21…47 --json

  # Invent a post. No URL and no network.
  xpostplate --fabricate --name "SpaceX" --handle SpaceX --text "Starship is stacked."

  # Keep a real post and replace the words.
  xpostplate https://x.com/SpaceX/status/21…47 --text "A line written for the plate."

  # Offline: render the built-in fixture. No URL and no network.
  xpostplate --fixture
`;
}

export function parseCli(argv) {
  const opts = {
    view: "plate",
    theme: "light",
    width: 800,
    radius: 24,
    border: 4,
    accent: "#1D9BF0",
    mode: "text",
    showTime: true,
    metrics: null,
    metricsExplicit: false,
    maxHeight: null,
    showMark: true,
    showMedia: false,
    markCorner: "tr",
    output: null,
    json: false,
    fixture: null,
    fabricate: false,
    nameOverride: null,
    handleOverride: null,
    textOverride: null,
    verifiedOverride: null,
    posted: null,
    counts: {},
    help: false,
    positionals: [],
  };

  const args = [...argv];
  while (args.length) {
    const arg = args.shift();
    if (arg === "--") {
      opts.positionals.push(...args);
      break;
    }
    if (!arg.startsWith("-") || arg === "-") {
      opts.positionals.push(arg);
      continue;
    }

    const eq = arg.indexOf("=");
    const key = eq === -1 ? arg : arg.slice(0, eq);
    const inline = eq === -1 ? null : arg.slice(eq + 1);

    if (key === "-h" || key === "--help") {
      opts.help = true;
      continue;
    }
    if (key === "--json") {
      if (inline !== null) throw new Error("--json does not take a value");
      opts.json = true;
      continue;
    }
    if (key === "--fixture") {
      if (inline !== null) {
        opts.fixture = inline;
      } else if (args[0] && !args[0].startsWith("-")) {
        opts.fixture = args.shift();
      } else {
        opts.fixture = true;
      }
      continue;
    }
    if (key === "-o" || key === "--output") {
      opts.output = inline !== null ? inline : takeValue(args, key, { allowDash: true });
      continue;
    }
    if (key === "--view") {
      opts.view = (inline !== null ? inline : takeValue(args, key)).toLowerCase();
      continue;
    }
    if (key === "--fabricate") {
      if (inline !== null) throw new Error("--fabricate does not take a value");
      opts.fabricate = true;
      continue;
    }
    if (key === "--name" || key === "--handle" || key === "--text") {
      const value = inline !== null ? inline : takeValue(args, key);
      if (key !== "--text" && !value.trim()) throw new Error(`${key} expects text`);
      if (key === "--name") opts.nameOverride = value;
      else if (key === "--handle") opts.handleOverride = value.replace(/^@/, "");
      else opts.textOverride = value;
      continue;
    }
    if (key === "--verified") {
      if (inline !== null) throw new Error("--verified does not take a value");
      opts.verifiedOverride = true;
      continue;
    }
    if (key === "--no-verified") {
      if (inline !== null) throw new Error("--no-verified does not take a value");
      opts.verifiedOverride = false;
      continue;
    }
    if (key === "--posted") {
      opts.posted = parsePosted(inline !== null ? inline : takeValue(args, key));
      continue;
    }
    if (COUNT_FLAGS[key]) {
      opts.counts[COUNT_FLAGS[key]] = readCount(key, inline !== null ? inline : takeValue(args, key));
      continue;
    }
    if (key === "--theme") {
      opts.theme = (inline !== null ? inline : takeValue(args, key)).toLowerCase();
      continue;
    }
    if (key === "--mode") {
      opts.mode = (inline !== null ? inline : takeValue(args, key)).toLowerCase();
      continue;
    }
    if (key === "--time") {
      if (inline !== null) throw new Error("--time does not take a value");
      opts.showTime = true;
      continue;
    }
    if (key === "--no-time") {
      if (inline !== null) throw new Error("--no-time does not take a value");
      opts.showTime = false;
      continue;
    }
    if (key === "--metrics") {
      opts.metrics = parseMetrics(inline !== null ? inline : takeValue(args, key));
      opts.metricsExplicit = true;
      continue;
    }
    if (key === "--max-height") {
      opts.maxHeight = readPx("--max-height", inline !== null ? inline : takeValue(args, key), 120, 8192);
      continue;
    }
    if (key === "--media") {
      if (inline !== null) throw new Error("--media does not take a value");
      opts.showMedia = true;
      continue;
    }
    if (key === "--mark") {
      if (inline !== null) throw new Error("--mark does not take a value");
      opts.showMark = true;
      continue;
    }
    if (key === "--no-mark") {
      if (inline !== null) throw new Error("--no-mark does not take a value");
      opts.showMark = false;
      continue;
    }
    if (key === "--mark-corner") {
      opts.markCorner = (inline !== null ? inline : takeValue(args, key)).toLowerCase();
      continue;
    }
    if (key === "--width") {
      opts.width = readPx("--width", inline !== null ? inline : takeValue(args, key), 200, 4096);
      continue;
    }
    if (key === "--radius") {
      opts.radius = readPx("--radius", inline !== null ? inline : takeValue(args, key), 0, 512);
      continue;
    }
    if (key === "--border") {
      opts.border = readPx("--border", inline !== null ? inline : takeValue(args, key), 0, 64);
      continue;
    }
    if (key === "--accent") {
      opts.accent = normalizeAccent(inline !== null ? inline : takeValue(args, key));
      continue;
    }
    throw new Error(`Unknown option: ${key}`);
  }

  if (!VIEWS.has(opts.view)) {
    throw new Error(`--view must be plate, timeline, detail, or quote (got ${opts.view})`);
  }
  if (!THEMES.has(opts.theme)) {
    throw new Error(`--theme must be light or dark (got ${opts.theme})`);
  }
  if (!MODES.has(opts.mode)) {
    throw new Error(`--mode must be text or full (got ${opts.mode})`);
  }
  if (!CORNERS.has(opts.markCorner)) {
    throw new Error(`--mark-corner must be tl, tr, bl, or br (got ${opts.markCorner})`);
  }
  if (opts.border * 2 >= opts.width || opts.radius * 2 > opts.width) {
    throw new Error("--radius and --border must fit inside --width");
  }
  if (opts.metrics == null) {
    opts.metrics = opts.mode === "full" ? METRIC_ORDER.slice() : [];
  }
  return opts;
}

function parseMetrics(raw) {
  const tokens = String(raw)
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0);
  if (!tokens.length) {
    throw new Error("--metrics expects all, none, or a list of metric names");
  }
  const specials = tokens.filter((token) => token === "all" || token === "none");
  if (specials.length) {
    if (tokens.length !== 1) {
      throw new Error(`--metrics ${specials[0]} must be used alone`);
    }
    return tokens[0] === "all" ? METRIC_ORDER.slice() : [];
  }
  const bad = [...new Set(tokens.filter((token) => !METRIC_NAMES.has(token)))];
  if (bad.length) {
    throw new Error(`Unknown metric: ${bad.join(", ")}`);
  }
  const picked = new Set(tokens);
  return METRIC_ORDER.filter((name) => picked.has(name));
}

function takeValue(args, opt, { allowDash = false } = {}) {
  if (!args.length) throw new Error(`${opt} requires a value`);
  if (args[0].startsWith("-") && !(allowDash && args[0] === "-")) {
    throw new Error(`${opt} requires a value`);
  }
  return args.shift();
}

function readCount(name, raw) {
  if (!/^\d+$/.test(raw)) throw new Error(`${name} expects a whole number (got ${raw})`);
  return Number(raw);
}

function parsePosted(raw) {
  const value = raw.trim();
  if (!value || Number.isNaN(Date.parse(value))) {
    throw new Error(`--posted expects an ISO time like 2026-10-02T18:33:00Z (got ${raw})`);
  }
  return new Date(value).toISOString();
}

function readPx(name, raw, min, max) {
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${name} expects a whole number of pixels (got ${raw})`);
  }
  const n = Number(raw);
  if (n < min || n > max) {
    throw new Error(`${name} must be between ${min} and ${max}`);
  }
  return n;
}

function normalizeAccent(raw) {
  const value = raw.trim();
  if (!/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value)) {
    throw new Error(`--accent expects a hex color like #1D9BF0 (got ${raw})`);
  }
  return value;
}
