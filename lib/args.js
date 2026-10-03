const THEMES = new Set(["light", "dark"]);
const MODES = new Set(["text", "full"]);

export function helpText() {
  return `xpostplate — render an X post as a broadcast-style PNG plate

Usage:
  xpostplate <url-or-status-id> [options]
  xpostplate --fixture [fixture.json] [options]

Default output is PNG bytes on stdout. Logs go to stderr.

Options:
  --theme light|dark     Plate theme (default: light)
  --width <px>           Plate width (default: 800)
  --radius <px>          Corner radius (default: 24)
  --border <px>          Accent border thickness (default: 4)
  --accent <hex>         Accent color (default: #1D9BF0)
  --mode text|full       text = author, text, time; full also shows public metrics
  -o, --output <path>    Write PNG to a file. Use - for stdout (the default)
  --json                 Print the post JSON to stdout and skip the image
  --fixture [path]       Render a local JSON fixture instead of calling the API
  -h, --help             Show this help

Environment:
  X_BEARER_TOKEN         Bearer token for GET https://api.x.com/2/tweets/:id
                         Required unless --fixture is set. Not read from the keychain.

Examples:
  xpostplate https://x.com/example/status/1234567890123456789 > plate.png
  xpostplate 1234567890123456789 -o plate.png
  xpostplate 1234567890123456789 --theme dark --mode full -o -
  xpostplate 1234567890123456789 --json
  xpostplate --fixture -o examples/plate-sample.png
`;
}

export function parseCli(argv) {
  const opts = {
    theme: "light",
    width: 800,
    radius: 24,
    border: 4,
    accent: "#1D9BF0",
    mode: "text",
    output: null,
    json: false,
    fixture: null,
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
    if (key === "--theme") {
      opts.theme = (inline !== null ? inline : takeValue(args, key)).toLowerCase();
      continue;
    }
    if (key === "--mode") {
      opts.mode = (inline !== null ? inline : takeValue(args, key)).toLowerCase();
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

  if (!THEMES.has(opts.theme)) {
    throw new Error(`--theme must be light or dark (got ${opts.theme})`);
  }
  if (!MODES.has(opts.mode)) {
    throw new Error(`--mode must be text or full (got ${opts.mode})`);
  }
  if (opts.border * 2 >= opts.width || opts.radius * 2 > opts.width) {
    throw new Error("--radius and --border must fit inside --width");
  }
  return opts;
}

function takeValue(args, opt, { allowDash = false } = {}) {
  if (!args.length) throw new Error(`${opt} requires a value`);
  if (args[0].startsWith("-") && !(allowDash && args[0] === "-")) {
    throw new Error(`${opt} requires a value`);
  }
  return args.shift();
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
