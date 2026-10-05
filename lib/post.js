import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const defaultFixturePath = path.resolve(here, "../fixtures/sample-post.json");

const METRIC_KEYS = [
  "retweet_count",
  "reply_count",
  "like_count",
  "quote_count",
  "bookmark_count",
  "impression_count",
];

export function parseStatusId(input) {
  const raw = String(input ?? "").trim();
  if (!raw) throw new Error("Missing post URL or status id.");
  if (/^\d+$/.test(raw)) return raw;

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Not a status id or X post URL: ${raw}`);
  }
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  const allowed = new Set([
    "x.com",
    "twitter.com",
    "mobile.twitter.com",
    "mobile.x.com",
  ]);
  if (!allowed.has(host)) {
    throw new Error(`Unsupported host ${host}. Use x.com or twitter.com, or pass a numeric status id.`);
  }
  const match = url.pathname.match(/\/status(?:es)?\/(\d+)/);
  if (!match) throw new Error(`No status id in URL: ${raw}`);
  return match[1];
}

export function bearerTokenFromEnv(env = process.env) {
  let token = env.X_BEARER_TOKEN ?? "";
  token = token.trim();
  if (/^bearer\s+/i.test(token)) token = token.replace(/^bearer\s+/i, "").trim();
  return token;
}

const PUBLIC_FETCH_NOTE =
  "Without it, public posts are fetched from X's syndication endpoint, and reposts, quotes, bookmarks, and views are omitted. Protected or deleted posts fail.";

export function missingTokenMessage() {
  return PUBLIC_FETCH_NOTE;
}

export async function fetchPost(statusId, token) {
  const url = new URL(`https://api.x.com/2/tweets/${statusId}`);
  url.searchParams.set("tweet.fields", "text,created_at,public_metrics,attachments,entities");
  url.searchParams.set("expansions", "author_id,attachments.media_keys");
  url.searchParams.set("user.fields", "name,username,profile_image_url,verified,verified_type");
  url.searchParams.set("media.fields", "url,preview_image_url,type,width,height");

  let response;
  try {
    response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(20000),
    });
  } catch (err) {
    throw new Error(`Failed to reach the X API: ${err.message}`);
  }

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`X API ${response.status}: ${body.slice(0, 400)}`);
  }
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new Error("X API returned a body that is not JSON.");
  }
  if (!payload.data) {
    const detail = Array.isArray(payload.errors)
      ? payload.errors.map((e) => e.detail || e.title || e.message || "unknown error").join("; ")
      : "response had no data object";
    throw new Error(`X API error: ${detail}`);
  }
  return normalizePost(payload);
}

const SYNDICATION_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const NOT_PUBLIC = "The post is missing, private, or not public.";

export async function fetchPublicPost(statusId) {
  const url = new URL("https://cdn.syndication.twimg.com/tweet-result");
  url.searchParams.set("id", statusId);
  url.searchParams.set("token", "0");

  let response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": SYNDICATION_USER_AGENT,
      },
      signal: AbortSignal.timeout(20000),
    });
  } catch (err) {
    throw new Error(`Failed to reach X's syndication endpoint: ${err.message}`);
  }

  const body = await response.text();
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new Error(NOT_PUBLIC);
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(NOT_PUBLIC);
  }
  const hasText = typeof payload.text === "string";
  const hasUser = payload.user && typeof payload.user === "object" && !Array.isArray(payload.user);
  if (!hasText && !hasUser) throw new Error(NOT_PUBLIC);
  return normalizeSyndication(payload);
}

export function normalizeSyndication(payload) {
  const user = payload.user && typeof payload.user === "object" && !Array.isArray(payload.user) ? payload.user : {};
  return shapePost({
    id: payload.id_str ?? payload.id,
    text: typeof payload.text === "string" ? decodeEntities(payload.text) : "",
    created_at: payload.created_at ?? null,
    author_id: user.id_str ?? user.id ?? null,
    entities: collectEntities(payload.entities, payload.mediaDetails),
    display_text_range: payload.display_text_range,
    public_metrics: {
      like_count: countOrNull(payload.favorite_count),
      reply_count: countOrNull(payload.conversation_count),
      retweet_count: null,
      quote_count: null,
      bookmark_count: null,
      impression_count: null,
    },
    author: {
      id: user.id_str ?? user.id ?? null,
      name: user.name,
      username: user.screen_name,
      profile_image_url: user.profile_image_url_https || user.profile_image_url || null,
      verified: user.verified,
      is_blue_verified: user.is_blue_verified,
      verified_type: user.verified_type,
      profile_image_shape: user.profile_image_shape,
    },
    photos: collectSyndicationPhotos(payload),
  });
}

function countOrNull(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function loadFixture(filePath) {
  const resolved = path.resolve(filePath);
  let raw;
  try {
    raw = await readFile(resolved, "utf8");
  } catch (err) {
    throw new Error(`Could not read fixture ${resolved}: ${err.message}`);
  }
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Fixture is not JSON (${resolved}): ${err.message}`);
  }
  return normalizePost(payload);
}

export function normalizePost(payload) {
  if (payload && payload.author && typeof payload.text === "string" && !payload.data) {
    return shapePost({
      id: payload.id,
      text: payload.text,
      created_at: payload.created_at ?? payload.createdAt ?? null,
      author_id: payload.author.id ?? null,
      public_metrics: payload.public_metrics ?? payload.metrics ?? {},
      author: payload.author,
      photos: normalizePhotoList(payload.photos),
      entities: payload.entities,
      display_text_range: payload.display_text_range,
    });
  }

  const data = payload?.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Post JSON has no data object.");
  }
  const users = payload.includes?.users ?? [];
  const author = users.find((user) => user && user.id === data.author_id) ?? users[0] ?? {};
  return shapePost({
    id: data.id,
    text: decodeEntities(data.text ?? ""),
    created_at: data.created_at ?? null,
    author_id: data.author_id ?? author.id ?? null,
    public_metrics: data.public_metrics ?? {},
    author,
    photos: collectApiPhotos(payload),
    entities: collectEntities(data.entities),
    display_text_range: data.display_text_range,
  });
}

function shapePost({ id, text, created_at, author_id, public_metrics, author, photos, entities, display_text_range }) {
  const metrics = {};
  for (const key of METRIC_KEYS) {
    metrics[key] = metricCount(public_metrics ? public_metrics[key] : undefined);
  }
  return {
    id: id == null ? "" : String(id),
    text: String(text ?? ""),
    created_at: created_at ?? null,
    public_metrics: metrics,
    author: {
      id: author?.id ?? author_id ?? null,
      name: author?.name || "Unknown",
      username: String(author?.username || "unknown").replace(/^@/, ""),
      profile_image_url: author?.profile_image_url || author?.profileImageUrl || null,
      verified: isVerified(author),
      verified_type: verifiedType(author),
      profile_image_shape: avatarShape(author),
    },
    photos: Array.isArray(photos) ? photos : [],
    entities: collectEntities(entities),
    display_text_range: textRange(display_text_range),
  };
}

// X escapes &, <, and > in post text. Decode them so the image shows the characters.
function decodeEntities(text) {
  return String(text).replace(/&(amp|lt|gt|quot|#39);/g, (_, name) =>
    ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" })[name],
  );
}

// Link and media t.co URLs, kept so faithful views can show the display URL
// and drop the media link when the photo itself is drawn.
function collectEntities(raw, mediaDetails) {
  const out = { urls: [], media: [] };
  const seen = new Set();
  const add = (list, item) => {
    if (!item || typeof item !== "object" || typeof item.url !== "string" || seen.has(item.url)) return;
    seen.add(item.url);
    list.push({
      url: item.url,
      display_url: typeof item.display_url === "string" ? item.display_url : null,
      expanded_url: typeof item.expanded_url === "string" ? item.expanded_url : null,
    });
  };
  const isMedia = (item) =>
    Boolean(item?.media_key) ||
    /^pic\.(x|twitter)\.com\//.test(String(item?.display_url || "")) ||
    /\/(photo|video)\/\d+$/.test(String(item?.expanded_url || ""));
  if (raw && typeof raw === "object") {
    if (Array.isArray(raw.media)) for (const item of raw.media) add(out.media, item);
    if (Array.isArray(raw.urls)) {
      for (const item of raw.urls) add(isMedia(item) ? out.media : out.urls, item);
    }
  }
  if (Array.isArray(mediaDetails)) for (const item of mediaDetails) add(out.media, item);
  return out;
}

function textRange(value) {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const [a, b] = value.map(Number);
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < a) return null;
  return [a, b];
}

function verifiedType(author) {
  if (!author || typeof author !== "object") return null;
  const type = String(author.verified_type ?? author.verifiedType ?? "").toLowerCase();
  if (type === "business" || type === "government") return type;
  return isVerified(author) ? "blue" : null;
}

function avatarShape(author) {
  const raw = String(author?.profile_image_shape ?? author?.profileImageShape ?? "").toLowerCase();
  return raw === "square" || raw === "hexagon" ? raw : "circle";
}

// The profile URL X returns is the 48px "_normal" size. Ask for 400x400.
export function avatarUrl(post) {
  const clean = imageUrl(post?.author?.profile_image_url);
  if (!clean) return null;
  return clean.replace(/_normal(\.[a-z]+)$/i, "_400x400$1");
}

function metricCount(value) {
  if (value === undefined) return 0;
  if (value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}


function imageUrl(value) {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const pathName = url.pathname.toLowerCase();
  if (/\.(mp4|m3u8|mpd|webm|mov)$/.test(pathName)) return null;
  const host = url.hostname.toLowerCase();
  const twimg = host === "pbs.twimg.com" || host.endsWith(".twimg.com");
  const imageExt = /\.(jpe?g|png|webp|gif)$/.test(pathName);
  if (!twimg && !imageExt) return null;
  return url.toString();
}

function pushPhoto(urls, value) {
  const clean = imageUrl(value);
  if (!clean || urls.includes(clean)) return;
  urls.push(clean);
}

function stillFromMedia(item) {
  if (!item || typeof item !== "object") return null;
  const type = String(item.type || "").toLowerCase();
  if (type === "video" || type === "animated_gif") {
    return imageUrl(item.preview_image_url) || imageUrl(item.media_url_https) || imageUrl(item.media_url);
  }
  if (type && type !== "photo") {
    return imageUrl(item.preview_image_url) || imageUrl(item.media_url_https) || imageUrl(item.media_url);
  }
  return imageUrl(item.media_url_https) || imageUrl(item.media_url);
}

export function collectSyndicationPhotos(payload) {
  const urls = [];
  if (!payload || typeof payload !== "object") return urls;
  if (Array.isArray(payload.mediaDetails)) {
    for (const item of payload.mediaDetails) pushPhoto(urls, stillFromMedia(item));
  }
  if (Array.isArray(payload.photos)) {
    for (const item of payload.photos) {
      if (typeof item === "string") pushPhoto(urls, item);
      else if (item && typeof item === "object") pushPhoto(urls, imageUrl(item.url) || imageUrl(item.media_url_https));
    }
  }
  const entityMedia = payload.entities && typeof payload.entities === "object" ? payload.entities.media : null;
  if (Array.isArray(entityMedia)) {
    for (const item of entityMedia) pushPhoto(urls, stillFromMedia(item));
  }
  if (!urls.length) {
    const card = cardStill(payload.card);
    if (card) urls.push(card);
  }
  return urls;
}

function cardKeyScore(key) {
  const name = String(key).toLowerCase();
  if (!/image|thumb|photo|player/.test(name)) return 0;
  if (/original|full/.test(name)) return 3;
  if (name.includes("large")) return 2;
  return 1;
}

function cardStill(card) {
  if (!card || typeof card !== "object" || Array.isArray(card)) return null;
  const bindings = card.binding_values;
  if (!bindings || typeof bindings !== "object" || Array.isArray(bindings)) return null;
  const entries = Object.entries(bindings).sort((a, b) => cardKeyScore(b[0]) - cardKeyScore(a[0]));
  for (const [key, value] of entries) {
    if (cardKeyScore(key) <= 0 || !value || typeof value !== "object") continue;
    const candidate = value.image_value?.url || value.image_url || value.string_value;
    const clean = imageUrl(candidate);
    if (clean) return clean;
  }
  return null;
}

export function collectApiPhotos(payload) {
  const urls = [];
  const media = Array.isArray(payload?.includes?.media) ? payload.includes.media : [];
  const keys = payload?.data?.attachments?.media_keys;
  const ordered = Array.isArray(keys) && keys.length
    ? keys.map((key) => media.find((item) => item && item.media_key === key)).filter(Boolean)
    : media;
  for (const item of ordered) {
    const type = String(item?.type || "photo").toLowerCase();
    if (type === "photo") pushPhoto(urls, item.url);
    else pushPhoto(urls, item.preview_image_url);
  }
  return urls;
}

function normalizePhotoList(value) {
  if (!Array.isArray(value)) return [];
  const urls = [];
  for (const item of value) {
    if (typeof item === "string") pushPhoto(urls, item);
    else if (item && typeof item === "object") {
      pushPhoto(urls, imageUrl(item.url) || imageUrl(item.media_url_https) || imageUrl(item.preview_image_url));
    }
  }
  return urls;
}

const MAX_PHOTO_BYTES = 20 * 1024 * 1024;

export async function fetchPhotoBuffers(urls) {
  const buffers = await Promise.all(urls.map((url) => fetchPhotoBuffer(url)));
  return buffers;
}

export async function fetchPhotoBuffer(url) {
  let response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "User-Agent": SYNDICATION_USER_AGENT,
        Referer: "https://x.com/",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
    });
  } catch (err) {
    throw new Error(`Failed to fetch a photo: ${err.message}`);
  }
  if (!response.ok) {
    throw new Error(`Photo fetch failed (${response.status}).`);
  }
  const buf = Buffer.from(await response.arrayBuffer());
  if (buf.length > MAX_PHOTO_BYTES) throw new Error("A photo was too large to draw.");
  if (!isImageBuffer(buf)) throw new Error("A photo response was not an image.");
  return buf;
}

function isImageBuffer(buf) {
  if (!buf || buf.length < 12) return false;
  if (buf[0] === 0xff && buf[1] === 0xd8) return true;
  if (buf[0] === 0x89 && buf.toString("ascii", 1, 4) === "PNG") return true;
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return true;
  if (buf.toString("ascii", 0, 3) === "GIF") return true;
  return false;
}

const COUNT_FIELDS = [
  "reply_count",
  "retweet_count",
  "quote_count",
  "like_count",
  "bookmark_count",
  "impression_count",
];

export function applyOverrides(post, opts) {
  const next = {
    ...post,
    author: { ...post.author },
    public_metrics: { ...post.public_metrics },
  };
  if (opts.nameOverride != null) next.author.name = opts.nameOverride;
  if (opts.handleOverride != null) next.author.username = String(opts.handleOverride).replace(/^@/, "");
  if (opts.textOverride != null) {
    next.text = opts.textOverride;
    next.display_text_range = null;
  }
  if (opts.verifiedOverride != null) {
    next.author.verified = opts.verifiedOverride;
    if (!opts.verifiedOverride) next.author.verified_type = null;
    else if (!next.author.verified_type) next.author.verified_type = "blue";
  }
  if (opts.posted != null) next.created_at = opts.posted;
  for (const field of COUNT_FIELDS) {
    if (opts.counts && Object.prototype.hasOwnProperty.call(opts.counts, field)) {
      next.public_metrics[field] = opts.counts[field];
    }
  }
  return next;
}

export function fabricatePost(opts) {
  if (opts.textOverride == null || !String(opts.textOverride).trim()) {
    throw new Error("--fabricate needs --text");
  }
  const metrics = {};
  for (const field of COUNT_FIELDS) metrics[field] = null;
  if (opts.counts) Object.assign(metrics, opts.counts);
  return shapePost({
    id: "",
    text: opts.textOverride,
    created_at: opts.posted ?? new Date().toISOString(),
    author_id: null,
    public_metrics: metrics,
    author: {
      name: opts.nameOverride || "Unknown",
      username: opts.handleOverride || "unknown",
      verified: opts.verifiedOverride === true,
    },
    photos: [],
  });
}

function isVerified(author) {
  if (!author || typeof author !== "object") return false;
  if (author.verified === true || author.is_blue_verified === true) return true;
  const type = author.verified_type ?? author.verifiedType;
  return typeof type === "string" && type.length > 0 && type.toLowerCase() !== "none";
}

export function formatRelativeTime(iso, now = Date.now()) {
  if (!iso) return "";
  const date = new Date(iso);
  const then = date.getTime();
  if (Number.isNaN(then)) return "";
  let sec = Math.round((now - then) / 1000);
  if (sec < 5) return "1s";
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  const sameYear =
    nyPart(date, { year: "numeric" }) === nyPart(new Date(now), { year: "numeric" });
  return nyPart(date, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

export function formatDetailTime(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso);
  const time = nyPart(date, { hour: "numeric", minute: "2-digit" }).replace(/[\u202f\u00a0]/g, " ");
  const day = nyPart(date, { month: "short", day: "numeric", year: "numeric" });
  return `${time} · ${day}`;
}

function nyPart(date, options) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", ...options }).format(date);
}

export function formatPostTime(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}
