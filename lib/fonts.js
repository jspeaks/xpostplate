import { accessSync, constants, readFileSync } from "node:fs";

// The same TrueType files png.js hands resvg (system fonts off). svg.js reads
// their advance widths so wrapping, the verified check, and the header runs line
// up with what resvg actually draws, and names their family in the SVG.
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

let familyCache = null;

// Family names resvg matches the SVG's font-family against, read from each file's
// name table so the SVG asks for exactly the faces png.js loads.
export function fontFamilies() {
  if (familyCache) return familyCache;
  const fonts = findFonts();
  const read = (file, fallback) => {
    try {
      return familyName(readFileSync(file)) || fallback;
    } catch {
      return fallback;
    }
  };
  const regular = read(fonts.regular, "sans-serif");
  familyCache = { regular, bold: fonts.bold === fonts.regular ? regular : read(fonts.bold, regular) };
  return familyCache;
}

function familyName(buf) {
  if (buf.length < 12) return null;
  const numTables = buf.readUInt16BE(4);
  let name = null;
  for (let i = 0; i < numTables; i++) {
    const at = 12 + i * 16;
    if (at + 16 > buf.length) return null;
    if (buf.toString("ascii", at, at + 4) === "name") name = buf.readUInt32BE(at + 8);
  }
  if (name == null) return null;
  const count = buf.readUInt16BE(name + 2);
  const strings = name + buf.readUInt16BE(name + 4);
  const found = {};
  for (let i = 0; i < count; i++) {
    const rec = name + 6 + i * 12;
    const platform = buf.readUInt16BE(rec);
    const encoding = buf.readUInt16BE(rec + 2);
    const language = buf.readUInt16BE(rec + 4);
    const id = buf.readUInt16BE(rec + 6);
    if (id !== 1 && id !== 16) continue;
    const length = buf.readUInt16BE(rec + 8);
    const start = strings + buf.readUInt16BE(rec + 10);
    const raw = buf.subarray(start, start + length);
    let text = null;
    if (platform === 3 && (encoding === 1 || encoding === 10) && language === 0x409) {
      text = raw.swap16 ? Buffer.from(raw).swap16().toString("utf16le") : null;
    } else if (platform === 1 && encoding === 0 && language === 0) {
      text = raw.toString("latin1");
    }
    if (text && !found[id]) found[id] = text;
  }
  return found[16] || found[1] || null;
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

// Returns (codePoint) => true when the face has a glyph for it, or null when no
// font parses. svg.js hides characters the face lacks (emoji, CJK) instead of
// letting resvg paint .notdef boxes; their advance still counts, as measured.
export function glyphCoverage(bold = false) {
  const key = bold ? "bold" : "regular";
  if (coverageCache.has(key)) return coverageCache.get(key);
  let has = null;
  try {
    const fonts = findFonts();
    const table = parseTtf(readFileSync(bold ? fonts.bold : fonts.regular));
    if (table) has = (cp) => table.glyph(cp) !== 0;
  } catch {
    has = null;
  }
  coverageCache.set(key, has);
  return has;
}

const coverageCache = new Map();

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
