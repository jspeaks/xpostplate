import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { formatPostTime } from "./post.js";

const logoFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../assets/x-logo.svg");
let logoCache = null;

const THEMES = {
  light: {
    bg: "#FFFFFF",
    name: "#0F1419",
    body: "#0F1419",
    muted: "#536471",
    divider: "#EFF3F4",
    onAccent: "#FFFFFF",
  },
  dark: {
    bg: "#15202B",
    name: "#F7F9F9",
    body: "#E7E9EA",
    muted: "#8B98A5",
    divider: "#38444D",
    onAccent: "#FFFFFF",
  },
};

const METRIC_ORDER = ["replies", "reposts", "quotes", "likes", "bookmarks", "views"];

const METRIC_FIELDS = {
  replies: ["reply_count", "reply", "replies"],
  reposts: ["retweet_count", "repost", "reposts"],
  quotes: ["quote_count", "quote", "quotes"],
  likes: ["like_count", "like", "likes"],
  bookmarks: ["bookmark_count", "bookmark", "bookmarks"],
  views: ["impression_count", "view", "views"],
};

export function renderSvg(post, opts) {
  const colors = THEMES[opts.theme];
  const width = opts.width;
  const border = opts.border;
  const radius = opts.radius;
  const pad = Math.max(32, border + 24);
  const avatar = 56;
  const contentW = width - pad * 2;
  const nameX = pad + avatar + 16;
  const showMark = opts.showMark !== false;
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
  const allBodyLines = post.text.trim() ? wrapText(post.text, contentW, bodySize) : [];
  const drawMedia = opts.showMedia === true && !opts.fixture && contentW >= 80;
  const photoUrls = drawMedia && Array.isArray(post.photos)
    ? post.photos.filter((url) => typeof url === "string" && url).slice(0, 4)
    : [];
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

  // ImageMagick's SVG renderer drops stroke, so the accent border is a larger
  // rounded rect sitting behind the fill. Photo pixels are composited onto the
  // PNG afterward; this SVG only reserves their box.
  if (border > 0) {
    parts.push(rect(0, 0, width, height, radius, opts.accent));
    const innerRadius = Math.max(0, radius - border);
    parts.push(rect(border, border, width - border * 2, height - border * 2, innerRadius, colors.bg));
  } else {
    parts.push(rect(0, 0, width, height, radius, colors.bg));
  }

  const avatarCx = pad + avatar / 2;
  const avatarCy = avatarY + avatar / 2;
  parts.push(
    `<circle cx="${avatarCx}" cy="${avatarCy}" r="${avatar / 2}" fill="${opts.accent}"/>`,
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
    const markFill = opts.theme === "dark" ? "#F7F9F9" : "#0F1419";
    parts.push(markEl(loadLogo(), markCorner, width, height, border, markFill));
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
    return { x: cell.x, y, w: cell.w, h };
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

function textEl(value, x, y, { size, family, fill, anchor }) {
  const anchorAttr = anchor ? ` text-anchor="${anchor}"` : "";
  return `<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" fill="${fill}"${anchorAttr}>${xmlEscape(value)}</text>`;
}

function initials(name) {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
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
        } else if (current.length + 1 + piece.length <= maxChars) {
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
    const add = current.length ? sep.length + chunk.length : chunk.length;
    if (current.length && len + add > maxChars) {
      lines.push(current.join(sep));
      current = [chunk];
      len = chunk.length;
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
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(1, maxChars - 3)).trimEnd()}...`;
}

function maxCharsFor(maxWidth, fontSize) {
  return Math.max(8, Math.floor(maxWidth / (fontSize * 0.56)));
}

function splitLong(word, maxChars) {
  if (word.length <= maxChars) return [word];
  const pieces = [];
  for (let i = 0; i < word.length; i += maxChars) pieces.push(word.slice(i, i + maxChars));
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
