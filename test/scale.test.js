import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { helpText, MAX_OUTPUT_SIDE, parseCli, scaledSize } from "../lib/args.js";
import { compositePhotos, svgToPng } from "../lib/png.js";
import { photoUrlForPixels } from "../lib/post.js";

const bin = fileURLToPath(new URL("../bin/xpostplate.js", import.meta.url));
const emojiFixture = fileURLToPath(new URL("../fixtures/emoji-post.json", import.meta.url));

function render(args) {
  return execFileSync(process.execPath, [bin, ...args, "-o", "-"], { maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "pipe"] });
}
const size = (png) => ({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) });

test("--scale parses decimals and defaults to 1", () => {
  assert.equal(parseCli(["1"]).scale, 1);
  assert.equal(parseCli(["1", "--scale", "2"]).scale, 2);
  assert.equal(parseCli(["1", "--scale=1.5"]).scale, 1.5);
  assert.equal(parseCli(["1", "--scale", ".5"]).scale, 0.5);
  assert.equal(parseCli(["1", "--scale", "8"]).scale, 8);
});

test("--scale rejects values outside 0.5-8 and non-numbers", () => {
  for (const bad of ["0", "0.49", "8.01", "9", "-1", "abc", "2x", "1e1", "", "NaN", "Infinity"]) {
    assert.throws(() => parseCli(["1", "--scale", bad]), /--scale/, `rejects ${JSON.stringify(bad)}`);
  }
  assert.throws(() => parseCli(["1", "--scale"]), /--scale requires a value/);
});

test("--scale 1 is byte-identical to no --scale", () => {
  for (const args of [["--fixture"], ["--fixture", emojiFixture, "--theme", "dark"], ["--fixture", "--view", "plate"]]) {
    assert.ok(render(args).equals(render([...args, "--scale", "1"])), args.join(" "));
  }
});

test("--scale 2 doubles both sides exactly, in every view", () => {
  for (const view of ["detail", "timeline", "quote", "plate"]) {
    const one = size(render(["--fixture", emojiFixture, "--view", view]));
    const two = size(render(["--fixture", emojiFixture, "--view", view, "--scale", "2"]));
    assert.deepEqual(two, { width: one.width * 2, height: one.height * 2 }, view);
  }
});

test("--width sets layout, --scale multiplies it", () => {
  const layout = size(render(["--fixture", "--width", "600"]));
  const out = size(render(["--fixture", "--width", "600", "--scale", "3"]));
  assert.equal(layout.width, 600);
  assert.deepEqual(out, { width: 1800, height: layout.height * 3 });
  // Same pixels as --width 1800 would be a different (wider) layout, not the same one.
  const wide = size(render(["--fixture", "--width", "1800"]));
  assert.notEqual(wide.height, out.height);
  // Fractional scales round each side up, like resvg's zoom.
  const odd = size(render(["--fixture", "--width", "601", "--scale", "1.5"]));
  const odd1 = size(render(["--fixture", "--width", "601"]));
  assert.deepEqual(odd, scaledSize(odd1.width, odd1.height, 1.5));
  assert.equal(odd.width, 902);
});

test("--max-height is in layout pixels", () => {
  const out = size(render(["--fixture", "--max-height", "260", "--scale", "2"]));
  assert.ok(out.height <= 520, `height ${out.height}`);
  assert.equal(out.height, size(render(["--fixture", "--max-height", "260"])).height * 2);
});

test("--scale 3 is deterministic", () => {
  const args = ["--fixture", emojiFixture, "--scale", "3"];
  const a = render(args);
  const b = render(args);
  assert.ok(a.equals(b));
  assert.equal(size(a).width, 2400);
});

test("--scale past the per-side cap fails with a clear error", () => {
  const res = spawnSync(process.execPath, [bin, "--fixture", "--width", "4096", "--scale", "8", "-o", "-"], { encoding: "utf8" });
  assert.equal(res.status, 1);
  assert.match(res.stderr, new RegExp(`32768x\\d+ PNG .*limit is ${MAX_OUTPUT_SIDE} px per side`));
  assert.equal(res.stdout, "");
});

test("--json ignores --scale", () => {
  const plain = execFileSync(process.execPath, [bin, "--fixture", "--json"], { encoding: "utf8" });
  const scaled = execFileSync(process.execPath, [bin, "--fixture", "--json", "--scale", "3"], { encoding: "utf8" });
  assert.equal(scaled, plain);
});

test("photos composite at the scaled position and size", async () => {
  const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${body}</svg>`;
  const plate = await svgToPng(svg(100, 80, '<rect width="100" height="80" fill="#FFFFFF"/>'), { scale: 2 });
  assert.deepEqual(await sharp(plate).metadata().then((m) => [m.width, m.height]), [200, 160]);
  const photo = await svgToPng(svg(40, 20, '<rect width="20" height="20" fill="#FF0000"/><rect x="20" width="20" height="20" fill="#0000FF"/>'));
  const slot = { x: 10, y: 10, w: 40, h: 40, radius: 8, corners: { tl: 1, tr: 1, bl: 1, br: 1 } };
  const out = await compositePhotos(plate, [slot], [photo], { scale: 2 });
  const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
  const px = (x, y) => Array.from(data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3));
  assert.deepEqual(px(30, 60), [255, 0, 0], "left half red at 2x");
  assert.deepEqual(px(90, 60), [0, 0, 255], "right half blue at 2x");
  assert.deepEqual(px(21, 21), [255, 255, 255], "corner rounded at 2x radius");
  assert.deepEqual(px(25, 60), [255, 0, 0], "slot starts at x 20");
  assert.deepEqual(px(19, 60), [255, 255, 255], "nothing left of the slot");
  assert.deepEqual(px(100, 60), [255, 255, 255], "slot ends at x 100");
});

test("hi-res photo URLs only above the default 1200px", () => {
  const url = "https://pbs.twimg.com/media/abc.jpg";
  assert.equal(photoUrlForPixels(url, 0), url);
  assert.equal(photoUrlForPixels(url, 1200), url);
  assert.equal(photoUrlForPixels(url, 1800), `${url}?name=large`);
  assert.equal(photoUrlForPixels(url, 2400), `${url}?name=4096x4096`);
  assert.equal(photoUrlForPixels("https://example.com/a.jpg", 2400), "https://example.com/a.jpg");
});

test("--help explains width vs scale", () => {
  const help = helpText();
  assert.match(help, /--scale <n>/);
  assert.match(help, /width = layout, scale = pixel density/);
  assert.match(help, /--width 600 --scale 3/);
});
