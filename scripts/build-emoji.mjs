#!/usr/bin/env node
// Builds assets/emoji/twemoji.json.br from the official Twemoji SVGs.
//
//   git clone --depth 1 --filter=blob:none --sparse --branch v17.0.3 https://github.com/jdecked/twemoji.git /tmp/twemoji
//   git -C /tmp/twemoji sparse-checkout set assets/svg
//   node scripts/build-emoji.mjs /tmp/twemoji/assets/svg v17.0.3
//
// Output: one brotli-compressed JSON object keyed by lowercase hex code points
// joined with "-", with every U+FE0F removed (lib/emoji.js strips FE0F the same
// way before lookup). A value is the SVG's inner markup, or [viewBox, inner]
// when the viewBox is not Twemoji's usual "0 0 36 36".
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const [dir, version = "unknown"] = process.argv.slice(2);
if (!dir) {
  console.error("usage: node scripts/build-emoji.mjs <twemoji/assets/svg> [version]");
  process.exit(1);
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = {};
let count = 0;
for (const file of readdirSync(dir).sort()) {
  if (!file.endsWith(".svg")) continue;
  const raw = readFileSync(path.join(dir, file), "utf8").trim();
  const match = raw.match(/^<svg\b([^>]*)>([\s\S]*)<\/svg>$/);
  if (!match) throw new Error(`Unexpected SVG shape: ${file}`);
  const viewBox = (match[1].match(/viewBox="([^"]+)"/) || [])[1] || "0 0 36 36";
  const inner = match[2].replace(/>\s+</g, "><").trim();
  const key = file.slice(0, -4).split("-").filter((cp) => cp !== "fe0f").join("-");
  if (out[key]) throw new Error(`Duplicate key after FE0F removal: ${key}`);
  out[key] = viewBox === "0 0 36 36" ? inner : [viewBox, inner];
  count += 1;
}
const json = JSON.stringify({ version, emoji: out });
const packed = zlib.brotliCompressSync(json, {
  params: {
    [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
    [zlib.constants.BROTLI_PARAM_SIZE_HINT]: json.length,
  },
});
const target = path.join(root, "assets/emoji/twemoji.json.br");
writeFileSync(target, packed);
console.log(`${count} emoji, ${json.length} bytes JSON, ${packed.length} bytes brotli -> ${path.relative(root, target)}`);
