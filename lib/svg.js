import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EMOJI_ADVANCE, emojiSvg, graphemes, splitEmoji } from "./emoji.js";
import { fontFamilies, fontMeasurer, glyphCoverage } from "./fonts.js";
import { formatDetailTime, formatPostTime, formatRelativeTime } from "./post.js";

const logoFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../assets/x-logo.svg");
let logoCache = null;

const THEMES = {
  light: {
    bg: "#FFFFFF",
    name: "#0F1419",
    body: "#0F1419",
    muted: "#536471",
    divider: "#EFF3F4",
    line: "#CFD9DE",
    onAccent: "#FFFFFF",
    // Plate border and initials when --accent is not passed: near-black, not Twitter blue.
    accent: "#0F1419",
    avatarFallback: "#536471",
    mark: "#0F1419",
  },
  // Today's x.com dark mode ("Lights out"): true black with gray hairlines.
  dark: {
    bg: "#000000",
    name: "#E7E9EA",
    body: "#E7E9EA",
    muted: "#71767B",
    divider: "#2F3336",
    line: "#2F3336",
    onAccent: "#FFFFFF",
    accent: "#2F3336",
    avatarFallback: "#3E4144",
    mark: "#E7E9EA",
  },
};

// Links, mentions, hashtags, and cashtags stay X blue in both themes.
const LINK = "#1D9BF0";
const VERIFIED_FILL = { blue: "#1D9BF0", business: "#E2B719", government: "#829AAB" };

export function resolveAccent(opts) {
  return opts.accent || (THEMES[opts.theme] || THEMES.light).accent;
}

// The X mark is part of the plate look. Faithful views hide it unless --mark is passed.
export function resolveMark(opts) {
  if (opts.showMark === true || opts.showMark === false) return opts.showMark;
  return (opts.view || "plate") === "plate";
}

const METRIC_ORDER = ["replies", "reposts", "quotes", "likes", "bookmarks", "views"];

const METRIC_FIELDS = {
  replies: ["reply_count", "reply", "replies"],
  reposts: ["retweet_count", "repost", "reposts"],
  quotes: ["quote_count", "quote", "quotes"],
  likes: ["like_count", "like", "likes"],
  bookmarks: ["bookmark_count", "bookmark", "bookmarks"],
  views: ["impression_count", "view", "views"],
};

export function renderSvg(post, opts, assets = {}) {
  if (opts.view && opts.view !== "plate") return renderView(post, opts, assets);
  const colors = THEMES[opts.theme];
  const accent = resolveAccent(opts);
  const width = opts.width;
  const border = opts.border;
  const radius = opts.radius;
  const pad = Math.max(32, border + 24);
  const avatar = 56;
  const contentW = width - pad * 2;
  const nameX = pad + avatar + 16;
  const showMark = resolveMark(opts);
  const markCorner = opts.markCorner || "tr";
  let nameMaxW = width - pad - nameX;
  if (showMark && (markCorner === "tl" || markCorner === "tr")) {
    const markX = markOrigin(markCorner, width, 0, border).x;
    if (markX > nameX) nameMaxW = Math.min(nameMaxW, markX - 12 - nameX);
  }

  const nameSize = 26;
  const handleSize = 17;
  const bodySize = 22;
  const bodyLeading = 32;
  const timeSize = 16;
  const metricSize = 16;
  const metricLeading = 24;

  const avatarY = pad;
  const nameY = avatarY + 28;
  const handleY = avatarY + 52;
  const showTime = opts.showTime !== false;
  const chunks = metricChunks(post.public_metrics, resolveMetricKeys(opts));
  const drawMedia = opts.showMedia === true && !opts.fixture && contentW >= 80;
  const photoUrls = drawMedia && Array.isArray(post.photos)
    ? post.photos.filter((url) => typeof url === "string" && url).slice(0, 4)
    : [];
  // The plate keeps the raw text, except the media t.co link when its photo is drawn.
  const plateText = photoUrls.length ? bodyText(post, { stripMedia: true, expandLinks: false }).text : post.text;
  const allBodyLines = plateText.trim() ? wrapText(plateText, contentW, bodySize) : [];
  const naturalCells = photoGrid(contentW, photoUrls.length);
  const naturalH = blockHeight(naturalCells);

  const measure = (lineCount, photoBlockH) => {
    let cursor = avatarY + avatar + 26;
    const bodyYs = [];
    for (let i = 0; i < lineCount; i++) bodyYs.push(cursor + bodySize + i * bodyLeading);
    if (bodyYs.length) cursor = bodyYs[bodyYs.length - 1];

    let photoTop = null;
    if (photoBlockH > 0) {
      cursor += PHOTO_LEAD;
      photoTop = cursor;
      cursor += photoBlockH;
    }

    let timeY = null;
    if (showTime) {
      cursor += 22;
      timeY = cursor + timeSize;
      cursor = timeY;
    }

    let dividerY = null;
    const metricLines = [];
    if (chunks.length) {
      cursor += 18;
      dividerY = cursor;
      cursor += 16;
      const texts = layoutChunks(chunks, contentW, metricSize);
      for (let i = 0; i < texts.length; i++) {
        metricLines.push({ text: texts[i], y: cursor + metricSize + i * metricLeading });
      }
      if (metricLines.length) cursor = metricLines[metricLines.length - 1].y;
    }

    return { bodyYs, photoTop, timeY, dividerY, metricLines, height: Math.round(cursor + pad) };
  };

  let bodyLines = allBodyLines;
  let photoCells = naturalCells;
  if (opts.maxHeight != null) {
    const minHeight = measure(0, 0).height;
    if (minHeight > opts.maxHeight) {
      throw new Error(
        `Plate header and footer are ${minHeight}px tall, above --max-height ${opts.maxHeight}. The footer and border are not clipped.`,
      );
    }
    const fullBodyHeight = measure(allBodyLines.length, 0).height;
    if (fullBodyHeight > opts.maxHeight || naturalH === 0) {
      photoCells = [];
      if (fullBodyHeight > opts.maxHeight) {
        let keep = allBodyLines.length;
        while (keep > 0 && measure(keep, 0).height > opts.maxHeight) keep -= 1;
        if (keep < allBodyLines.length) {
          bodyLines = keep === 0 ? [] : allBodyLines.slice(0, keep - 1).concat("…");
        }
      }
    } else {
      const room = opts.maxHeight - fullBodyHeight - PHOTO_LEAD;
      if (room >= naturalH) photoCells = naturalCells;
      else if (room >= MIN_PHOTO_BLOCK) photoCells = fitPhotoBlock(naturalCells, room);
      else photoCells = [];
    }
  }

  const photoBlockH = blockHeight(photoCells);
  const laid = measure(bodyLines.length, photoBlockH);
  const { bodyYs, timeY, dividerY, metricLines } = laid;
  const height = laid.height;
  const timeLabel = formatPostTime(post.created_at);
  const parts = [];
  parts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
  );

  // The accent border is a larger rounded rect sitting behind the fill (no stroke),
  // so --border is exactly that many pixels on every side. Photo pixels are
  // composited onto the PNG afterward; this SVG only reserves their box.
  if (border > 0) {
    parts.push(rect(0, 0, width, height, radius, accent));
    const innerRadius = Math.max(0, radius - border);
    parts.push(rect(border, border, width - border * 2, height - border * 2, innerRadius, colors.bg));
  } else {
    parts.push(rect(0, 0, width, height, radius, colors.bg));
  }

  const avatarCx = pad + avatar / 2;
  const avatarCy = avatarY + avatar / 2;
  parts.push(
    `<circle cx="${avatarCx}" cy="${avatarCy}" r="${avatar / 2}" fill="${accent}"/>`,
  );
  parts.push(
    textEl(initials(post.author.name), avatarCx, avatarY + 36, {
      size: 20,
      family: "PlateSansBold",
      fill: colors.onAccent,
      anchor: "middle",
    }),
  );
  parts.push(
    textEl(fitOneLine(post.author.name, nameMaxW, nameSize), nameX, nameY, {
      size: nameSize,
      family: "PlateSansBold",
      fill: colors.name,
    }),
  );
  parts.push(
    textEl(fitOneLine(`@${post.author.username}`, nameMaxW, handleSize), nameX, handleY, {
      size: handleSize,
      family: "PlateSans",
      fill: colors.muted,
    }),
  );

  bodyLines.forEach((line, i) => {
    parts.push(
      textEl(line, pad, bodyYs[i], {
        size: bodySize,
        family: "PlateSans",
        fill: colors.body,
      }),
    );
  });

  if (showTime && timeLabel) {
    parts.push(
      textEl(timeLabel, pad, timeY, {
        size: timeSize,
        family: "PlateSans",
        fill: colors.muted,
      }),
    );
  }

  if (dividerY != null) {
    parts.push(rect(pad, dividerY, contentW, 2, 0, colors.divider));
    for (const line of metricLines) {
      parts.push(
        textEl(line.text, pad, line.y, {
          size: metricSize,
          family: "PlateSans",
          fill: colors.muted,
        }),
      );
    }
  }

  if (showMark) {
    parts.push(markEl(loadLogo(), markCorner, width, height, border, colors.mark));
  }

  let photos = [];
  if (photoCells.length && laid.photoTop != null) {
    photos = photoCells.map((cell, index) => ({
      url: photoUrls[index],
      x: pad + cell.x,
      y: laid.photoTop + cell.y,
      w: cell.w,
      h: cell.h,
    }));
    if (showMark) {
      const origin = markOrigin(markCorner, width, height, border);
      photos = clearOfMark(photos, { x: origin.x, y: origin.y, w: MARK_SIZE, h: MARK_SIZE });
    }
  }

  parts.push(`</svg>`);
  return { svg: parts.join("\n"), width, height, photos };
}

const PHOTO_GAP = 8;
const PHOTO_LEAD = 20;
const PHOTO_BLOCK_MAX = 420;
const MIN_PHOTO_BLOCK = 80;

function photoGrid(contentW, count) {
  const n = Math.min(count, 4);
  if (n <= 0 || contentW < 80) return [];
  if (n === 1) {
    const h = Math.min(PHOTO_BLOCK_MAX, Math.max(1, Math.round((contentW * 9) / 16)));
    return [{ x: 0, y: 0, w: contentW, h }];
  }
  if (n === 2) {
    const w = Math.floor((contentW - PHOTO_GAP) / 2);
    const h = Math.min(260, Math.max(1, Math.round((w * 9) / 16)));
    return [
      { x: 0, y: 0, w, h },
      { x: w + PHOTO_GAP, y: 0, w: contentW - w - PHOTO_GAP, h },
    ];
  }
  if (n === 3) {
    const w = Math.floor((contentW - PHOTO_GAP * 2) / 3);
    const h = Math.min(220, Math.max(1, Math.round(w * 0.75)));
    return [
      { x: 0, y: 0, w, h },
      { x: w + PHOTO_GAP, y: 0, w, h },
      { x: (w + PHOTO_GAP) * 2, y: 0, w: contentW - PHOTO_GAP * 2 - w * 2, h },
    ];
  }
  const w = Math.floor((contentW - PHOTO_GAP) / 2);
  const h = Math.min(200, Math.floor((PHOTO_BLOCK_MAX - PHOTO_GAP) / 2));
  const w2 = contentW - PHOTO_GAP - w;
  return [
    { x: 0, y: 0, w, h },
    { x: w + PHOTO_GAP, y: 0, w: w2, h },
    { x: 0, y: h + PHOTO_GAP, w, h },
    { x: w + PHOTO_GAP, y: h + PHOTO_GAP, w: w2, h },
  ];
}

function blockHeight(cells) {
  if (!cells.length) return 0;
  return cells.reduce((max, cell) => Math.max(max, cell.y + cell.h), 0);
}

function fitPhotoBlock(cells, maxBlockH) {
  const natural = blockHeight(cells);
  const limit = Math.floor(maxBlockH);
  if (!cells.length || natural <= 0 || limit < MIN_PHOTO_BLOCK) return [];
  if (natural <= limit) return cells;
  const scale = limit / natural;
  const scaled = cells.map((cell) => {
    const y = Math.floor(cell.y * scale);
    let h = Math.max(1, Math.floor(cell.h * scale));
    if (y + h > limit) h = limit - y;
    return { ...cell, y, h };
  });
  if (scaled.some((cell) => cell.w < 36 || cell.h < 36)) return [];
  if (blockHeight(scaled) > limit) return [];
  return scaled;
}

function intersects(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function clearOfMark(slots, mark) {
  const gap = 8;
  const box = { x: mark.x - gap, y: mark.y - gap, w: mark.w + gap * 2, h: mark.h + gap * 2 };
  const kept = [];
  for (const slot of slots) {
    const trimmed = trimSlot(slot, box);
    if (trimmed) kept.push(trimmed);
  }
  return kept;
}

function trimSlot(slot, box) {
  if (!intersects(slot, box)) return slot;
  let { x, y, w, h, url } = slot;
  const sx1 = x + w;
  const sy1 = y + h;
  const bx1 = box.x + box.w;
  const by1 = box.y + box.h;
  if (box.x <= x && bx1 < sx1) {
    x += bx1 - x;
    w = sx1 - x;
  } else if (box.x > x && bx1 >= sx1) {
    w = box.x - x;
  } else if (box.x > x && bx1 < sx1) {
    const left = box.x - x;
    const right = sx1 - bx1;
    if (right >= left) {
      x = bx1;
      w = sx1 - bx1;
    } else {
      w = box.x - x;
    }
  }
  if (box.y <= y && by1 < sy1) {
    y += by1 - y;
    h = sy1 - y;
  } else if (box.y > y && by1 >= sy1) {
    h = box.y - y;
  } else if (box.y > y && by1 < sy1) {
    const top = box.y - y;
    const bottom = sy1 - by1;
    if (bottom >= top) {
      y = by1;
      h = sy1 - by1;
    } else {
      h = box.y - y;
    }
  }
  x = Math.round(x);
  y = Math.round(y);
  w = Math.floor(w);
  h = Math.floor(h);
  if (w < 36 || h < 36) return null;
  return { url, x, y, w, h };
}

const MARK_SIZE = 26;

function loadLogo() {
  if (logoCache) return logoCache;
  let raw;
  try {
    raw = readFileSync(logoFile, "utf8");
  } catch (err) {
    throw new Error(`Could not read the X mark at ${logoFile}: ${err.message}`);
  }
  const viewBox = raw.match(/viewBox="([^"]+)"/i);
  const pathData = raw.match(/\bd="([^"]+)"/);
  if (!viewBox || !pathData) {
    throw new Error("assets/x-logo.svg is missing a viewBox or path.");
  }
  const box = viewBox[1].trim().split(/[\s,]+/).map(Number);
  if (box.length !== 4 || box.some((n) => !Number.isFinite(n)) || box[2] <= 0 || box[3] <= 0) {
    throw new Error("assets/x-logo.svg has an unreadable viewBox.");
  }
  logoCache = { d: pathData[1], minX: box[0], minY: box[1], vbW: box[2], vbH: box[3] };
  return logoCache;
}

function markOrigin(corner, width, height, border) {
  const inset = border + 18;
  const x = corner === "tl" || corner === "bl" ? inset : width - inset - MARK_SIZE;
  const y = corner === "tl" || corner === "tr" ? inset : height - inset - MARK_SIZE;
  return { x, y };
}

function markEl(logo, corner, width, height, border, fill) {
  const { x, y } = markOrigin(corner, width, height, border);
  const scale = MARK_SIZE / logo.vbW;
  const tx = roundPx(x - logo.minX * scale);
  const ty = roundPx(y - logo.minY * scale);
  return `<g transform="translate(${tx} ${ty}) scale(${roundPx(scale)})"><path fill="${fill}" d="${xmlEscape(logo.d)}"/></g>`;
}

function roundPx(n) {
  return Math.round(n * 1000) / 1000;
}

function resolveMetricKeys(opts) {
  if (Array.isArray(opts.metrics)) {
    const picked = new Set(opts.metrics);
    return METRIC_ORDER.filter((key) => picked.has(key));
  }
  return opts.mode === "full" ? METRIC_ORDER.slice() : [];
}

function metricChunks(metrics, keys) {
  const chunks = [];
  for (const key of keys) {
    const [field, one, many] = METRIC_FIELDS[key];
    const value = metrics?.[field];
    if (value == null) continue;
    chunks.push(countLabel(value, one, many));
  }
  return chunks;
}

function countLabel(value, one, many) {
  const n = Number(value);
  const count = Number.isFinite(n) ? n : 0;
  return `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;
}

function rect(x, y, w, h, r, fill) {
  const rx = r > 0 ? ` rx="${r}" ry="${r}"` : "";
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}"${rx} fill="${fill}"/>`;
}

// PlateSans and PlateSansBold name the two faces fonts.js measures (Arial, DejaVu
// Sans, or Liberation Sans). The SVG carries their real family names, read from
// the TTF name tables, so resvg picks exactly those files.
function fontAttrs(family) {
  const names = fontFamilies();
  const bold = family === "PlateSansBold";
  const name = xmlEscape(bold ? names.bold : names.regular);
  return bold ? `font-family="${name}" font-weight="700"` : `font-family="${name}"`;
}

function textEl(value, x, y, { size, family, fill, anchor }) {
  const bold = family === "PlateSansBold";
  const pieces = splitEmoji(value, glyphCoverage(bold));
  if (pieces.some((p) => p.emoji)) {
    // Emoji: each plain run is its own <text> at its measured x, and each emoji
    // an inline Twemoji <svg> in the gap the measurement left for it.
    const total = pieces.reduce((w, p) => w + pieceWidth(p, size, bold), 0);
    const start = anchor === "middle" ? x - total / 2 : anchor === "end" ? x - total : x;
    const out = [];
    placePieces(out, pieces, start, y, size, { family, fill });
    return out.join("");
  }
  const anchorAttr = anchor ? ` text-anchor="${anchor}"` : "";
  // xml:space="preserve" keeps runs of spaces (the plate's "  ·  " metric separator)
  // as measured instead of collapsing them.
  return `<text x="${x}" y="${y}" ${fontAttrs(family)} font-size="${size}" fill="${fill}"${anchorAttr} xml:space="preserve">${glyphText(value, family === "PlateSansBold")}</text>`;
}

function pieceWidth(piece, size, bold) {
  return piece.emoji ? EMOJI_ADVANCE * size : fontWidth(piece.text, size, bold);
}

// Lay out plain and emoji pieces left to right from x. Leading spaces become an
// x offset so nothing depends on how a renderer treats them.
function placePieces(out, pieces, x, y, size, { family, fill, spanFill }) {
  const bold = family === "PlateSansBold";
  let cursor = x;
  for (const piece of pieces) {
    if (piece.emoji) {
      out.push(emojiSvg(piece.graphic, cursor, y, size));
      cursor += EMOJI_ADVANCE * size;
      continue;
    }
    const lead = piece.text.match(/^\s*/)[0];
    const shown = piece.text.slice(lead.length);
    const at = cursor + (lead ? fontWidth(lead, size, bold) : 0);
    if (shown.trim()) {
      out.push(
        `<text x="${roundPx(at)}" y="${y}" ${fontAttrs(family)} font-size="${size}" fill="${spanFill || fill}" xml:space="preserve">${glyphText(shown, bold)}</text>`,
      );
    }
    cursor += fontWidth(piece.text, size, bold);
  }
  return cursor;
}

// Escape text for the SVG. Characters the measured face has no glyph for (emoji,
// CJK) stay in place, so their advance matches the measurement, but are not
// painted: resvg would draw .notdef boxes, and the old renderer left a blank.
function glyphText(value, bold) {
  const has = glyphCoverage(bold);
  const text = String(value);
  if (!has) return xmlEscape(text);
  let out = "";
  let run = "";
  let runHidden = false;
  const flush = () => {
    if (run) out += runHidden ? `<tspan fill="none">${xmlEscape(run)}</tspan>` : xmlEscape(run);
    run = "";
  };
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    const hidden = cp > 0x7e && !has(cp);
    if (hidden !== runHidden) {
      flush();
      runHidden = hidden;
    }
    run += ch;
  }
  flush();
  return out;
}

function initials(name) {
  // First letter or digit of the first two words; emoji and symbols are skipped.
  const firsts = String(name)
    .trim()
    .split(/\s+/)
    .map((word) => graphemes(word).find((g) => /^[\p{L}\p{N}]/u.test(g)))
    .filter(Boolean);
  if (!firsts.length) return "?";
  return firsts.slice(0, 2).join("").toUpperCase();
}

export function wrapText(text, maxWidth, fontSize) {
  const maxChars = maxCharsFor(maxWidth, fontSize);
  const lines = [];
  const paragraphs = String(text).replace(/\r\n/g, "\n").split("\n");
  paragraphs.forEach((para, index) => {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) {
      if (index !== paragraphs.length - 1) lines.push("");
      return;
    }
    let current = "";
    for (const word of words) {
      for (const piece of splitLong(word, maxChars)) {
        if (!current) {
          current = piece;
        } else if (charLen(current) + 1 + charLen(piece) <= maxChars) {
          current += ` ${piece}`;
        } else {
          lines.push(current);
          current = piece;
        }
      }
    }
    if (current) lines.push(current);
  });
  return lines;
}

function layoutChunks(chunks, maxWidth, fontSize) {
  const maxChars = maxCharsFor(maxWidth, fontSize);
  const sep = "  ·  ";
  const lines = [];
  let current = [];
  let len = 0;
  for (const chunk of chunks) {
    const add = current.length ? sep.length + charLen(chunk) : charLen(chunk);
    if (current.length && len + add > maxChars) {
      lines.push(current.join(sep));
      current = [chunk];
      len = charLen(chunk);
    } else {
      current.push(chunk);
      len += add;
    }
  }
  if (current.length) lines.push(current.join(sep));
  return lines;
}

function fitOneLine(text, maxWidth, fontSize) {
  const value = String(text);
  const maxChars = maxCharsFor(maxWidth, fontSize);
  if (charLen(value) <= maxChars) return value;
  return `${sliceChars(value, Math.max(1, maxChars - 3)).trimEnd()}...`;
}

// The plate's character estimate. Plain text counts UTF-16 units as it always
// has; an emoji counts as the characters its width covers (~2.4), and a ZWJ
// family or flag is one emoji, not its 4 to 11 code units.
const EMOJI_CHARS = EMOJI_ADVANCE / 0.56;
function charLen(text) {
  const value = String(text);
  if (!/[^\x00-\x7e]/.test(value)) return value.length;
  let n = 0;
  for (const piece of splitEmoji(value, glyphCoverage(false))) n += piece.emoji ? EMOJI_CHARS : piece.text.length;
  return n;
}

// Leading graphemes of text that fit in maxChars by charLen.
function sliceChars(text, maxChars) {
  const value = String(text);
  if (!/[^\x00-\x7e]/.test(value)) return value.slice(0, maxChars);
  let out = "";
  for (const g of graphemes(value)) {
    if (charLen(out + g) > maxChars) break;
    out += g;
  }
  return out;
}

function maxCharsFor(maxWidth, fontSize) {
  return Math.max(8, Math.floor(maxWidth / (fontSize * 0.56)));
}

function splitLong(word, maxChars) {
  if (charLen(word) <= maxChars) return [word];
  const pieces = [];
  let rest = word;
  while (rest) {
    const piece = sliceChars(rest, maxChars) || graphemes(rest)[0];
    pieces.push(piece);
    rest = rest.slice(piece.length);
  }
  return pieces;
}

function xmlEscape(value) {
  return String(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const VIEW_SPEC = {
  timeline: {
    inset: 0,
    hairline: 0,
    radius: 0,
    pad: 22,
    avatar: 48,
    avatarGap: 12,
    nameSize: 18,
    handleSize: 15,
    bodySize: 17,
    bodyLeading: 25,
    header: "inline",
    bodyIndent: true,
    mark: "glyph",
    markSize: 20,
    footer: "icons",
  },
  detail: {
    inset: 0,
    hairline: 0,
    radius: 0,
    pad: 28,
    avatar: 56,
    avatarGap: 14,
    nameSize: 24,
    handleSize: 16,
    bodySize: 22,
    bodyLeading: 32,
    header: "stack",
    bodyIndent: false,
    mark: "glyph",
    markSize: 22,
    footer: "detail",
    timeSize: 16,
  },
  quote: {
    inset: 16,
    hairline: 1,
    radius: 16,
    pad: 16,
    avatar: 28,
    avatarGap: 8,
    nameSize: 15,
    handleSize: 13,
    bodySize: 15,
    bodyLeading: 22,
    header: "inline",
    bodyIndent: false,
    mark: "none",
    markSize: 0,
    footer: "none",
    timeSize: 13,
  },
};

const ACTION_ICONS = {
  reply:
    "M4 5h12.2c1.9 0 3.4 1.5 3.4 3.4v6c0 1.9-1.5 3.4-3.4 3.4H10.4L6 21.2V17.8H4c-1.9 0-3.4-1.5-3.4-3.4v-6C.6 6.5 2.1 5 4 5zm1.2 2.4h10.2c.8 0 1.4.6 1.4 1.4v4.8c0 .8-.6 1.4-1.4 1.4H9.2l-1.8 1.5v-1.5H5.2c-.8 0-1.4-.6-1.4-1.4V8.8c0-.8.6-1.4 1.4-1.4z",
  repost:
    "M4.2 13.2h2.2V7.2h6.6v2.4L19.6 6.2 13 2.8v2.4H4.2v8zm15.6-2.4h-2.2v6H11v-2.4L4.4 17.8 11 21.2v-2.4h8.8V10.8z",
  like:
    "M12 20.2S4.2 15 4.2 9.8C4.2 7.2 6.2 5.2 8.6 5.2c1.5 0 2.7.7 3.4 1.8.7-1.1 1.9-1.8 3.4-1.8 2.4 0 4.4 2 4.4 4.6 0 5.2-7.8 10.4-7.8 10.4zM12 17.2s5.2-3.6 5.2-7.2c0-1.4-1.1-2.5-2.4-2.5-1 0-1.8.6-2.2 1.5L12 10l-.6-1c-.4-.9-1.2-1.5-2.2-1.5-1.3 0-2.4 1.1-2.4 2.5 0 3.6 5.2 7.2 5.2 7.2z",
  bookmark:
    "M6.2 3.2h11.6c.9 0 1.6.7 1.6 1.6V21L12 17.1 4.6 21V4.8c0-.9.7-1.6 1.6-1.6zM7.6 6.2v10.2l4.4-2.6 4.4 2.6V6.2H7.6z",
  share: "M12 2.8 16.6 7.6H13.6V12.4H10.4V7.6H7.4L12 2.8zM5 14.2H7.4V19.4H16.6V14.2H19V21.4H5V14.2z",
};

const TIMELINE_ACTIONS = [
  ["reply", "reply_count", "replies"],
  ["repost", "retweet_count", "reposts"],
  ["like", "like_count", "likes"],
  ["bookmark", "bookmark_count", "bookmarks"],
  ["share", null, null],
];

function renderView(post, opts, assets = {}) {
  const spec = VIEW_SPEC[opts.view];
  if (!spec) throw new Error(`Unknown view: ${opts.view}`);
  const colors = THEMES[opts.theme];
  const width = opts.width;
  const inset = spec.inset;
  const hair = spec.hairline;
  const pad = spec.pad;
  const top = inset + hair + pad;
  const left = inset + hair + pad;
  const right = width - inset - hair - pad;
  const avatar = spec.avatar;
  const showMark = resolveMark(opts) && spec.mark !== "none";
  const markReserve = showMark ? spec.markSize + 14 : 0;
  const columnX = left + avatar + spec.avatarGap;
  const headerMax = Math.max(24, right - columnX - markReserve);
  const bodyX = spec.bodyIndent ? columnX : left;
  const bodyW = Math.max(8, right - bodyX);
  const showTime = opts.showTime !== false;
  const relTime = showTime ? formatRelativeTime(post.created_at) : "";
  const clock = showTime && spec.footer === "detail" ? formatDetailTime(post.created_at) : "";
  const views = spec.footer === "detail" ? shownViews(post, opts) : null;
  const footerRuns = detailFooterRuns(clock, views, colors);
  const showActions = spec.footer === "icons" || (spec.footer === "detail" && !metricsHidden(opts));
  const drawMedia = opts.showMedia === true && !opts.fixture && bodyW >= 80;
  const photoUrls = drawMedia && Array.isArray(post.photos)
    ? post.photos.filter((url) => typeof url === "string" && url).slice(0, 4)
    : [];
  // Faithful body: reply mentions trimmed, t.co links shown as their display URL,
  // and the media link dropped when its photo is drawn below.
  const body = bodyText(post, { stripMedia: photoUrls.length > 0, expandLinks: true });
  const allBodyLines = body.text.trim() ? wrapWidth(body.text, bodyW, spec.bodySize) : [];
  const naturalCells = faithfulGrid(bodyW, photoUrls.length);
  const naturalH = blockHeight(naturalCells);
  const nameSize = spec.nameSize;
  const handleSize = spec.handleSize;
  const stackBlock = nameSize + 8 + handleSize;
  const headerH = spec.header === "stack" ? Math.max(avatar, stackBlock) : Math.max(avatar, nameSize + 4);

  const measure = (lineCount, photoBlockH) => {
    let cursor = top + headerH;
    const bodyYs = [];
    if (lineCount > 0) {
      cursor += spec.header === "stack" ? 18 : 12;
      for (let i = 0; i < lineCount; i++) bodyYs.push(cursor + spec.bodySize + i * spec.bodyLeading);
      cursor = bodyYs[bodyYs.length - 1];
    }
    let photoTop = null;
    if (photoBlockH > 0) {
      cursor += spec.header === "stack" ? PHOTO_LEAD : 12;
      photoTop = cursor;
      cursor += photoBlockH;
    }
    let footerTop = null;
    let dividerY = null;
    let actionsTop = null;
    if (spec.footer === "icons") {
      cursor += 16;
      actionsTop = cursor;
      cursor += 20;
    } else if (spec.footer === "detail") {
      if (footerRuns.length) {
        cursor += 20;
        footerTop = cursor;
        cursor += spec.timeSize;
      }
      if (showActions) {
        cursor += 18;
        dividerY = cursor;
        cursor += 1 + 16;
        actionsTop = cursor;
        cursor += 22;
      }
    }
    return { bodyYs, photoTop, footerTop, dividerY, actionsTop, height: Math.round(cursor + top) };
  };

  let bodyLines = allBodyLines;
  let photoCells = naturalCells;
  if (opts.maxHeight != null) {
    const minHeight = measure(0, 0).height;
    if (minHeight > opts.maxHeight) {
      throw new Error(
        `Header and footer are ${minHeight}px tall, above --max-height ${opts.maxHeight}. They are not clipped.`,
      );
    }
    const fullBodyHeight = measure(allBodyLines.length, 0).height;
    if (fullBodyHeight > opts.maxHeight || naturalH === 0) {
      photoCells = [];
      if (fullBodyHeight > opts.maxHeight) {
        let keep = allBodyLines.length;
        while (keep > 0 && measure(keep, 0).height > opts.maxHeight) keep -= 1;
        if (keep < allBodyLines.length) {
          bodyLines = keep === 0 ? [] : allBodyLines.slice(0, keep - 1).concat("…");
        }
      }
    } else {
      const room = opts.maxHeight - fullBodyHeight - PHOTO_LEAD;
      if (room >= naturalH) photoCells = naturalCells;
      else if (room >= MIN_PHOTO_BLOCK) photoCells = fitPhotoBlock(naturalCells, room);
      else photoCells = [];
    }
  }

  const photoBlockH = blockHeight(photoCells);
  const laid = measure(bodyLines.length, photoBlockH);
  const height = laid.height;
  const parts = [];
  parts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
  );

  // No accent frame: the opened post, the feed row, and the quote sit on the page
  // background like x.com. Only the quote keeps its gray hairline.
  if (hair > 0) {
    parts.push(rect(inset, inset, width - inset * 2, height - inset * 2, spec.radius, colors.line));
    const innerR = Math.max(0, spec.radius - hair);
    const inner = inset + hair;
    parts.push(rect(inner, inner, width - inner * 2, height - inner * 2, innerR, colors.bg));
  } else {
    parts.push(rect(0, 0, width, height, 0, colors.bg));
  }

  const avatarCx = left + avatar / 2;
  const avatarCy = top + avatar / 2;
  const shape = post.author.profile_image_shape === "square" ? "square" : "circle";
  const avatarRadius = shape === "square" ? Math.max(3, Math.round(avatar * 0.12)) : avatar / 2;
  let avatarSlot = null;
  if (assets.avatar) {
    // Real profile photo, composited onto the PNG afterward.
    avatarSlot = { x: left, y: top, w: avatar, h: avatar, shape, radius: avatarRadius };
  } else {
    const initialsSize = Math.max(12, Math.round(avatar * 0.36));
    parts.push(rect(left, top, avatar, avatar, avatarRadius, opts.accent || colors.avatarFallback));
    parts.push(
      textEl(initials(post.author.name), avatarCx, avatarCy + initialsSize * 0.35, {
        size: initialsSize,
        family: "PlateSansBold",
        fill: colors.onAccent,
        anchor: "middle",
      }),
    );
  }

  const verified = post.author.verified === true;
  const badgeFill = VERIFIED_FILL[post.author.verified_type] || VERIFIED_FILL.blue;
  let nameY;
  if (spec.header === "stack") {
    const blockTop = top + (headerH - stackBlock) / 2;
    nameY = blockTop + nameSize;
    const handleY = nameY + 8 + handleSize;
    const check = verified ? Math.max(14, Math.round(nameSize * 0.84)) : 0;
    const name = ellipsize(post.author.name, headerMax - (verified ? check + 4 : 0), nameSize, true);
    const nameW = textWidth(name, nameSize, true);
    parts.push(textEl(name, columnX, nameY, { size: nameSize, family: "PlateSansBold", fill: colors.name }));
    if (verified) {
      parts.push(verifiedBadge(columnX + nameW + 4, nameY - check + nameSize * 0.14, check, badgeFill));
    }
    parts.push(
      textEl(ellipsize(`@${post.author.username}`, headerMax, handleSize), columnX, handleY, {
        size: handleSize,
        family: "PlateSans",
        fill: colors.muted,
      }),
    );
  } else {
    nameY = top + headerH / 2 + nameSize * 0.32;
    const run = layoutInline({
      name: post.author.name,
      username: post.author.username,
      verified,
      timeLabel: relTime,
      nameSize,
      handleSize,
      maxW: headerMax,
    });
    parts.push(textEl(run.nameShown, columnX, nameY, { size: nameSize, family: "PlateSansBold", fill: colors.name }));
    if (verified && run.check) {
      parts.push(verifiedBadge(columnX + run.checkX, nameY - run.check + nameSize * 0.14, run.check, badgeFill));
    }
    if (run.handleShown) {
      parts.push(
        textEl(run.handleShown, columnX + run.handleX, nameY, {
          size: handleSize,
          family: "PlateSans",
          fill: colors.muted,
        }),
      );
    }
    if (run.timeText) {
      parts.push(
        textEl(run.timeText, columnX + run.timeX, nameY, {
          size: handleSize,
          family: "PlateSans",
          fill: colors.muted,
        }),
      );
    }
  }

  bodyLines.forEach((line, i) => {
    const runs = colorRuns(line, body.links).map((r) => ({
      text: r.text,
      fill: r.link ? LINK : colors.body,
    }));
    drawRuns(parts, runs, bodyX, laid.bodyYs[i], spec.bodySize);
  });

  if (footerRuns.length && laid.footerTop != null) {
    drawRuns(parts, footerRuns, left, laid.footerTop + spec.timeSize, spec.timeSize);
  }

  if (laid.dividerY != null) {
    parts.push(rect(left, laid.dividerY, right - left, 1, 0, colors.divider));
  }

  if (showActions && laid.actionsTop != null) {
    const rowX = spec.footer === "icons" ? bodyX : left;
    const rowW = spec.footer === "icons" ? bodyW : right - left;
    const big = spec.footer === "detail" || rowW >= 420;
    const iconSize = spec.footer === "detail" ? 22 : big ? 18 : 15;
    const countSize = spec.footer === "detail" ? 15 : big ? 14 : 12;
    const slot = rowW / TIMELINE_ACTIONS.length;
    TIMELINE_ACTIONS.forEach(([icon, field, key], index) => {
      const last = index === TIMELINE_ACTIONS.length - 1;
      const x = last ? rowX + rowW - iconSize : rowX + index * slot;
      parts.push(iconAt(icon, x, laid.actionsTop, iconSize, colors.muted));
      const count = shownCount(post, field, key, opts);
      if (count == null) return;
      parts.push(
        textEl(compactCount(count), x + iconSize + 6, laid.actionsTop + iconSize * 0.5 + countSize * 0.36, {
          size: countSize,
          family: "PlateSans",
          fill: colors.muted,
        }),
      );
    });
  }

  if (showMark) {
    const markX = right - spec.markSize;
    const markY = spec.header === "stack" ? top + 4 : top + (Math.min(headerH, avatar) - spec.markSize) / 2;
    parts.push(markAt(loadLogo(), markX, markY, spec.markSize, colors.mark));
  }

  let photos = [];
  if (photoCells.length && laid.photoTop != null) {
    photos = photoCells.map((cell, index) => ({
      url: photoUrls[index],
      x: bodyX + cell.x,
      y: laid.photoTop + cell.y,
      w: cell.w,
      h: cell.h,
      radius: cell.radius,
      corners: cell.corners,
    }));
  }

  parts.push(`</svg>`);
  return { svg: parts.join("\n"), width, height, photos, avatar: avatarSlot };
}

function metricsHidden(opts) {
  return opts.metricsExplicit === true && Array.isArray(opts.metrics) && opts.metrics.length === 0;
}

function detailFooterRuns(clock, views, colors) {
  const runs = [];
  if (clock) runs.push({ text: clock, fill: colors.muted });
  if (views != null) {
    if (runs.length) runs[0].text += " · ";
    const n = Number(views);
    runs.push({ text: compactCount(n), fill: colors.name, bold: true });
    runs.push({ text: n === 1 ? " View" : " Views", fill: colors.muted });
  }
  return runs;
}

// Draw a line of colored runs as one <text> with a <tspan> per run, so resvg
// shapes and advances the whole line itself and each run starts exactly where
// the previous one ends (kerning included).
function drawRuns(parts, runs, x, y, size) {
  const solid = runs.filter((r) => r.text);
  if (!solid.length) return;
  const split = solid.map((run) => splitEmoji(run.text, glyphCoverage(!!run.bold)));
  if (split.some((pieces) => pieces.some((p) => p.emoji))) {
    // Emoji in the line: place each run's pieces at measured x instead of one <text>.
    let cursor = x;
    solid.forEach((run, i) => {
      cursor = placePieces(parts, split[i], cursor, y, size, {
        family: run.bold ? "PlateSansBold" : "PlateSans",
        fill: run.fill,
      });
    });
    return;
  }
  if (solid.length === 1 || solid.every((r) => r.fill === solid[0].fill && !!r.bold === !!solid[0].bold)) {
    const text = solid.map((r) => r.text).join("");
    parts.push(textEl(text, x, y, { size, family: solid[0].bold ? "PlateSansBold" : "PlateSans", fill: solid[0].fill }));
    return;
  }
  const base = solid[0];
  const spans = solid.map((run) => {
    const weight = !!run.bold !== !!base.bold ? ` font-weight="${run.bold ? 700 : 400}"` : "";
    return `<tspan fill="${run.fill}"${weight}>${glyphText(run.text, !!run.bold)}</tspan>`;
  });
  parts.push(
    `<text x="${x}" y="${y}" ${fontAttrs(base.bold ? "PlateSansBold" : "PlateSans")} font-size="${size}" fill="${base.fill}" xml:space="preserve">${spans.join("")}</text>`,
  );
}

function escapeRe(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Split a line into plain and link-colored runs: display URLs, raw URLs,
// @mentions, #hashtags, and $cashtags.
export function colorRuns(line, links = []) {
  const known = links.filter(Boolean).map(escapeRe);
  const pattern = new RegExp(
    [
      ...known,
      "https?:\\/\\/\\S+",
      "(?<![\\w@])@\\w{1,15}",
      "(?<![\\w&#])#[\\p{L}\\p{N}_]*[\\p{L}_][\\p{L}\\p{N}_]*",
      "(?<![\\w$])\\$[A-Za-z]{1,6}(?![\\w])",
    ].join("|"),
    "gu",
  );
  const runs = [];
  let last = 0;
  for (const match of String(line).matchAll(pattern)) {
    if (match.index > last) runs.push({ text: line.slice(last, match.index), link: false });
    runs.push({ text: match[0], link: true });
    last = match.index + match[0].length;
  }
  if (last < line.length) runs.push({ text: line.slice(last), link: false });
  return runs;
}

// Body text for an image. stripMedia drops the media t.co link (its photo is drawn);
// expandLinks trims leading reply mentions and swaps link t.co URLs for display URLs.
export function bodyText(post, { stripMedia, expandLinks }) {
  let text = String(post.text ?? "");
  const range = post.display_text_range;
  if (expandLinks && Array.isArray(range) && range[0] > 0) {
    text = Array.from(text).slice(range[0]).join("");
  }
  const entities = post.entities || {};
  if (stripMedia) {
    const media = Array.isArray(entities.media) ? entities.media.map((m) => m && m.url).filter(Boolean) : [];
    if (media.length) {
      for (const url of media) text = text.split(url).join("");
    } else {
      text = text.replace(/\s*https:\/\/t\.co\/\w+\s*$/, "");
    }
    text = text.replace(/[ \t]+$/gm, "").trimEnd();
  }
  const links = [];
  if (expandLinks && Array.isArray(entities.urls)) {
    for (const item of entities.urls) {
      if (!item || !item.url || !item.display_url || !text.includes(item.url)) continue;
      text = text.split(item.url).join(item.display_url);
      links.push(item.display_url);
    }
  }
  return { text, links };
}

// Word wrap by measured font width (falls back to the character estimate).
export function wrapWidth(text, maxWidth, fontSize) {
  const lines = [];
  const paragraphs = String(text).replace(/\r\n/g, "\n").split("\n");
  paragraphs.forEach((para, index) => {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) {
      if (index !== paragraphs.length - 1) lines.push("");
      return;
    }
    let current = "";
    for (const word of words) {
      for (const piece of splitByWidth(word, maxWidth, fontSize)) {
        if (!current) current = piece;
        else if (textWidth(`${current} ${piece}`, fontSize) <= maxWidth) current += ` ${piece}`;
        else {
          lines.push(current);
          current = piece;
        }
      }
    }
    if (current) lines.push(current);
  });
  return lines;
}

function splitByWidth(word, maxWidth, fontSize) {
  if (textWidth(word, fontSize) <= maxWidth) return [word];
  const pieces = [];
  let current = "";
  for (const ch of graphemes(word)) {
    if (current && textWidth(current + ch, fontSize) > maxWidth) {
      pieces.push(current);
      current = ch;
    } else {
      current += ch;
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

// x.com media: one rounded block with 2px gutters, only the outer corners round.
const FAITHFUL_GAP = 2;
const FAITHFUL_RADIUS = 16;

function faithfulGrid(width, count) {
  const n = Math.min(count, 4);
  if (n <= 0 || width < 80) return [];
  const W = width;
  const H = Math.min(PHOTO_BLOCK_MAX + 80, Math.max(1, Math.round((W * 9) / 16)));
  const g = FAITHFUL_GAP;
  const r = FAITHFUL_RADIUS;
  const cell = (x, y, w, h, corners) => ({ x, y, w, h, radius: r, corners });
  if (n === 1) return [cell(0, 0, W, H, { tl: 1, tr: 1, bl: 1, br: 1 })];
  const w1 = Math.floor((W - g) / 2);
  const w2 = W - g - w1;
  if (n === 2) {
    return [cell(0, 0, w1, H, { tl: 1, bl: 1 }), cell(w1 + g, 0, w2, H, { tr: 1, br: 1 })];
  }
  const h1 = Math.floor((H - g) / 2);
  const h2 = H - g - h1;
  if (n === 3) {
    return [
      cell(0, 0, w1, H, { tl: 1, bl: 1 }),
      cell(w1 + g, 0, w2, h1, { tr: 1 }),
      cell(w1 + g, h1 + g, w2, h2, { br: 1 }),
    ];
  }
  return [
    cell(0, 0, w1, h1, { tl: 1 }),
    cell(w1 + g, 0, w2, h1, { tr: 1 }),
    cell(0, h1 + g, w1, h2, { bl: 1 }),
    cell(w1 + g, h1 + g, w2, h2, { br: 1 }),
  ];
}

function layoutInline({ name, username, verified, timeLabel, nameSize, handleSize, maxW }) {
  const gap = 6;
  const check = verified ? Math.max(13, Math.round(nameSize * 0.92)) : 0;
  const checkGap = verified ? 3 : 0;
  // Leading spaces collapse in SVG text, so the gap before "·" is an x offset, not a space.
  const timeText = timeLabel ? `· ${timeLabel}` : "";
  const timeW = textWidth(timeText ? ` ${timeText}` : "", handleSize);
  let budget = maxW - timeW - (timeText ? gap : 0);
  if (verified) budget -= check + checkGap;
  const nameFull = String(name || "");
  const handleFull = `@${username || ""}`;
  const nameNat = textWidth(nameFull, nameSize, true);
  const handleNat = textWidth(handleFull, handleSize);
  let nameShown = nameFull;
  let handleShown = handleFull;
  if (nameNat + gap + handleNat > budget) {
    const minName = textWidth("…", nameSize, true);
    const minHandle = textWidth("@…", handleSize);
    if (nameNat + gap + minHandle <= budget) {
      handleShown = ellipsize(handleFull, budget - gap - nameNat, handleSize);
    } else {
      const handleBudget = Math.max(0, Math.min(budget * 0.46, budget - gap - minName));
      handleShown = handleBudget >= minHandle ? ellipsize(handleFull, handleBudget, handleSize) : "";
      const nameBudget = budget - (handleShown ? gap + textWidth(handleShown, handleSize) : 0);
      nameShown = ellipsize(nameFull, Math.max(minName, nameBudget), nameSize, true);
    }
  }
  const nameW = textWidth(nameShown, nameSize, true);
  const afterName = nameW + (verified ? checkGap + check : 0);
  const handleX = afterName + (handleShown ? gap : 0);
  const handleW = handleShown ? textWidth(handleShown, handleSize) : 0;
  const timeX = handleShown ? handleX + handleW + textWidth(" ", handleSize) : afterName + (timeText ? gap : 0);
  return {
    nameShown,
    handleShown,
    timeText,
    check,
    checkX: roundPx(nameW + checkGap),
    handleX: roundPx(handleX),
    timeX: roundPx(timeX),
  };
}

function shownCount(post, field, key, opts) {
  if (!field) return null;
  const value = post.public_metrics ? post.public_metrics[field] : null;
  if (value == null) return null;
  if (opts.metricsExplicit && !(opts.metrics || []).includes(key)) return null;
  return Number(value);
}

function shownViews(post, opts) {
  const value = post.public_metrics ? post.public_metrics.impression_count : null;
  if (value == null) return null;
  if (opts.metricsExplicit && !(opts.metrics || []).includes("views")) return null;
  return Number(value);
}

function compactCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  const sign = n < 0 ? "-" : "";
  const v = Math.abs(Math.trunc(n));
  if (v < 1000) return sign + String(v);
  const units = [
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  for (let i = 0; i < units.length; i++) {
    const [div, suffix] = units[i];
    if (v < div) continue;
    const digits = v / div >= 100 ? 0 : 1;
    let rounded = Number((v / div).toFixed(digits));
    if (rounded >= 1000 && i > 0) return `${sign}1${units[i - 1][1]}`;
    return sign + String(rounded).replace(/\.0$/, "") + suffix;
  }
  return sign + String(v);
}

// Width as drawn: font advances for text, EMOJI_ADVANCE em per painted emoji.
export function textWidth(text, fontSize, bold = false) {
  const value = String(text);
  if (!/[^\x00-\x7e]/.test(value)) return fontWidth(value, fontSize, bold);
  let w = 0;
  for (const piece of splitEmoji(value, glyphCoverage(bold))) w += pieceWidth(piece, fontSize, bold);
  return w;
}

function fontWidth(text, fontSize, bold = false) {
  const measure = fontMeasurer(bold);
  if (measure) return measure(String(text)) * fontSize;
  return String(text).length * fontSize * 0.56;
}

function ellipsize(text, maxWidth, fontSize, bold = false) {
  const value = String(text);
  if (maxWidth <= 0) return "";
  if (textWidth(value, fontSize, bold) <= maxWidth + 0.5) return value;
  const ell = "…";
  const units = graphemes(value);
  let keep = units.length;
  while (keep > 0 && textWidth(`${units.slice(0, keep).join("").trimEnd()}${ell}`, fontSize, bold) > maxWidth) keep -= 1;
  const sliced = units.slice(0, Math.max(0, keep)).join("").trimEnd();
  return sliced ? `${sliced}${ell}` : ell;
}

function iconAt(name, x, y, size, fill) {
  const scale = roundPx(size / 24);
  return `<g transform="translate(${roundPx(x)} ${roundPx(y)}) scale(${scale})"><path fill="${fill}" fill-rule="evenodd" d="${ACTION_ICONS[name]}"/></g>`;
}

// X's scalloped verified badge: blue for Premium, gold for organizations, gray for government.
const BADGE_ROSETTE =
  "M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91c-1.31.67-2.2 1.91-2.2 3.34s.89 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34z";
const BADGE_CHECK = "M10.54 16.2 6.8 12.46l1.41-1.42 2.26 2.26 4.8-5.23 1.47 1.36-6.2 6.77z";

function verifiedBadge(x, y, size, fill = VERIFIED_FILL.blue) {
  const scale = roundPx(size / 24);
  return `<g transform="translate(${roundPx(x)} ${roundPx(y)}) scale(${scale})"><path fill="${fill}" d="${BADGE_ROSETTE}"/><path fill="#FFFFFF" d="${BADGE_CHECK}"/></g>`;
}

function markAt(logo, x, y, size, fill) {
  const scale = size / logo.vbW;
  const tx = roundPx(x - logo.minX * scale);
  const ty = roundPx(y - logo.minY * scale);
  return `<g transform="translate(${tx} ${ty}) scale(${roundPx(scale)})"><path fill="${fill}" d="${xmlEscape(logo.d)}"/></g>`;
}
