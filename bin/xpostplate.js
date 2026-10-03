#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { helpText, parseCli } from "../lib/args.js";
import { svgToPng } from "../lib/png.js";
import {
  bearerTokenFromEnv,
  defaultFixturePath,
  fetchPost,
  fetchPublicPost,
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
  if (opts.fixture) {
    if (opts.positionals.length) {
      process.stderr.write("fixture mode ignores the status argument\n");
    }
    const file = opts.fixture === true ? defaultFixturePath : opts.fixture;
    post = await loadFixture(file);
  } else {
    if (opts.positionals.length !== 1) {
      process.stderr.write(helpText());
      process.exitCode = 1;
      return;
    }
    const statusId = parseStatusId(opts.positionals[0]);
    const token = bearerTokenFromEnv();
    post = token ? await fetchPost(statusId, token) : await fetchPublicPost(statusId);
  }

  if (opts.json) {
    if (opts.output && opts.output !== "-") {
      process.stderr.write("--json writes to stdout; ignoring --output\n");
    }
    process.stdout.write(`${JSON.stringify(post, null, 2)}\n`);
    return;
  }

  const plate = renderSvg(post, opts);
  const png = await svgToPng(plate.svg);
  const destination = opts.output;

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
