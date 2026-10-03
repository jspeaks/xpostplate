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
  url.searchParams.set("tweet.fields", "text,created_at,public_metrics,attachments");
  url.searchParams.set("expansions", "author_id,attachments.media_keys");
  url.searchParams.set("user.fields", "name,username,profile_image_url");
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
    text: typeof payload.text === "string" ? payload.text : "",
    created_at: payload.created_at ?? null,
    author_id: user.id_str ?? user.id ?? null,
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
    text: data.text ?? "",
    created_at: data.created_at ?? null,
    author_id: data.author_id ?? author.id ?? null,
    public_metrics: data.public_metrics ?? {},
    author,
    photos: collectApiPhotos(payload),
  });
}

function shapePost({ id, text, created_at, author_id, public_metrics, author, photos }) {
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
    },
    photos: Array.isArray(photos) ? photos : [],
  };
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

async function fetchPhotoBuffer(url) {
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
