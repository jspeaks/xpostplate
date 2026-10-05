import { accessSync, constants, readFileSync } from "node:fs";

// The same TrueType files png.js hands ImageMagick. svg.js reads their advance
// widths so wrapping, the verified check, and colored body runs line up with
// what magick actually draws.
const FONT_CANDIDATES = [
  {
    regular: "/System/Library/Fonts/Supplemental/Arial.ttf",
    bold: "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
  },
  {
    regular: "/Library/Fonts/Arial.ttf",
    bold: "/Library/Fonts/Arial Bold.ttf",
  },
  {
    regular: "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    bold: "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  },
  {
    regular: "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    bold: "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
  },
];

export function findFonts() {
  for (const candidate of FONT_CANDIDATES) {
    if (!isReadable(candidate.regular)) continue;
    return {
      regular: candidate.regular,
      bold: isReadable(candidate.bold) ? candidate.bold : candidate.regular,
    };
  }
  throw new Error(
    "No TrueType font found for plate text. Expected Arial, DejaVu Sans, or Liberation Sans.",
  );
}

const metricCache = new Map();

// Returns a function (text) => width in em units, or null when no font parses.
export function fontMeasurer(bold = false) {
  const key = bold ? "bold" : "regular";
  if (metricCache.has(key)) return metricCache.get(key);
  let measure = null;
  try {
    const fonts = findFonts();
    const table = parseTtf(readFileSync(bold ? fonts.bold : fonts.regular));
    if (table) {
      measure = (text) => {
        let units = 0;
        for (const ch of String(text)) {
          const gid = table.glyph(ch.codePointAt(0));
          units += table.advance(gid);
        }
        return units / table.unitsPerEm;
      };
    }
  } catch {
    measure = null;
  }
  metricCache.set(key, measure);
  return measure;
}

function parseTtf(buf) {
  if (buf.length < 12) return null;
  const numTables = buf.readUInt16BE(4);
  const tables = {};
  for (let i = 0; i < numTables; i++) {
    const at = 12 + i * 16;
    if (at + 16 > buf.length) return null;
    tables[buf.toString("ascii", at, at + 4)] = { offset: buf.readUInt32BE(at + 8), length: buf.readUInt32BE(at + 12) };
  }
  const { head, hhea, hmtx, cmap } = tables;
  if (!head || !hhea || !hmtx || !cmap) return null;
  const unitsPerEm = buf.readUInt16BE(head.offset + 18);
  const numberOfHMetrics = buf.readUInt16BE(hhea.offset + 34);
  if (!unitsPerEm || !numberOfHMetrics) return null;
  const advance = (gid) => {
    const index = Math.min(gid, numberOfHMetrics - 1);
    return buf.readUInt16BE(hmtx.offset + index * 4);
  };
  const glyph = cmapLookup(buf, cmap.offset);
  if (!glyph) return null;
  return { unitsPerEm, advance, glyph };
}

function cmapLookup(buf, base) {
  const count = buf.readUInt16BE(base + 2);
  let fmt4 = null;
  let fmt12 = null;
  for (let i = 0; i < count; i++) {
    const rec = base + 4 + i * 8;
    const platform = buf.readUInt16BE(rec);
    const encoding = buf.readUInt16BE(rec + 2);
    const sub = base + buf.readUInt32BE(rec + 4);
    const format = buf.readUInt16BE(sub);
    const unicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
    if (!unicode) continue;
    if (format === 12 && fmt12 == null) fmt12 = sub;
    if (format === 4 && fmt4 == null) fmt4 = sub;
  }
  const cache = new Map();
  const lookup12 = (cp) => {
    const groups = buf.readUInt32BE(fmt12 + 12);
    let lo = 0;
    let hi = groups - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const at = fmt12 + 16 + mid * 12;
      const start = buf.readUInt32BE(at);
      const end = buf.readUInt32BE(at + 4);
      if (cp < start) hi = mid - 1;
      else if (cp > end) lo = mid + 1;
      else return buf.readUInt32BE(at + 8) + (cp - start);
    }
    return 0;
  };
  const lookup4 = (cp) => {
    if (cp > 0xffff) return 0;
    const segX2 = buf.readUInt16BE(fmt4 + 6);
    const ends = fmt4 + 14;
    const starts = ends + segX2 + 2;
    const deltas = starts + segX2;
    const ranges = deltas + segX2;
    for (let i = 0; i < segX2; i += 2) {
      const end = buf.readUInt16BE(ends + i);
      if (cp > end) continue;
      const start = buf.readUInt16BE(starts + i);
      if (cp < start) return 0;
      const delta = buf.readInt16BE(deltas + i);
      const rangeOffset = buf.readUInt16BE(ranges + i);
      if (rangeOffset === 0) return (cp + delta) & 0xffff;
      const at = ranges + i + rangeOffset + (cp - start) * 2;
      const gid = buf.readUInt16BE(at);
      return gid === 0 ? 0 : (gid + delta) & 0xffff;
    }
    return 0;
  };
  if (fmt12 == null && fmt4 == null) return null;
  return (cp) => {
    if (cache.has(cp)) return cache.get(cp);
    const gid = fmt12 != null ? lookup12(cp) : lookup4(cp);
    cache.set(cp, gid);
    return gid;
  };
}

function isReadable(file) {
  try {
    accessSync(file, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}
