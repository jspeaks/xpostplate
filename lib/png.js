import { spawn } from "node:child_process";
import { accessSync, constants, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { findFonts } from "./fonts.js";

export function resolveMagick() {
  if (process.env.MAGICK_BIN) return process.env.MAGICK_BIN;
  for (const candidate of ["/opt/homebrew/bin/magick", "/usr/local/bin/magick"]) {
    if (isExecutable(candidate)) return candidate;
  }
  return "magick";
}

export async function svgToPng(svg) {
  const bin = resolveMagick();
  const fonts = findFonts();
  const configurePath = await readConfigurePath(bin);
  const dir = mkdtempSync(path.join(tmpdir(), "xpostplate-"));
  try {
    writeFileSync(path.join(dir, "type.xml"), typeXml(fonts), "utf8");
    const env = {
      ...process.env,
      MAGICK_CONFIGURE_PATH: `${dir}${path.delimiter}${configurePath}`,
    };
    const { code, stdout, stderr } = await run(
      bin,
      ["-background", "none", "svg:-", "png32:-"],
      { input: svg, env },
    );
    if (code !== 0) {
      const detail = stderr.toString("utf8").trim() || `exit ${code}`;
      throw new Error(`magick failed to convert the plate SVG: ${detail}`);
    }
    if (!isPng(stdout)) {
      throw new Error("magick did not return a PNG.");
    }
    return stdout;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export async function compositePhotos(png, slots, buffers) {
  if (!slots.length) return png;
  if (!buffers || buffers.length !== slots.length) {
    throw new Error("Could not draw every image.");
  }
  const bin = resolveMagick();
  const dir = mkdtempSync(path.join(tmpdir(), "xpostplate-photo-"));
  try {
    let current = png;
    for (let i = 0; i < slots.length; i++) {
      current = await compositeOne(bin, current, buffers[i], slots[i], dir, i);
      if (!isPng(current)) throw new Error("magick did not return a PNG.");
    }
    return current;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function compositeOne(bin, plate, photo, slot, dir, index) {
  const platePath = path.join(dir, `plate-${index}.png`);
  const photoPath = path.join(dir, `photo-${index}.img`);
  writeFileSync(platePath, plate);
  writeFileSync(photoPath, photo);
  const w = Math.round(slot.w);
  const h = Math.round(slot.h);
  const x = Math.round(slot.x);
  const y = Math.round(slot.y);
  if (w < 1 || h < 1) return plate;
  // Plate photos round every corner at up to 12px. Faithful views pass their own
  // radius, which corners to round (a grid rounds only its outer corners), or a
  // circle for the avatar.
  const radius = slot.shape === "circle"
    ? Math.floor(Math.min(w, h) / 2)
    : Math.min(slot.radius ?? 12, Math.floor(Math.min(w, h) / (slot.radius != null ? 2 : 4)));
  const args = [
    platePath,
    "(",
    magickInput(photoPath, photo),
    "-auto-orient",
    // JPEGs have no alpha channel; without one the rounded mask paints black corners.
    "-alpha",
    "set",
    "-resize",
    `${w}x${h}^`,
    "-gravity",
    "center",
    "-extent",
    `${w}x${h}`,
  ];
  if (radius > 0) {
    args.push(
      "(",
      "-size",
      `${w}x${h}`,
      "xc:none",
      "-fill",
      "white",
      "-draw",
      `roundrectangle 0,0 ${w - 1},${h - 1} ${radius},${radius}`,
      ...squareCorners(slot.corners, w, h, radius),
      ")",
      "-compose",
      "dstin",
      "-composite",
    );
  }
  args.push(")", "-gravity", "NorthWest", "-geometry", `+${x}+${y}`, "-compose", "over", "-composite", "png32:-");
  const { code, stdout, stderr } = await run(bin, args, { timeoutMs: 30000 });
  if (code !== 0) {
    const detail = stderr.toString("utf8").trim() || `exit ${code}`;
    throw new Error(`magick failed to draw a photo: ${detail}`);
  }
  return stdout;
}

function squareCorners(corners, w, h, r) {
  if (!corners) return [];
  const out = [];
  const box = (x0, y0) => out.push("-draw", `rectangle ${x0},${y0} ${x0 + r},${y0 + r}`);
  if (!corners.tl) box(0, 0);
  if (!corners.tr) box(w - 1 - r, 0);
  if (!corners.bl) box(0, h - 1 - r);
  if (!corners.br) box(w - 1 - r, h - 1 - r);
  return out;
}

function magickInput(file, buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8) return `jpeg:${file}`;
  if (buf[0] === 0x89 && buf.toString("ascii", 1, 4) === "PNG") return `png:${file}`;
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return `webp:${file}`;
  if (buf.toString("ascii", 0, 3) === "GIF") return `gif:${file}[0]`;
  return file;
}

async function readConfigurePath(bin) {
  const { code, stdout, stderr } = await run(bin, ["-list", "configure"]);
  if (code !== 0) {
    throw new Error(`Could not run ${bin} -list configure: ${stderr.toString("utf8").trim() || code}`);
  }
  const match = stdout.toString("utf8").match(/CONFIGURE_PATH\s+(\S+)/);
  if (!match) {
    throw new Error("Could not find ImageMagick CONFIGURE_PATH. Is magick installed?");
  }
  return match[1];
}

function typeXml(fonts) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<typemap>
  <type name="PlateSans" fullname="Plate Sans" family="PlateSans" style="normal" weight="400" stretch="normal" glyphs="${xmlAttr(fonts.regular)}"/>
  <type name="PlateSansBold" fullname="Plate Sans Bold" family="PlateSansBold" style="normal" weight="700" stretch="normal" glyphs="${xmlAttr(fonts.bold)}"/>
</typemap>
`;
}

function xmlAttr(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isPng(buf) {
  return buf.length >= 8 && buf[0] === 0x89 && buf.toString("ascii", 1, 4) === "PNG";
}

function isExecutable(file) {
  try {
    accessSync(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function run(cmd, args, { input, env, timeoutMs } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      env: env ?? process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const out = [];
    const err = [];
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, timeoutMs ?? 20000);
    child.stdout.on("data", (chunk) => out.push(chunk));
    child.stderr.on("data", (chunk) => err.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      if (error.code === "ENOENT") {
        reject(new Error(`ImageMagick 'magick' was not found (${cmd}). Install it or set MAGICK_BIN.`));
        return;
      }
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        code: code ?? 1,
        stdout: Buffer.concat(out),
        stderr: Buffer.concat(err),
      });
    });
    child.stdin.end(input ?? "");
  });
}
