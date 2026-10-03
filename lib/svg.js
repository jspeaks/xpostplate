import { formatPostTime } from "./post.js";

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
  const nameMaxW = width - pad - nameX;

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

  const measure = (lineCount) => {
    let cursor = avatarY + avatar + 26;
    const bodyYs = [];
    for (let i = 0; i < lineCount; i++) bodyYs.push(cursor + bodySize + i * bodyLeading);
    if (bodyYs.length) cursor = bodyYs[bodyYs.length - 1];

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

    return { bodyYs, timeY, dividerY, metricLines, height: Math.round(cursor + pad) };
  };

  let bodyLines = allBodyLines;
  if (opts.maxHeight != null) {
    const minHeight = measure(0).height;
    if (minHeight > opts.maxHeight) {
      throw new Error(
        `Plate header and footer are ${minHeight}px tall, above --max-height ${opts.maxHeight}. The footer and border are not clipped.`,
      );
    }
    let keep = allBodyLines.length;
    while (keep > 0 && measure(keep).height > opts.maxHeight) keep -= 1;
    if (keep < allBodyLines.length) {
      bodyLines = keep === 0 ? [] : allBodyLines.slice(0, keep - 1).concat("…");
    }
  }

  const laid = measure(bodyLines.length);
  const { bodyYs, timeY, dividerY, metricLines } = laid;
  const height = laid.height;
  const timeLabel = formatPostTime(post.created_at);
  const parts = [];
  parts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
  );

  // ImageMagick's SVG renderer drops stroke, so the accent border is a larger
  // rounded rect sitting behind the fill.
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

  parts.push(`</svg>`);
  return { svg: parts.join("\n"), width, height };
}

function resolveMetricKeys(opts) {
  if (Array.isArray(opts.metrics)) {
    const picked = new Set(opts.metrics);
    return METRIC_ORDER.filter((key) => picked.has(key));
  }
  return opts.mode === "full" ? METRIC_ORDER.slice() : [];
}

function metricChunks(metrics, keys) {
  return keys.map((key) => {
    const [field, one, many] = METRIC_FIELDS[key];
    return countLabel(metrics[field], one, many);
  });
}

function countLabel(value, one, many) {
  const n = Number(value) || 0;
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
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
