import { spawn } from "node:child_process";
import { accessSync, constants, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

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

function findFonts() {
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

function isReadable(file) {
  try {
    accessSync(file, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function run(cmd, args, { input, env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      env: env ?? process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const out = [];
    const err = [];
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, 20000);
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
