#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { helpText, parseCli } from "../lib/args.js";
import { compositePhotos, svgToPng } from "../lib/png.js";
import {
  avatarUrl,
  bearerTokenFromEnv,
  defaultFixturePath,
  fetchPhotoBuffer,
  fetchPost,
  fetchPublicPost,
  applyOverrides,
  fabricatePost,
  loadFixture,
  parseStatusId,
} from "../lib/post.js";
import { renderSvg } from "../lib/svg.js";

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--version") || args.includes("-v")) {
    const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
    process.stdout.write(`${packageJson.version}\n`);
    return;
  }

  const opts = parseCli(args);
  if (opts.help) {
    process.stdout.write(helpText());
    return;
  }

  let post;
  if (opts.fabricate) {
    if (opts.fixture) throw new Error("--fabricate does not use a fixture");
    if (opts.positionals.length) throw new Error("--fabricate does not take a post URL");
    post = fabricatePost(opts);
  } else if (opts.fixture) {
    if (opts.positionals.length) {
      process.stderr.write("fixture mode ignores the status argument\n");
    }
    const file = opts.fixture === true ? defaultFixturePath : opts.fixture;
    post = applyOverrides(await loadFixture(file), opts);
  } else {
    if (opts.positionals.length !== 1) {
      process.stderr.write(helpText());
      process.exitCode = 1;
      return;
    }
    const statusId = parseStatusId(opts.positionals[0]);
    const token = bearerTokenFromEnv();
    const fetched = token ? await fetchPost(statusId, token) : await fetchPublicPost(statusId);
    post = applyOverrides(fetched, opts);
  }

  if (opts.json) {
    if (opts.output && opts.output !== "-") {
      process.stderr.write("--json writes to stdout; ignoring --output\n");
    }
    process.stdout.write(`${JSON.stringify(post, null, 2)}\n`);
    return;
  }

  // Fetch images before layout so a photo or avatar that fails to load drops out
  // cleanly (with a note on stderr) instead of leaving a hole or failing the render.
  const network = !opts.fixture && !opts.fabricate;
  const photoBuffers = new Map();
  let drawPost = post;
  if (network && opts.showMedia && Array.isArray(post.photos) && post.photos.length) {
    const wanted = post.photos.slice(0, 4);
    const settled = await Promise.allSettled(wanted.map((url) => fetchPhotoBuffer(url)));
    settled.forEach((result, i) => {
      if (result.status === "fulfilled") photoBuffers.set(wanted[i], result.value);
      else process.stderr.write(`skipping a photo: ${result.reason?.message || result.reason}\n`);
    });
    drawPost = { ...post, photos: wanted.filter((url) => photoBuffers.has(url)) };
  }
  let avatarBuffer = null;
  const avatarSource = network && opts.view !== "plate" ? avatarUrl(post) : null;
  if (avatarSource) {
    try {
      avatarBuffer = await fetchPhotoBuffer(avatarSource);
    } catch (err) {
      process.stderr.write(`avatar unavailable, using initials: ${err.message}\n`);
    }
  }

  const plate = renderSvg(drawPost, opts, { avatar: Boolean(avatarBuffer) });
  let png = await svgToPng(plate.svg);
  const slots = plate.photos.filter((slot) => photoBuffers.has(slot.url));
  const buffers = slots.map((slot) => photoBuffers.get(slot.url));
  if (plate.avatar && avatarBuffer) {
    slots.push(plate.avatar);
    buffers.push(avatarBuffer);
  }
  if (slots.length) png = await compositePhotos(png, slots, buffers);
  const destination = opts.output;

  // No -o: on a TTY, write {handle}-{YYYYMMDD-HHMMSS}.png in cwd instead of binary to the terminal.
  if (destination == null && process.stdout.isTTY) {
    const file = path.resolve(autoPngFilename(post, opts));
    await writeFile(file, png);
    process.stderr.write(`${file}\n`);
    return;
  }

  if (!destination || destination === "-") {
    process.stderr.write(`PNG ${png.length} bytes (${plate.width}x${plate.height})\n`);
    await writeStdout(png);
    return;
  }

  const file = path.resolve(destination);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, png);
  process.stderr.write(`wrote ${file} (${plate.width}x${plate.height})\n`);
}

function autoPngFilename(post, opts) {
  const raw = opts.fabricate && !opts.handleOverride
    ? ""
    : String(post?.author?.username || "").replace(/^@/, "").trim();
  const handle = raw || "x";
  const safe = handle.replace(/[^A-Za-z0-9._-]+/g, "_") || "x";
  return `${safe}-${localStamp()}.png`;
}

function localStamp(now = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
}

function writeStdout(buffer) {
  return new Promise((resolve, reject) => {
    process.stdout.write(buffer, (err) => (err ? reject(err) : resolve()));
  });
}

main().catch((err) => {
  const message = err && err.message ? err.message : String(err);
  process.stderr.write(message.endsWith("\n") ? message : `${message}\n`);
  process.exit(1);
});
