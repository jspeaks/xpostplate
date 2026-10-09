import { findFonts } from "./fonts.js";

// Loaded on first render so --help, --version, --json, and argument errors stay fast.
let resvgModule = null;
let sharpModule = null;
async function loadResvg() {
  resvgModule ??= (await import("@resvg/resvg-js")).Resvg;
  return resvgModule;
}
async function loadSharp() {
  sharpModule ??= (await import("sharp")).default;
  return sharpModule;
}

// Rasterize the plate SVG with resvg using only the two TrueType files fonts.js
// measures (system fonts off), so the text drawn is the text measured. Pure npm:
// resvg and sharp ship prebuilt binaries; nothing else is needed on PATH.
// MAGICK_BIN is no longer read (ImageMagick was removed in 0.9.26).
// scale (--scale) zooms the vector render: same layout, scale x the pixels, each
// side rounded up. Scale 1 renders at the SVG's own size, exactly as before.
export async function svgToPng(svg, { scale = 1 } = {}) {
  const Resvg = await loadResvg();
  const fonts = findFonts();
  const fontFiles = fonts.bold === fonts.regular ? [fonts.regular] : [fonts.regular, fonts.bold];
  let png;
  try {
    const resvg = new Resvg(svg, {
      fitTo: scale === 1 ? { mode: "original" } : { mode: "zoom", value: scale },
      background: "rgba(0, 0, 0, 0)",
      font: { loadSystemFonts: false, fontFiles },
      shapeRendering: 2,
      textRendering: 1,
      imageRendering: 0,
    });
    png = resvg.render().asPng();
  } catch (err) {
    throw new Error(`Could not render the plate SVG: ${err && err.message ? err.message : err}`);
  }
  if (!isPng(png)) throw new Error("The SVG renderer did not return a PNG.");
  return png;
}

// Slots are in layout pixels; scale (--scale) maps them onto a zoomed render, so a
// photo is resampled straight from its source to the final pixel size (one resize,
// never a small bitmap blown up) and lines up with the vector edges around it.
export async function compositePhotos(png, slots, buffers, { scale = 1 } = {}) {
  if (!slots.length) return png;
  if (scale !== 1) slots = slots.map((slot) => scaleSlot(slot, scale));
  if (!buffers || buffers.length !== slots.length) {
    throw new Error("Could not draw every image.");
  }
  const sharp = await loadSharp();
  const Resvg = await loadResvg();
  // A large --scale can pass sharp's default 268 MP input guard; the CLI already
  // caps each side at 16384 px.
  const { width, height } = await sharp(png, { limitInputPixels: false }).metadata();
  const layers = [];
  for (let i = 0; i < slots.length; i++) {
    const layer = await photoLayer(sharp, Resvg, buffers[i], slots[i], width, height);
    if (layer) layers.push(layer);
  }
  if (!layers.length) return png;
  try {
    // Same size class as the old ImageMagick PNGs: zlib 9 with adaptive filtering.
    return await sharp(png, { limitInputPixels: false }).composite(layers).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
  } catch (err) {
    throw new Error(`Could not draw a photo: ${err.message}`);
  }
}

// Fill the slot like CSS object-fit: cover (scale to cover, center crop), then
// round its corners. Plate photos round every corner at up to 12px. Faithful views
// pass their own radius, which corners to round (a grid rounds only its outer
// corners), or a circle for the avatar.
async function photoLayer(sharp, Resvg, photo, slot, canvasW, canvasH) {
  const w = Math.round(slot.w);
  const h = Math.round(slot.h);
  const x = Math.round(slot.x);
  const y = Math.round(slot.y);
  if (w < 1 || h < 1) return null;
  const radius = slot.shape === "circle"
    ? Math.floor(Math.min(w, h) / 2)
    : Math.min(slot.radius ?? 12 * (slot.scale ?? 1), Math.floor(Math.min(w, h) / (slot.radius != null ? 2 : 4)));
  let buf;
  try {
    const input = { failOn: "none", pages: 1 };
    const meta = await sharp(photo, input).metadata();
    const turned = (meta.orientation || 1) >= 5;
    const srcW = turned ? meta.height : meta.width;
    const srcH = turned ? meta.width : meta.height;
    const cover = coverSize(srcW, srcH, w, h);
    let img = sharp(photo, input)
      .rotate()
      .resize(cover.w, cover.h, { fit: "fill", kernel: sharp.kernel.mitchell, fastShrinkOnLoad: false })
      .extract({ left: Math.floor((cover.w - w) / 2), top: Math.floor((cover.h - h) / 2), width: w, height: h })
      // Transparent photo pixels sit on white, as they always have, then the
      // rounded mask is the only transparency.
      .flatten({ background: "#FFFFFF" })
      .ensureAlpha();
    if (radius > 0) {
      img = img.composite([{ input: roundMask(Resvg, w, h, radius, slot.corners), blend: "dest-in" }]);
    }
    buf = await img.png({ compressionLevel: 0 }).toBuffer();
  } catch (err) {
    throw new Error(`Could not draw a photo: ${err.message}`);
  }
  // Keep the layer inside the canvas (slots are laid out inside it already).
  const left = Math.max(0, x);
  const top = Math.max(0, y);
  const cw = Math.min(w - (left - x), canvasW - left);
  const ch = Math.min(h - (top - y), canvasH - top);
  if (cw < 1 || ch < 1) return null;
  if (cw !== w || ch !== h) {
    buf = await sharp(buf).extract({ left: left - x, top: top - y, width: cw, height: ch }).png({ compressionLevel: 0 }).toBuffer();
  }
  return { input: buf, left, top };
}

// Scale so the photo covers w x h, rounding each side to the nearest pixel; the
// overflow is then cropped evenly (the left/top offset rounds down). Mitchell
// resampling keeps the soft, artifact-free look photos have always had.
function coverSize(srcW, srcH, w, h) {
  const scale = Math.max(w / srcW, h / srcH);
  return {
    w: Math.max(w, Math.floor(srcW * scale + 0.5)),
    h: Math.max(h, Math.floor(srcH * scale + 0.5)),
  };
}

// Round the scaled edges, not the origin and size, so the photo's right and bottom
// edges land on the same pixel as the vector shapes laid out around it.
function scaleSlot(slot, scale) {
  const x = Math.round(slot.x * scale);
  const y = Math.round(slot.y * scale);
  const w = Math.round((slot.x + slot.w) * scale) - x;
  const h = Math.round((slot.y + slot.h) * scale) - y;
  const out = { ...slot, scale, x, y, w, h };
  if (slot.radius != null) out.radius = slot.radius * scale;
  return out;
}

function roundMask(Resvg, w, h, r, corners) {
  const square = [];
  if (corners) {
    if (!corners.tl) square.push(`<rect x="0" y="0" width="${r}" height="${r}"/>`);
    if (!corners.tr) square.push(`<rect x="${w - r}" y="0" width="${r}" height="${r}"/>`);
    if (!corners.bl) square.push(`<rect x="0" y="${h - r}" width="${r}" height="${r}"/>`);
    if (!corners.br) square.push(`<rect x="${w - r}" y="${h - r}" width="${r}" height="${r}"/>`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><g fill="#FFFFFF"><rect x="0" y="0" width="${w}" height="${h}" rx="${r}" ry="${r}"/>${square.join("")}</g></svg>`;
  return new Resvg(svg, { fitTo: { mode: "original" }, font: { loadSystemFonts: false }, shapeRendering: 2 }).render().asPng();
}

function isPng(buf) {
  return buf.length >= 8 && buf[0] === 0x89 && buf.toString("ascii", 1, 4) === "PNG";
}
