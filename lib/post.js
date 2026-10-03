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

export function missingTokenMessage() {
  return [
    "X_BEARER_TOKEN is not set.",
    "Export a bearer token for the X API v2 before fetching a post.",
    "xpostplate does not read the macOS keychain and will not invent a token.",
    "Offline: xpostplate --fixture -o plate.png",
  ].join("\n");
}

export async function fetchPost(statusId, token) {
  const url = new URL(`https://api.x.com/2/tweets/${statusId}`);
  url.searchParams.set("tweet.fields", "text,created_at,public_metrics");
  url.searchParams.set("expansions", "author_id");
  url.searchParams.set("user.fields", "name,username,profile_image_url");

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
  });
}

function shapePost({ id, text, created_at, author_id, public_metrics, author }) {
  const metrics = {};
  for (const key of METRIC_KEYS) {
    const n = Number(public_metrics?.[key] ?? 0);
    metrics[key] = Number.isFinite(n) ? n : 0;
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
  };
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
