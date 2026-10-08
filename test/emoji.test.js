import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { parseCli } from "../lib/args.js";
import { EMOJI_ADVANCE, emojiGraphic, emojiKey, graphemes, isEmoji, splitEmoji } from "../lib/emoji.js";
import { normalizePost } from "../lib/post.js";
import { renderSvg, textWidth, wrapWidth } from "../lib/svg.js";

const bin = fileURLToPath(new URL("../bin/xpostplate.js", import.meta.url));
const fixture = fileURLToPath(new URL("../fixtures/emoji-post.json", import.meta.url));
const post = normalizePost(JSON.parse(readFileSync(fixture, "utf8")));

const FAMILY = "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}";
const WAVE_MEDIUM = "\u{1F44B}\u{1F3FD}";
const FLAG_JP = "\u{1F1EF}\u{1F1F5}";
const KEYCAP_1 = "1\uFE0F\u20E3";
const ROCKET = "\u{1F680}";
const HEART = "\u2764\uFE0F";
const SCOTLAND = "\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}";

test("graphemes keep ZWJ families, skin tones, flags, tag flags, and keycaps whole", () => {
  const text = `a ${FAMILY} ${WAVE_MEDIUM} ${FLAG_JP} ${SCOTLAND} ${KEYCAP_1} ${ROCKET}`;
  const emoji = graphemes(text).filter((g) => g.trim() && g !== "a");
  assert.deepEqual(emoji, [FAMILY, WAVE_MEDIUM, FLAG_JP, SCOTLAND, KEYCAP_1, ROCKET]);
});

test("every fixture emoji maps to a bundled Twemoji graphic, FE0F-insensitive", () => {
  assert.equal(emojiKey(HEART), "2764");
  assert.equal(emojiKey(KEYCAP_1), "31-20e3");
  for (const g of [FAMILY, WAVE_MEDIUM, FLAG_JP, SCOTLAND, KEYCAP_1, ROCKET, HEART, "\u{1F6E0}\uFE0F"]) {
    const graphic = emojiGraphic(g);
    assert.ok(graphic, `graphic for ${emojiKey(g)}`);
    assert.equal(graphic.key, emojiKey(g), "exact match, no fallback");
    assert.match(graphic.viewBox, /^\d/);
    assert.ok(graphic.body.includes("<path") || graphic.body.includes("<circle"));
  }
});

test("symbols the text face draws (©, ™, digits, #) stay text; emoji presentation paints", () => {
  const face = (cp) => cp < 0x2000 || cp === 0x2122;
  assert.equal(isEmoji("\u00A9", face), false);
  assert.equal(isEmoji("\u2122", face), false);
  assert.equal(isEmoji("1", face), false);
  assert.equal(isEmoji("#", face), false);
  assert.equal(isEmoji(HEART, face), true);
  assert.equal(isEmoji("\u2764", face), true, "bare heart has no glyph in the face");
  assert.equal(isEmoji(ROCKET, face), true);
  assert.equal(isEmoji(KEYCAP_1, face), true);
  const parts = splitEmoji(`ok ${ROCKET}!`, face);
  assert.deepEqual(parts.map((p) => p.emoji || p.text), ["ok ", ROCKET, "!"]);
});

test("measurement counts each emoji as one EMOJI_ADVANCE, and wrapping respects it", () => {
  const size = 20;
  const base = textWidth("ab", size);
  for (const g of [FAMILY, WAVE_MEDIUM, FLAG_JP, KEYCAP_1, ROCKET]) {
    assert.ok(Math.abs(textWidth(`a${g}b`, size) - base - EMOJI_ADVANCE * size) < 0.01, emojiKey(g));
  }
  const line = Array(40).fill(FAMILY).join(" ");
  const lines = wrapWidth(line, 300, size);
  assert.ok(lines.length > 1);
  for (const l of lines) assert.ok(textWidth(l, size) <= 300, "every wrapped line fits");
  assert.ok(lines.every((l) => graphemes(l).every((g) => g === FAMILY || g === " ")), "no family split apart");
});

function emojiCount(svg) {
  return (svg.match(/<svg x="/g) || []).length;
}

test("every view and theme paints the fixture emoji as inline Twemoji", () => {
  for (const view of ["detail", "timeline", "quote", "plate"]) {
    for (const theme of ["light", "dark"]) {
      const out = renderSvg(post, parseCli(["--fixture", fixture, "--view", view, "--theme", theme]));
      // 8 in the body (party, family, wave, flag, keycap, rocket, heart, tools) + 1 in the name.
      assert.equal(emojiCount(out.svg), 9, `${view}/${theme}`);
      assert.ok(!out.svg.includes(ROCKET), `${view}/${theme}: no raw emoji left in <text>`);
      assert.ok(!out.svg.includes(`fill="none">${FAMILY}`), `${view}/${theme}: nothing hidden`);
      assert.ok(out.svg.includes("\u00A9"), "© stays text");
    }
  }
});

test("emoji ids (clip paths) are unique per use", () => {
  const maracas = "\u{1FA87}";
  const out = renderSvg({ ...post, text: `${maracas} ${maracas}` }, parseCli(["--fixture", fixture]));
  const ids = [...out.svg.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(ids.length >= 2);
  assert.equal(new Set(ids).size, ids.length);
});

async function redPixels(png) {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  let n = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i] > 180 && data[i + 1] < 90 && data[i + 2] < 110) n += 1;
  }
  return n;
}

test("CLI: --fabricate --text paints color emoji, offline, in both themes and the plate", async () => {
  for (const extra of [[], ["--theme", "dark"], ["--view", "plate"], ["--view", "timeline", "--theme", "dark"]]) {
    const png = execFileSync(process.execPath, [bin, "--fabricate", "--text", `Love it ${HEART}${HEART}${HEART}`, "-o", "-", ...extra], {
      maxBuffer: 1 << 24,
      stdio: ["ignore", "pipe", "ignore"],
    });
    assert.equal(png.subarray(1, 4).toString("ascii"), "PNG");
    assert.ok((await redPixels(png)) > 300, `red heart pixels (${extra.join(" ") || "default"})`);
  }
  const plain = execFileSync(process.execPath, [bin, "--fabricate", "--text", "Love it", "-o", "-"], {
    maxBuffer: 1 << 24,
    stdio: ["ignore", "pipe", "ignore"],
  });
  assert.equal(await redPixels(plain), 0, "no red without emoji");
});
