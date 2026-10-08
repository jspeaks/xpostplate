import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { test } from "node:test";
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { helpText, parseCli } from "../lib/args.js";
import { compositePhotos, svgToPng } from "../lib/png.js";
import { normalizeSyndication } from "../lib/post.js";
import { bodyText, colorRuns, renderSvg, resolveAccent, resolveMark } from "../lib/svg.js";

const bin = fileURLToPath(new URL("../bin/xpostplate.js", import.meta.url));

// A syndication-shaped payload: four photos, a link, a mention, a business check.
const payload = {
  id_str: "1",
  text: "Ship 40 &amp; crew with @SpaceX, more at https://t.co/link1 https://t.co/media1",
  created_at: "2026-08-27T14:52:03.000Z",
  favorite_count: 34064,
  conversation_count: 1114,
  display_text_range: [0, 63],
  entities: {
    urls: [{ url: "https://t.co/link1", display_url: "spacex.com/updates", expanded_url: "https://spacex.com/updates" }],
    media: [{ url: "https://t.co/media1", display_url: "pic.x.com/abc", expanded_url: "https://x.com/SpaceX/status/1/photo/1" }],
  },
  user: {
    name: "SpaceX",
    screen_name: "SpaceX",
    is_blue_verified: true,
    verified_type: "Business",
    profile_image_shape: "Square",
    profile_image_url_https: "https://pbs.twimg.com/profile_images/1/a_normal.jpg",
  },
  mediaDetails: [1, 2, 3, 4].map((n) => ({ type: "photo", media_url_https: `https://pbs.twimg.com/media/p${n}.jpg` })),
};

test("bare invocation defaults to the faithful detail view with media", () => {
  const opts = parseCli(["https://x.com/SpaceX/status/1"]);
  assert.equal(opts.view, "detail");
  assert.equal(opts.showMedia, true);
  assert.equal(opts.theme, "light");
  assert.equal(opts.accent, null);
  assert.equal(resolveMark(opts), false);
});

test("--view plate --no-media restores the primitive plate", () => {
  const opts = parseCli(["1", "--view", "plate", "--no-media"]);
  assert.equal(opts.view, "plate");
  assert.equal(opts.showMedia, false);
  assert.equal(resolveMark(opts), true);
  assert.equal(opts.border, 4);
  assert.equal(resolveAccent(opts), "#0F1419");
  assert.equal(resolveAccent(parseCli(["1", "--view", "plate", "--accent", "#1D9BF0"])), "#1D9BF0");
  assert.equal(parseCli(["1", "--media", "--no-media"]).showMedia, false);
  assert.equal(parseCli(["1", "--no-media", "--media"]).showMedia, true);
  assert.equal(resolveMark(parseCli(["1", "--mark"])), true);
  assert.equal(resolveMark(parseCli(["1", "--view", "plate", "--no-mark"])), false);
});

test("syndication keeps check type, avatar shape, entities, and decodes &amp;", () => {
  const post = normalizeSyndication(payload);
  assert.equal(post.text.startsWith("Ship 40 & crew"), true);
  assert.equal(post.author.verified, true);
  assert.equal(post.author.verified_type, "business");
  assert.equal(post.author.profile_image_shape, "square");
  assert.equal(post.public_metrics.impression_count, null);
  assert.equal(post.photos.length, 4);
  assert.deepEqual(post.entities.media.map((m) => m.url), ["https://t.co/media1"]);
});

test("detail render: photos laid out, media t.co dropped, link shown, no accent frame or mark", () => {
  const post = normalizeSyndication(payload);
  const opts = parseCli(["1"]);
  const out = renderSvg(post, opts, { avatar: true });
  assert.equal(out.photos.length, 4);
  assert.ok(out.avatar && out.avatar.shape === "square");
  assert.ok(!out.svg.includes("t.co"));
  assert.ok(out.svg.includes("spacex.com/updates"));
  assert.ok(out.svg.includes('fill="#1D9BF0">@SpaceX'));
  assert.ok(out.svg.includes("#E2B719"), "business check is gold");
  assert.ok(!out.svg.includes("Views"), "views are not invented");
  assert.ok(!/<rect x="0" y="0"[^>]*fill="#1D9BF0"/.test(out.svg), "no blue frame");
});

test("plate --no-media keeps the raw t.co text, border, and mark", () => {
  const post = normalizeSyndication(payload);
  const out = renderSvg(post, parseCli(["1", "--view", "plate", "--no-media"]));
  assert.equal(out.photos.length, 0);
  assert.ok(out.svg.includes("https://t.co/media1"));
  assert.ok(/<rect x="0" y="0"[^>]*fill="#0F1419"/.test(out.svg), "near-black border");
});

test("helpers", () => {
  const runs = colorRuns("hi @a and #tag $TSLA x.com/y", ["x.com/y"]);
  assert.deepEqual(runs.filter((r) => r.link).map((r) => r.text), ["@a", "#tag", "$TSLA", "x.com/y"]);
  const stripped = bodyText({ text: "a https://t.co/z", entities: {} }, { stripMedia: true, expandLinks: true });
  assert.equal(stripped.text, "a");
  // Non-emoji glyphs the measured face lacks (CJK) keep their advance but are not
  // painted (no .notdef boxes). Emoji are drawn in color (see emoji.test.js).
  const cjk = renderSvg({ ...normalizeSyndication(payload), text: "Liftoff \u6F22 now" }, parseCli(["1", "--no-media"]));
  assert.ok(cjk.svg.includes('<tspan fill="none">\u6F22</tspan>'));
});

test("--help shows the new defaults and the plate restore", () => {
  const help = helpText();
  assert.match(help, /detail \(default\)/);
  assert.match(help, /--no-media/);
  assert.match(help, /--view plate --no-media/);
  const cli = execFileSync(process.execPath, [bin, "--help"], { encoding: "utf8" });
  assert.equal(cli, help);
});

test("renderer smoke: the fixture renders to PNG with no ImageMagick on PATH", () => {
  // Only node's own directory on PATH, and a MAGICK_BIN that points nowhere: resvg
  // and sharp ship prebuilt binaries, so the render must not need anything else.
  const env = { ...process.env, PATH: path.dirname(process.execPath), MAGICK_BIN: "/nonexistent/magick" };
  const out = execFileSync(process.execPath, [bin, "--fixture", "-o", "-"], { env, maxBuffer: 1 << 24 });
  assert.equal(out.subarray(1, 4).toString("ascii"), "PNG");
  assert.equal(out.readUInt32BE(16), 800, "default width");
  assert.ok(out.readUInt32BE(20) > 100, "has a height");
  assert.equal(out[25], 6, "RGBA");
  // Same defaults with photos present (network path) lay out the media block.
  const post = normalizeSyndication(payload);
  const { photos } = renderSvg(post, parseCli(["1"]));
  assert.equal(photos.length, 4);
});

test("renderer smoke: photos are cover-cropped, rounded, and composited", async () => {
  const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${body}</svg>`;
  const plate = await svgToPng(svg(100, 80, '<rect width="100" height="80" fill="#FFFFFF"/>'));
  // 40x20: red left half, blue right half. Covering a 40x40 slot scales it to 80x40
  // and keeps the middle, so the slot is half red, half blue.
  const photo = await svgToPng(svg(40, 20, '<rect width="20" height="20" fill="#FF0000"/><rect x="20" width="20" height="20" fill="#0000FF"/>'));
  const slot = { x: 10, y: 10, w: 40, h: 40, radius: 8, corners: { tl: 1, tr: 1, bl: 1, br: 1 } };
  const out = await compositePhotos(plate, [slot], [photo]);
  const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 100);
  assert.equal(info.height, 80);
  const px = (x, y) => Array.from(data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3));
  assert.deepEqual(px(15, 30), [255, 0, 0]);
  assert.deepEqual(px(45, 30), [0, 0, 255]);
  assert.deepEqual(px(10, 10), [255, 255, 255], "rounded corner shows the plate");
  assert.deepEqual(px(5, 5), [255, 255, 255], "outside the slot is untouched");
});
