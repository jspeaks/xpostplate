import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { brotliDecompressSync } from "node:zlib";

// Color emoji from the bundled Twemoji set (CC-BY 4.0, see assets/emoji/). Each
// emoji grapheme in post text becomes one inline <svg> drawn where the text
// measurement left room for it, so resvg needs no emoji font and nothing is
// fetched at render time. The set loads on first use (about 50 ms), so posts
// without emoji never pay for it.
const EMOJI_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../assets/emoji/twemoji.json.br");

// x.com draws emoji at 1.2em with 0.075em on each side, sitting a bit below the baseline.
export const EMOJI_SIZE = 1.2;
export const EMOJI_MARGIN = 0.075;
export const EMOJI_ADVANCE = EMOJI_SIZE + EMOJI_MARGIN * 2;
const EMOJI_DROP = 0.24;

let table = null;

function loadTable() {
  if (table) return table;
  try {
    table = JSON.parse(brotliDecompressSync(readFileSync(EMOJI_FILE)).toString("utf8")).emoji || {};
  } catch {
    // A missing or damaged asset degrades to the old behavior: emoji keep their
    // space but are not painted.
    table = {};
  }
  return table;
}

const segmenter = typeof Intl !== "undefined" && Intl.Segmenter ? new Intl.Segmenter("en", { granularity: "grapheme" }) : null;

const PICTO = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;
const MAYBE = /[\u00a9\u00ae\u203c-\u3299\u20e3\u200d\ufe0f]|[\u{1f000}-\u{1faff}]|[\u{e0020}-\u{e007f}]/u;
const PRESENTATION = /^\p{Emoji_Presentation}$/u;
const SKIN = /[\u{1f3fb}-\u{1f3ff}]/u;

// Grapheme clusters. Intl.Segmenter keeps ZWJ families, skin tones, flags, tag
// flags, and keycaps whole; the fallback (no ICU) joins the same pieces by hand.
export function graphemes(text) {
  const value = String(text);
  if (segmenter) return Array.from(segmenter.segment(value), (s) => s.segment);
  const out = [];
  const cps = Array.from(value);
  for (let i = 0; i < cps.length; i++) {
    let g = cps[i];
    const ri = (cp) => cp >= 0x1f1e6 && cp <= 0x1f1ff;
    if (ri(g.codePointAt(0)) && i + 1 < cps.length && ri(cps[i + 1].codePointAt(0))) g += cps[++i];
    while (i + 1 < cps.length) {
      const next = cps[i + 1].codePointAt(0);
      const joiner = next === 0x200d && i + 2 < cps.length;
      const extend = next === 0xfe0f || next === 0xfe0e || next === 0x20e3 || (next >= 0x1f3fb && next <= 0x1f3ff) ||
        (next >= 0xe0020 && next <= 0xe007f) || (next >= 0x300 && next <= 0x36f);
      if (joiner) {
        g += cps[++i] + cps[++i];
      } else if (extend) {
        g += cps[++i];
      } else break;
    }
    out.push(g);
  }
  return out;
}

// Lookup key: lowercase hex code points joined by "-", FE0F removed (as the asset is keyed).
export function emojiKey(grapheme) {
  return Array.from(String(grapheme), (ch) => ch.codePointAt(0))
    .filter((cp) => cp !== 0xfe0f)
    .map((cp) => cp.toString(16))
    .join("-");
}

// Is this grapheme an emoji to paint in color? Multi-code-point sequences (ZWJ,
// skin tone, flag, keycap, FE0F) always are. A lone pictograph is when it has
// emoji presentation by default, or when the text face has no glyph for it.
// Symbols like ©, ®, ™, and ↔ stay text when the face draws them, as on x.com.
export function isEmoji(grapheme, hasGlyph) {
  const g = String(grapheme);
  if (!MAYBE.test(g)) return false;
  const cps = Array.from(g, (ch) => ch.codePointAt(0));
  if (cps.includes(0xfe0e)) return false;
  if (cps.includes(0x20e3)) return cps.includes(0xfe0f) || cps.length === 2;
  if (!PICTO.test(g)) return false;
  if (cps.length > 1) return true;
  if (PRESENTATION.test(g)) return true;
  return hasGlyph ? !hasGlyph(cps[0]) : true;
}

// The Twemoji graphic for a grapheme: exact, then without skin tone, then the
// first pictograph. Null when the set has nothing close.
export function emojiGraphic(grapheme) {
  const set = loadTable();
  const key = emojiKey(grapheme);
  const tries = [key, emojiKey(String(grapheme).replace(new RegExp(SKIN.source, "gu"), ""))];
  const first = Array.from(String(grapheme)).find((ch) => PICTO.test(ch));
  if (first) tries.push(emojiKey(first));
  for (const k of tries) {
    const hit = k && set[k];
    if (hit) return typeof hit === "string" ? { viewBox: "0 0 36 36", body: hit, key: k } : { viewBox: hit[0], body: hit[1], key: k };
  }
  return null;
}

// Split text into plain runs and emoji graphemes that have a graphic.
export function splitEmoji(text, hasGlyph) {
  const value = String(text);
  const parts = [];
  if (!MAYBE.test(value)) return value ? [{ text: value }] : [];
  let run = "";
  for (const g of graphemes(value)) {
    const graphic = isEmoji(g, hasGlyph) ? emojiGraphic(g) : null;
    if (graphic) {
      if (run) parts.push({ text: run });
      run = "";
      parts.push({ emoji: g, graphic });
    } else {
      run += g;
    }
  }
  if (run) parts.push({ text: run });
  return parts;
}

export function hasEmoji(text, hasGlyph) {
  const value = String(text);
  if (!MAYBE.test(value)) return false;
  return splitEmoji(value, hasGlyph).some((p) => p.emoji);
}

let idSeq = 0;

// One emoji as a nested <svg> whose em box starts at x (the left margin is
// inside the advance) on baseline y. Twemoji ids are made unique per use.
export function emojiSvg(graphic, x, baseline, fontSize) {
  const size = round(fontSize * EMOJI_SIZE);
  const left = round(x + fontSize * EMOJI_MARGIN);
  const top = round(baseline + fontSize * EMOJI_DROP - size);
  let body = graphic.body;
  if (body.includes('id="')) {
    const prefix = `xe${(idSeq += 1)}-`;
    body = body.replace(/\bid="([^"]+)"/g, `id="${prefix}$1"`).replace(/url\(#([^)]+)\)/g, `url(#${prefix}$1)`)
      .replace(/href="#([^"]+)"/g, `href="#${prefix}$1"`);
  }
  return `<svg x="${left}" y="${top}" width="${size}" height="${size}" viewBox="${graphic.viewBox}">${body}</svg>`;
}

function round(n) {
  return Math.round(n * 100) / 100;
}
