import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { timingSafeEqual } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";

// All provider credentials are read only by this server. Never add them to the HTML.
const IDEOGRAM_API_KEY = (process.env.IDEOGRAM_API_KEY || "").trim();
const RECRAFT_API_TOKEN = (process.env.RECRAFT_API_TOKEN || "").trim();
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || "").trim();
const XAI_API_KEY = (process.env.XAI_API_KEY || "").trim();
const MISTRAL_API_KEY = (process.env.MISTRAL_API_KEY || "").trim();
const APIFY_API_TOKEN = (process.env.APIFY_API_TOKEN || "").trim();
const OPENROUTER_API_KEY = (process.env.OPENROUTER_API_KEY || "").trim();
const APIFY_IMAGE_ACTOR_ID = (process.env.APIFY_IMAGE_ACTOR_ID || "").trim();
const APIFY_IMAGE_TASK_ID = (process.env.APIFY_IMAGE_TASK_ID || "").trim();
const APIFY_IMAGE_ACTOR_INPUT_JSON = (process.env.APIFY_IMAGE_ACTOR_INPUT_JSON || "").trim();
const STUDIO_ACCESS_KEY = (process.env.STUDIO_ACCESS_KEY || "").trim();
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",").map((origin) => origin.trim()).filter(Boolean);
const PUBLIC_DIR = path.join(__dirname, "public");
const MAX_PROMPT_CHARS = 10_000;
const MAX_IMAGES_PER_REQUEST = 4;
const MAX_IMAGE_BYTES = 64 * 1024 * 1024;
const MAX_JSON_RESPONSE_BYTES = 96 * 1024 * 1024;
const MAX_APIFY_WAIT_MS = 5 * 60 * 1000;

app.disable("x-powered-by");
// CORS is required because GitHub Pages frontend calls this Render API cross-origin.
app.use((req, res, next) => {
  const origin = req.get("Origin");
  if (origin && (ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGINS.includes("*"))) {
    res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGINS.includes("*") ? "*" : origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,X-Studio-Key");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: "1mb" }));

// Small in-memory guard against accidental loops. For a public deployment, also
// put this behind your hosting provider's authentication/rate-limiting layer.
const requestWindows = new Map();
function paidRouteRateLimit(req, res, next) {
  const key = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const windowMs = 60_000;
  const maxRequests = 8;
  let bucket = requestWindows.get(key);
  if (!bucket || now - bucket.startedAt >= windowMs) {
    bucket = { startedAt: now, count: 0 };
    requestWindows.set(key, bucket);
  }
  bucket.count += 1;
  if (requestWindows.size > 2_000) {
    for (const [ip, entry] of requestWindows) {
      if (now - entry.startedAt >= windowMs) requestWindows.delete(ip);
    }
  }
  if (bucket.count > maxRequests) {
    return res.status(429).json({ error: "Too many paid/API requests. Please wait a minute and try again." });
  }
  next();
}

function safeStringEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && timingSafeEqual(left, right);
}

function requireStudioAccess(req, res, next) {
  if (!STUDIO_ACCESS_KEY) return next();
  if (!safeStringEqual(req.get("X-Studio-Key"), STUDIO_ACCESS_KEY)) {
    return res.status(401).json({ error: "This studio is protected. Enter the server access key shown above the generator." });
  }
  next();
}

function configurationError(message) {
  const error = new Error(message);
  error.status = 503;
  return error;
}

app.get("/api/status", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({
    hasIdeogramKey: Boolean(IDEOGRAM_API_KEY),
    hasRecraftKey: Boolean(RECRAFT_API_TOKEN),
    hasGeminiKey: Boolean(GEMINI_API_KEY),
    hasGrokKey: Boolean(XAI_API_KEY),
    hasMistralKey: Boolean(MISTRAL_API_KEY),
    hasApifyKey: Boolean(APIFY_API_TOKEN),
    hasOpenRouterKey: Boolean(OPENROUTER_API_KEY),
    hasApifyActorId: Boolean(APIFY_IMAGE_ACTOR_ID),
    hasApifyTaskId: Boolean(APIFY_IMAGE_TASK_ID),
    hasApifyTarget: Boolean((APIFY_IMAGE_ACTOR_ID || APIFY_IMAGE_TASK_ID) && !(APIFY_IMAGE_ACTOR_ID && APIFY_IMAGE_TASK_ID)),
    requiresStudioAccess: Boolean(STUDIO_ACCESS_KEY)
  });
});

app.get("/health", (_req, res) => res.json({ ok: true }));

const ASPECT_RATIOS = new Set(["1:1", "2:3", "3:2", "4:3", "16:9", "9:16", "3:4", "4:5"]);
const IDEOGRAM_SIZES_1K = {
  "1:1": "1024x1024", "2:3": "832x1248", "3:2": "1248x832", "4:3": "1152x864",
  "16:9": "1280x720", "9:16": "720x1280", "3:4": "864x1152", "4:5": "896x1120"
};
const IDEOGRAM_SIZES_2K = {
  "1:1": "2048x2048", "2:3": "1664x2496", "3:2": "2496x1664", "4:3": "2304x1728",
  "16:9": "2560x1440", "9:16": "1440x2560", "3:4": "1728x2304", "4:5": "1792x2240"
};
const RECRAFT_SIZES_1K = {
  "1:1": "1024x1024", "2:3": "832x1280", "3:2": "1280x832", "4:3": "1216x896",
  "16:9": "1344x768", "9:16": "768x1344", "3:4": "896x1216", "4:5": "896x1152"
};
const RECRAFT_SIZES_2K = {
  "1:1": "2048x2048", "2:3": "1664x2560", "3:2": "2560x1664", "4:3": "2432x1792",
  "16:9": "2688x1536", "9:16": "1536x2688", "3:4": "1792x2432", "4:5": "1792x2304"
};

function parseSize(size, fallbackWidth = 1024, fallbackHeight = 1024) {
  const match = String(size || "").match(/^(\d{3,5})x(\d{3,5})$/i);
  return match ? { width: Number(match[1]), height: Number(match[2]) } : { width: fallbackWidth, height: fallbackHeight };
}

async function readJsonResponse(response, providerName) {
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > MAX_JSON_RESPONSE_BYTES) {
    throw new Error(`${providerName} response is larger than the studio's safety limit.`);
  }
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_JSON_RESPONSE_BYTES) {
    throw new Error(`${providerName} response is larger than the studio's safety limit.`);
  }
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (_) { data = { message: text.slice(0, 800) }; }
  if (!response.ok) {
    const detail = typeof data.error === "string"
      ? data.error
      : (data.error?.message || data.message || data.detail || data.statusMessage || "");
    if (response.status === 401 || response.status === 403) {
      throw new Error(`${providerName} rejected its API key or account permission. Check the key and provider account in .env.`);
    }
    if (response.status === 402) {
      throw new Error(`${providerName} reports insufficient credits or a payment requirement. Check the provider account balance.`);
    }
    if (response.status === 422) {
      throw new Error(`${providerName} refused this request under its validation or safety rules. Review the input and try again.`);
    }
    if (response.status === 429) {
      throw new Error(`${providerName} rate/credit limit reached. Wait, check provider credits, and retry.`);
    }
    throw new Error(`${providerName} request failed (HTTP ${response.status})${detail ? `: ${String(detail).slice(0, 500)}` : "."}`);
  }
  return data;
}

function sniffImageMime(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return "";
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (buffer.toString("ascii", 0, 6) === "GIF87a" || buffer.toString("ascii", 0, 6) === "GIF89a") return "image/gif";
  return "";
}

function bufferToImageDataUrl(buffer, contentType, providerName) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error(`${providerName} returned an empty image.`);
  if (buffer.length > MAX_IMAGE_BYTES) throw new Error(`${providerName} image is larger than the studio's 64 MB safety limit.`);
  const declared = String(contentType || "").split(";")[0].trim().toLowerCase();
  const mime = declared.startsWith("image/") ? declared : sniffImageMime(buffer);
  if (!mime || !mime.startsWith("image/")) throw new Error(`${providerName} returned a non-image file.`);
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

function normalizeInlineImage(value, mimeType = "image/png", providerName = "Provider") {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${providerName} returned no image bytes.`);
  const text = value.trim();
  if (text.startsWith("data:")) {
    const comma = text.indexOf(",");
    if (comma < 0) throw new Error(`${providerName} returned malformed image data.`);
    const header = text.slice(5, comma);
    const mime = header.split(";")[0].toLowerCase();
    if (!mime.startsWith("image/")) throw new Error(`${providerName} returned a non-image data URL.`);
    const raw = header.toLowerCase().includes(";base64")
      ? Buffer.from(text.slice(comma + 1), "base64")
      : Buffer.from(decodeURIComponent(text.slice(comma + 1)), "binary");
    return bufferToImageDataUrl(raw, mime, providerName);
  }
  const raw = Buffer.from(text, "base64");
  return bufferToImageDataUrl(raw, mimeType, providerName);
}

async function imageResponseToDataUrl(response, providerName) {
  if (!response.ok) throw new Error(`${providerName} image download failed (HTTP ${response.status}).`);
  const contentType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const declaredSize = Number(response.headers.get("content-length") || 0);
  if (declaredSize > MAX_IMAGE_BYTES) throw new Error(`${providerName} image is larger than the studio's 64 MB safety limit.`);
  const chunks = [];
  let total = 0;
  if (!response.body) throw new Error(`${providerName} returned an empty image response.`);
  for await (const chunk of response.body) {
    total += chunk.length;
    if (total > MAX_IMAGE_BYTES) {
      response.body.cancel().catch(() => {});
      throw new Error(`${providerName} image is larger than the studio's 64 MB safety limit.`);
    }
    chunks.push(chunk);
  }
  return bufferToImageDataUrl(Buffer.concat(chunks), contentType, providerName);
}

function isPrivateIp(address) {
  const family = isIP(address);
  if (family === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || (b === 0 && c === 0) || (b === 0 && c === 2))) ||
      (a === 198 && (b === 18 || b === 19 || b === 51 && c === 100)) ||
      (a === 203 && b === 0 && c === 113);
  }
  if (family === 6) {
    const value = address.toLowerCase();
    if (value === "::" || value === "::1" || value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe80:") || value.startsWith("ff")) return true;
    const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapped ? isPrivateIp(mapped[1]) : false;
  }
  return true;
}

async function assertPublicHttpsUrl(url) {
  if (url.protocol !== "https:") throw new Error("Apify image output must use HTTPS; refusing an unsafe URL.");
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("Apify image output points to a local/private host; refusing the URL.");
  }
  if (isIP(host)) {
    if (isPrivateIp(host)) throw new Error("Apify image output points to a local/private IP; refusing the URL.");
    return;
  }
  let addresses;
  try { addresses = await lookup(host, { all: true, verbatim: true }); }
  catch (_) { throw new Error("Could not verify the public host returned by the Apify Actor."); }
  if (!addresses.length || addresses.some((entry) => isPrivateIp(entry.address))) {
    throw new Error("Apify image output resolves to a local/private IP; refusing the URL.");
  }
}

async function downloadImageAsDataUrl(url, providerName, options = {}) {
  let parsed;
  try { parsed = new URL(url); } catch (_) { throw new Error(`${providerName} returned an invalid image URL.`); }
  if (parsed.protocol !== "https:") throw new Error(`${providerName} returned a non-HTTPS image link; refusing to download it.`);
  if (options.safeRemote) await assertPublicHttpsUrl(parsed);

  const headers = options.headers || {};
  const response = await fetch(parsed, {
    headers,
    redirect: options.safeRemote ? "error" : "follow",
    signal: AbortSignal.timeout(options.timeoutMs || 60_000)
  });
  return imageResponseToDataUrl(response, providerName);
}

function imageDimensionsFromDataUrl(dataUrl) {
  try {
    const comma = String(dataUrl || "").indexOf(",");
    if (comma < 0) return null;
    const buffer = Buffer.from(String(dataUrl).slice(comma + 1), "base64");
    if (buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    }
    if (buffer.length >= 30 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
      if (buffer.toString("ascii", 12, 16) === "VP8X") {
        const width = 1 + buffer[24] + (buffer[25] << 8) + (buffer[26] << 16);
        const height = 1 + buffer[27] + (buffer[28] << 8) + (buffer[29] << 16);
        return { width, height };
      }
    }
    if (buffer.length > 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
      let offset = 2;
      while (offset + 9 < buffer.length) {
        if (buffer[offset] !== 0xff) { offset += 1; continue; }
        while (buffer[offset] === 0xff) offset += 1;
        const marker = buffer[offset++];
        if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
        if (offset + 2 > buffer.length) break;
        const segmentLength = buffer.readUInt16BE(offset);
        if (segmentLength < 2 || offset + segmentLength > buffer.length) break;
        const isStartOfFrame = [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker);
        if (isStartOfFrame && offset + 7 <= buffer.length) {
          return { height: buffer.readUInt16BE(offset + 3), width: buffer.readUInt16BE(offset + 5) };
        }
        offset += segmentLength;
      }
    }
  } catch (_) {}
  return null;
}

function makeProviderResponse({ images, payload, width, height, modelName, startedAt }) {
  const measured = images?.[0]?.image ? imageDimensionsFromDataUrl(images[0].image) : null;
  const fallbackWidth = Number(payload.width) || 1024;
  const fallbackHeight = Number(payload.height) || 1024;
  return {
    images,
    width: measured?.width || width || fallbackWidth,
    height: measured?.height || height || fallbackHeight,
    aspectRatio: payload.aspectRatio,
    style: payload.styleName || payload.artStyle || "AI artwork",
    styleId: payload.artStyle || "realistic-photo",
    needsAlphaRemoval: Boolean(payload.needsAlphaRemoval),
    masteringMode: payload.masteringMode || "natural",
    enhancedPrompt: payload.prompt,
    modelUsed: modelName,
    durationMs: Date.now() - startedAt
  };
}

async function generateWithIdeogram(payload) {
  if (!IDEOGRAM_API_KEY) throw configurationError("Ideogram API is not configured. Add IDEOGRAM_API_KEY to the server .env file, then restart the server.");
  const ratio = ASPECT_RATIOS.has(payload.aspectRatio) ? payload.aspectRatio : "1:1";
  const sizeTable = payload.resolution === "standard" ? IDEOGRAM_SIZES_1K : IDEOGRAM_SIZES_2K;
  const size = sizeTable[ratio] || sizeTable["1:1"];
  const count = Math.min(MAX_IMAGES_PER_REQUEST, Math.max(1, Number(payload.numberOfImages) || 1));

  const form = new FormData();
  form.set("prompt", payload.prompt);
  form.set("magic_prompt", "on");
  form.set("quality", "high");
  form.set("size", size);
  form.set("num_images", String(count));
  if (Number.isInteger(payload.seed) && payload.seed >= 0 && payload.seed <= 2_147_483_647) form.set("seed", String(payload.seed));

  const response = await fetch("https://api.ideogram.ai/v2/image/generate/ideogram-4-5", {
    method: "POST",
    headers: { "Api-Key": IDEOGRAM_API_KEY },
    body: form,
    signal: AbortSignal.timeout(240_000)
  });
  const result = await readJsonResponse(response, "Ideogram 4.5");
  if (!Array.isArray(result.data) || !result.data.length) throw new Error("Ideogram returned no images. If the request is still processing, try again in a moment.");

  const images = [];
  for (const item of result.data.slice(0, count)) {
    if (item.is_image_safe === false || !item.url) continue;
    images.push({
      image: await downloadImageAsDataUrl(item.url, "Ideogram 4.5"),
      seed: Number.isInteger(item.seed) ? item.seed : (Number.isInteger(result.seed) ? result.seed : null),
      modelUsed: "Ideogram 4.5 Quality"
    });
  }
  if (!images.length) throw new Error("Ideogram did not return an image that passed its safety checks.");
  const dims = parseSize(result.data.find((item) => item.resolution)?.resolution, Number(size.split("x")[0]), Number(size.split("x")[1]));
  return makeProviderResponse({ images, payload, width: dims.width, height: dims.height, modelName: "Ideogram 4.5 Quality", startedAt: payload.__startedAt });
}

async function recraftImageToDataUrl(item) {
  if (item?.b64_json) return normalizeInlineImage(String(item.b64_json), "image/png", "Recraft V4.1");
  if (item?.url) return downloadImageAsDataUrl(item.url, "Recraft V4.1");
  throw new Error("Recraft returned no image bytes or download URL.");
}

async function generateWithRecraft(payload, pro) {
  if (!RECRAFT_API_TOKEN) throw configurationError("Recraft API is not configured. Add RECRAFT_API_TOKEN to the server .env file, then restart the server.");
  const ratio = ASPECT_RATIOS.has(payload.aspectRatio) ? payload.aspectRatio : "1:1";
  const model = pro ? "recraftv4_1_pro" : "recraftv4_1";
  const sizeTable = pro ? RECRAFT_SIZES_2K : RECRAFT_SIZES_1K;
  const size = sizeTable[ratio] || sizeTable["1:1"];
  const count = Math.min(MAX_IMAGES_PER_REQUEST, Math.max(1, Number(payload.numberOfImages) || 1));
  const body = {
    prompt: payload.prompt,
    model,
    size: ratio,
    n: count,
    response_format: "b64_json",
    image_format: "png"
  };
  if (Number.isInteger(payload.seed) && payload.seed >= 0 && payload.seed <= 2_147_483_647) body.random_seed = payload.seed;

  const response = await fetch("https://external.api.recraft.ai/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${RECRAFT_API_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(240_000)
  });
  const result = await readJsonResponse(response, "Recraft V4.1");
  if (!Array.isArray(result.data) || !result.data.length) throw new Error("Recraft returned no images.");

  const images = [];
  for (const item of result.data.slice(0, count)) {
    images.push({
      image: await recraftImageToDataUrl(item),
      seed: Number.isInteger(item.random_seed) ? item.random_seed : (Number.isInteger(payload.seed) ? payload.seed : null),
      modelUsed: pro ? "Recraft V4.1 Pro • 2K" : "Recraft V4.1 • 1K"
    });
  }
  const dims = parseSize(size);
  return makeProviderResponse({
    images, payload, width: dims.width, height: dims.height,
    modelName: pro ? "Recraft V4.1 Pro • 2K" : "Recraft V4.1 • 1K",
    startedAt: payload.__startedAt
  });
}

function findGeminiImageBlock(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return null;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findGeminiImageBlock(item, seen);
      if (found) return found;
    }
    return null;
  }
  if (typeof value.data === "string" && (
    value.type === "image" || value.type === "output_image" ||
    String(value.mime_type || value.mimeType || "").startsWith("image/")
  )) return value;
  for (const [key, child] of Object.entries(value)) {
    if (key === "output_image" && child && typeof child.data === "string") return child;
    const found = findGeminiImageBlock(child, seen);
    if (found) return found;
  }
  return null;
}

async function generateWithGemini(payload) {
  if (!GEMINI_API_KEY) throw configurationError("Google Gemini / AI Studio is not configured. Add GEMINI_API_KEY to the server .env file, then restart the server.");
  const ratio = ASPECT_RATIOS.has(payload.aspectRatio) ? payload.aspectRatio : "1:1";
  const imageSize = payload.resolution === "standard" ? "1K" : payload.resolution === "high" ? "2K" : "4K";
  const count = Math.min(MAX_IMAGES_PER_REQUEST, Math.max(1, Number(payload.numberOfImages) || 1));
  const images = [];

  // Interactions API returns one convenience output image per call, so a batch
  // is made as separate calls and is charged according to Google's current plan.
  for (let index = 0; index < count; index += 1) {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: { "x-goog-api-key": GEMINI_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gemini-nano-banana-2.1",
        input: payload.prompt,
        response_format: { type: "image", mime_type: "image/png", aspect_ratio: ratio, image_size: imageSize }
      }),
      signal: AbortSignal.timeout(240_000)
    });
    const result = await readJsonResponse(response, "Google Gemini / AI Studio");
    const block = result.output_image || findGeminiImageBlock(result.steps || result);
    if (!block?.data) throw new Error("Gemini returned no image block. Try revising the prompt or check the model/API access in Google AI Studio.");
    images.push({
      image: normalizeInlineImage(block.data, block.mime_type || block.mimeType || "image/png", "Gemini Nano Banana 2.1"),
      seed: null,
      modelUsed: `Gemini Nano Banana 2.1 • ${imageSize}`
    });
  }
  return makeProviderResponse({
    images, payload, modelName: `Gemini Nano Banana 2.1 • ${imageSize}`,
    startedAt: payload.__startedAt
  });
}

async function grokImageToDataUrl(item) {
  if (item?.b64_json) return normalizeInlineImage(String(item.b64_json), item.mime_type || "image/jpeg", "Grok Imagine 2.0");
  if (item?.url) return downloadImageAsDataUrl(item.url, "Grok Imagine 2.0");
  throw new Error("Grok Imagine returned no image bytes or download URL.");
}

async function generateWithGrok(payload) {
  if (!XAI_API_KEY) throw configurationError("Grok is not configured. Add XAI_API_KEY to the server .env file, then restart the server.");
  const ratio = ASPECT_RATIOS.has(payload.aspectRatio) ? payload.aspectRatio : "1:1";
  const resolution = payload.resolution === "standard" ? "1k" : "2k";
  const count = Math.min(MAX_IMAGES_PER_REQUEST, Math.max(1, Number(payload.numberOfImages) || 1));
  const images = [];

  for (let index = 0; index < count; index += 1) {
    const response = await fetch("https://api.x.ai/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${XAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "grok-imagine-image-2.0",
        prompt: payload.prompt,
        aspect_ratio: ratio,
        resolution,
        quality: "medium",
        response_format: "b64_json",
        n: 1
      }),
      signal: AbortSignal.timeout(240_000)
    });
    const result = await readJsonResponse(response, "xAI Grok Imagine 2.0");
    const item = Array.isArray(result.data) ? result.data[0] : null;
    if (!item) throw new Error("Grok Imagine returned no image.");
    images.push({ image: await grokImageToDataUrl(item), seed: null, modelUsed: `Grok Imagine Image 2.0 • ${resolution.toUpperCase()} • medium` });
  }
  return makeProviderResponse({
    images, payload, modelName: `Grok Imagine Image 2.0 • ${resolution.toUpperCase()} • medium`,
    startedAt: payload.__startedAt
  });
}

function collectMistralImageParts(value, result = [], seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return result;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) collectMistralImageParts(item, result, seen);
    return result;
  }
  if (value.type === "tool_file" && value.file_id) {
    result.push({ fileId: String(value.file_id), fileType: String(value.file_type || "png") });
  }
  if (value.type === "image_url" && value.image_url) {
    const url = typeof value.image_url === "string" ? value.image_url : value.image_url.url;
    if (url) result.push({ url: String(url) });
  }
  if (typeof value.url === "string" && /^https:\/\//i.test(value.url)) result.push({ url: value.url });
  if (typeof value.content === "string") {
    const urls = value.content.match(/https:\/\/files\.mistral\.ai\/[^\s)\]}>"']+/gi) || [];
    for (const url of urls) result.push({ url });
  }
  for (const child of Object.values(value)) collectMistralImageParts(child, result, seen);
  return result;
}

async function downloadMistralImageUrl(url) {
  let parsed;
  try { parsed = new URL(url); } catch (_) { throw new Error("Mistral returned an invalid image URL."); }
  if (parsed.protocol !== "https:" || !(parsed.hostname === "mistral.ai" || parsed.hostname.endsWith(".mistral.ai"))) {
    throw new Error("Mistral returned an unexpected image host; refusing to download it.");
  }
  return downloadImageAsDataUrl(parsed.toString(), "Mistral image generation");
}

async function downloadMistralFile(fileId, fileType = "png") {
  const url = `https://api.mistral.ai/v1/files/${encodeURIComponent(fileId)}/content`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${MISTRAL_API_KEY}` },
    signal: AbortSignal.timeout(60_000)
  });
  const expected = String(fileType).toLowerCase().includes("jpeg") || String(fileType).toLowerCase().includes("jpg") ? "image/jpeg" : "image/png";
  if (!response.ok) {
    const error = await readJsonResponse(response, "Mistral Files API");
    throw new Error(error.error?.message || error.message || "Mistral image file could not be downloaded.");
  }
  return imageResponseToDataUrl(response, "Mistral image generation", expected);
}

async function generateWithMistral(payload) {
  if (!MISTRAL_API_KEY) throw configurationError("Mistral is not configured. Add MISTRAL_API_KEY to the server .env file, then restart the server.");
  const ratio = ASPECT_RATIOS.has(payload.aspectRatio) ? payload.aspectRatio : "1:1";
  const count = Math.min(MAX_IMAGES_PER_REQUEST, Math.max(1, Number(payload.numberOfImages) || 1));
  const images = [];

  for (let index = 0; index < count; index += 1) {
    const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${MISTRAL_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "mistral-small-latest",
        messages: [{
          role: "user",
          content: `Create exactly one image using the image generation tool. Aspect ratio: ${ratio}.\n\n${payload.prompt}`
        }],
        tools: [{ type: "image_generation" }]
      }),
      signal: AbortSignal.timeout(240_000)
    });
    const result = await readJsonResponse(response, "Mistral image generation");
    const parts = collectMistralImageParts(result);
    const part = parts[0];
    if (!part) throw new Error("Mistral returned no image file or image URL. Check that image_generation is enabled for this Mistral account/model.");
    const image = part.fileId
      ? await downloadMistralFile(part.fileId, part.fileType)
      : await downloadMistralImageUrl(part.url);
    images.push({ image, seed: null, modelUsed: "Mistral built-in image_generation tool" });
  }
  return makeProviderResponse({
    images, payload, modelName: "Mistral built-in image_generation tool",
    startedAt: payload.__startedAt
  });
}

const DEFAULT_APIFY_INPUT_TEMPLATE = {
  prompt: "{{prompt}}",
  aspectRatio: "{{aspectRatio}}",
  numberOfImages: "{{numberOfImages}}",
  resolution: "{{resolution}}"
};

function applyApifyTemplate(value, context) {
  if (Array.isArray(value)) return value.map((item) => applyApifyTemplate(item, context));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, applyApifyTemplate(child, context)]));
  }
  if (typeof value !== "string") return value;
  const exact = value.match(/^\{\{\s*([a-zA-Z0-9_]+)\s*\}\}$/);
  if (exact) return context[exact[1]] ?? "";
  return value.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => String(context[key] ?? ""));
}

function makeApifyInput(payload) {
  let template = DEFAULT_APIFY_INPUT_TEMPLATE;
  if (APIFY_IMAGE_ACTOR_INPUT_JSON) {
    try { template = JSON.parse(APIFY_IMAGE_ACTOR_INPUT_JSON); }
    catch (_) { throw new Error("APIFY_IMAGE_ACTOR_INPUT_JSON must be valid JSON. Check the server .env file."); }
  }
  const context = {
    prompt: payload.prompt,
    negativePrompt: payload.negativePrompt || "",
    aspectRatio: payload.aspectRatio,
    numberOfImages: Math.min(MAX_IMAGES_PER_REQUEST, Math.max(1, Number(payload.numberOfImages) || 1)),
    resolution: payload.resolution || "ultra",
    width: Number(payload.width) || 0,
    height: Number(payload.height) || 0,
    styleName: payload.styleName || "AI artwork",
    artStyle: payload.artStyle || "realistic-photo",
    detailLevel: payload.detailLevel || "high"
  };
  return applyApifyTemplate(template, context);
}

function collectApifyImageCandidates(value, candidates = [], seen = new Set(), keyHint = "", depth = 0) {
  if (depth > 12 || value === null || value === undefined) return candidates;
  if (typeof value === "string") {
    const text = value.trim();
    if (text.startsWith("data:image/")) {
      candidates.push({ dataUrl: text });
    } else if (/^https:\/\//i.test(text) && (
      /image|photo|picture|file|output|result|url/i.test(keyHint) || /\.(?:png|jpe?g|webp|gif)(?:[?#]|$)/i.test(text)
    )) {
      candidates.push({ url: text });
    } else if (/^(?:image|photo|picture|base64|b64_json|imagedata)$/i.test(keyHint) && text.length > 256 && /^[a-z0-9+/=\s]+$/i.test(text)) {
      candidates.push({ base64: text.replace(/\s/g, ""), mimeType: "image/png" });
    }
    return candidates;
  }
  if (typeof value !== "object" || seen.has(value)) return candidates;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) collectApifyImageCandidates(item, candidates, seen, keyHint, depth + 1);
    return candidates;
  }
  const declaredMime = String(value.mime_type || value.mimeType || value.contentType || value.content_type || "");
  if (declaredMime.toLowerCase().startsWith("image/")) {
    for (const key of ["data", "base64", "b64_json", "imageData", "image_data"]) {
      if (typeof value[key] === "string" && !value[key].startsWith("data:")) {
        candidates.push({ base64: value[key], mimeType: declaredMime });
        break;
      }
    }
  }
  for (const [key, child] of Object.entries(value)) {
    collectApifyImageCandidates(child, candidates, seen, key, depth + 1);
  }
  return candidates;
}

async function apifyJson(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { ...(init.headers || {}), Authorization: `Bearer ${APIFY_API_TOKEN}` }
  });
  return readJsonResponse(response, "Apify");
}

async function runApifyActor(payload) {
  if (!APIFY_API_TOKEN) throw configurationError("Apify is not configured. Add APIFY_API_TOKEN to the server .env file, then restart the server.");
  if (Boolean(APIFY_IMAGE_ACTOR_ID) === Boolean(APIFY_IMAGE_TASK_ID)) {
    throw configurationError("Set exactly one of APIFY_IMAGE_ACTOR_ID or APIFY_IMAGE_TASK_ID in the server .env file.");
  }
  const targetId = APIFY_IMAGE_TASK_ID || APIFY_IMAGE_ACTOR_ID;
  if (!/^[A-Za-z0-9._~-]{1,120}$/.test(targetId)) throw configurationError("Apify Actor/Task ID has an unsupported format. Use an ID or owner~name, without a URL.");

  const isTask = Boolean(APIFY_IMAGE_TASK_ID);
  const targetPath = isTask ? `actor-tasks/${encodeURIComponent(targetId)}` : `acts/${encodeURIComponent(targetId)}`;
  const input = makeApifyInput(payload);
  const startUrl = new URL(`https://api.apify.com/v2/${targetPath}/runs`);
  startUrl.searchParams.set("waitForFinish", "60");
  let runResult = await apifyJson(startUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(70_000)
  });
  let run = runResult.data || runResult;
  if (!run.id) throw new Error("Apify started no run. Check the Actor/Task ID and its input schema.");

  const terminalStatuses = new Set(["SUCCEEDED", "FAILED", "TIMED-OUT", "ABORTED", "SKIPPED"]);
  const deadline = Date.now() + MAX_APIFY_WAIT_MS;
  while (!terminalStatuses.has(String(run.status || "").toUpperCase()) && Date.now() < deadline) {
    const pollUrl = new URL(`https://api.apify.com/v2/actor-runs/${encodeURIComponent(run.id)}`);
    pollUrl.searchParams.set("waitForFinish", "60");
    runResult = await apifyJson(pollUrl, { signal: AbortSignal.timeout(70_000) });
    run = runResult.data || runResult;
  }
  if (String(run.status || "").toUpperCase() !== "SUCCEEDED") {
    const statusMessage = String(run.statusMessage || run.status || "still running").slice(0, 240);
    throw new Error(`Apify Actor did not finish successfully (${statusMessage}). Check the Actor run in Apify Console; the studio waits up to five minutes.`);
  }

  const candidates = [];
  if (run.defaultDatasetId) {
    const datasetUrl = new URL(`https://api.apify.com/v2/datasets/${encodeURIComponent(run.defaultDatasetId)}/items`);
    datasetUrl.searchParams.set("format", "json");
    datasetUrl.searchParams.set("clean", "true");
    datasetUrl.searchParams.set("limit", "100");
    const dataset = await apifyJson(datasetUrl, { signal: AbortSignal.timeout(60_000) });
    collectApifyImageCandidates(dataset, candidates);
  }

  const images = [];
  const seenCandidates = new Set();
  for (const candidate of candidates) {
    if (images.length >= Math.max(1, Number(payload.numberOfImages) || 1)) break;
    const marker = candidate.dataUrl || candidate.url || candidate.base64;
    if (!marker || seenCandidates.has(marker)) continue;
    seenCandidates.add(marker);
    try {
      let image;
      if (candidate.dataUrl) image = normalizeInlineImage(candidate.dataUrl, "image/png", "Apify Actor");
      else if (candidate.base64) image = normalizeInlineImage(candidate.base64, candidate.mimeType || "image/png", "Apify Actor");
      else {
        const parsed = new URL(candidate.url);
        const headers = parsed.hostname === "api.apify.com" ? { Authorization: `Bearer ${APIFY_API_TOKEN}` } : {};
        image = await downloadImageAsDataUrl(candidate.url, "Apify Actor", { safeRemote: true, headers, timeoutMs: 60_000 });
      }
      images.push({ image, seed: null, modelUsed: `Apify ${isTask ? "Task" : "Actor"} • ${targetId}` });
    } catch (error) {
      console.warn("[apify:image-candidate]", error.message);
    }
  }

  // Some image Actors save binaries to the run's default key-value store rather
  // than the dataset. Try image-named records as a fallback.
  if (!images.length && run.defaultKeyValueStoreId) {
    const keysUrl = new URL(`https://api.apify.com/v2/key-value-stores/${encodeURIComponent(run.defaultKeyValueStoreId)}/keys`);
    keysUrl.searchParams.set("limit", "100");
    const keyResult = await apifyJson(keysUrl, { signal: AbortSignal.timeout(60_000) });
    const keys = keyResult.data?.items || keyResult.items || [];
    const imageKeys = keys.filter((item) => {
      const key = String(item.key || "");
      const type = String(item.contentType || item.content_type || "").toLowerCase();
      return type.startsWith("image/") || /image|photo|picture/i.test(key) || /\.(?:png|jpe?g|webp|gif)$/i.test(key);
    }).slice(0, 12);
    for (const item of imageKeys) {
      if (images.length >= Math.max(1, Number(payload.numberOfImages) || 1)) break;
      const key = String(item.key || "");
      const recordUrl = `https://api.apify.com/v2/key-value-stores/${encodeURIComponent(run.defaultKeyValueStoreId)}/records/${encodeURIComponent(key)}`;
      try {
        const response = await fetch(recordUrl, {
          headers: { Authorization: `Bearer ${APIFY_API_TOKEN}` },
          signal: AbortSignal.timeout(60_000)
        });
        images.push({ image: await imageResponseToDataUrl(response, "Apify Actor"), seed: null, modelUsed: `Apify ${isTask ? "Task" : "Actor"} • ${targetId}` });
      } catch (error) {
        console.warn("[apify:key-value-image]", error.message);
      }
    }
  }

  if (!images.length) {
    throw new Error("Apify run succeeded but no image was found in its dataset or image-named key-value records. Adjust APIFY_IMAGE_ACTOR_INPUT_JSON or choose an Actor that returns image URLs/files.");
  }
  return makeProviderResponse({
    images, payload, modelName: `Apify ${isTask ? "Task" : "Actor"} • ${targetId}`,
    startedAt: payload.__startedAt
  });
}


app.get("/api/openrouter/models", requireStudioAccess, async (_req, res) => {
  res.set("Cache-Control", "no-store");
  if (!OPENROUTER_API_KEY) return res.status(503).json({ error: "Add OPENROUTER_API_KEY to the server .env file." });
  try {
    const response = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}` },
      signal: AbortSignal.timeout(20000)
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return res.status(response.status).json({ error: body.error?.message || "Could not load OpenRouter models." });
    // IMPORTANT: architecture.modality describes accepted INPUT modalities on
    // many OpenRouter records. It can include image-only INPUT support, which
    // does not mean the model can GENERATE images. Only advertise models whose
    // declared output_modalities explicitly contains "image".
    const models = (body.data || []).filter((m) => {
      const outputs = Array.isArray(m.architecture?.output_modalities)
        ? m.architecture.output_modalities
        : [];
      return outputs.includes("image");
    }).map((m) => ({
      id: String(m.id || ""),
      name: String(m.name || m.id || ""),
      description: String(m.description || "").slice(0, 240),
      contextLength: m.context_length || null
    })).filter((m) => m.id);
    return res.json({ models });
  } catch (error) {
    return res.status(502).json({ error: error.message || "OpenRouter model list request failed." });
  }
});

async function generateWithOpenRouter(payload) {
  if (!OPENROUTER_API_KEY) throw configurationError("OpenRouter is not configured. Add OPENROUTER_API_KEY to server .env.");
  const model = String(payload.openRouterModel || "").trim();
  if (!model || model.length > 200) throw new Error("Choose an OpenRouter image model first.");
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost:3000",
      "X-Title": "AI Image Studio"
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: payload.prompt }],
      modalities: ["image", "text"]
    }),
    signal: AbortSignal.timeout(180000)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = body.error?.message || `HTTP ${response.status}`;
    if (/no endpoints found|requested output modalities/i.test(detail)) {
      throw new Error(`OpenRouter has no available image-generation endpoint for model "${model}". The model may support image input only, or image output may be unavailable for your account/provider. Go back to the model list and choose a model whose output modality includes image. Original: ${detail}`);
    }
    throw new Error(`OpenRouter request failed: ${detail}`);
  }
  const message = body.choices?.[0]?.message || {};
  const found = [];
  for (const item of (message.images || [])) {
    const url = item.image_url?.url || item.url || "";
    if (url.startsWith("data:image/")) found.push({ image: url, seed: null, modelUsed: model });
    else if (url.startsWith("https://")) {
      found.push({ image: await downloadImageAsDataUrl(url, "OpenRouter"), seed: null, modelUsed: model });
    }
  }
  if (!found.length) throw new Error("This OpenRouter model did not return an image. Choose a model with image output support.");
  return makeProviderResponse({
    images: found.slice(0, Math.max(1, Number(payload.numberOfImages) || 1)),
    payload, modelName: `OpenRouter • ${model}`, startedAt: payload.__startedAt
  });
}


const SUPPORTED_PROVIDERS = new Set(["openrouter-image",
  "ideogram-4-5", "recraft-v4-1", "recraft-v4-1-pro",
  "gemini-nano-banana-2-1", "grok-imagine-image-2", "mistral-image", "apify-image"
]);

app.post("/api/generate-provider", paidRouteRateLimit, requireStudioAccess, async (req, res) => {
  const payload = req.body || {};
  const provider = payload.engine;
  const prompt = typeof payload.prompt === "string" ? payload.prompt.trim() : "";
  if (!prompt) return res.status(400).json({ error: "Write a prompt before generating an image." });
  if (prompt.length > MAX_PROMPT_CHARS) return res.status(400).json({ error: `Prompt is too long. Maximum: ${MAX_PROMPT_CHARS} characters.` });
  if (!Number.isInteger(Number(payload.numberOfImages)) || Number(payload.numberOfImages) < 1 || Number(payload.numberOfImages) > MAX_IMAGES_PER_REQUEST) {
    return res.status(400).json({ error: `Choose from 1 to ${MAX_IMAGES_PER_REQUEST} images per request.` });
  }
  if (!SUPPORTED_PROVIDERS.has(provider)) return res.status(400).json({ error: "Unknown paid/API image provider." });

  const startedAt = Date.now();
  const normalized = {
    ...payload,
    prompt,
    __startedAt: startedAt,
    aspectRatio: ASPECT_RATIOS.has(payload.aspectRatio) ? payload.aspectRatio : "1:1"
  };
  try {
    let result;
    if (provider === "ideogram-4-5") result = await generateWithIdeogram(normalized);
    else if (provider === "recraft-v4-1") result = await generateWithRecraft(normalized, false);
    else if (provider === "recraft-v4-1-pro") result = await generateWithRecraft(normalized, true);
    else if (provider === "gemini-nano-banana-2-1") result = await generateWithGemini(normalized);
    else if (provider === "grok-imagine-image-2") result = await generateWithGrok(normalized);
    else if (provider === "mistral-image") result = await generateWithMistral(normalized);
    else if (provider === "openrouter-image") result = await generateWithOpenRouter(normalized);
    else result = await runApifyActor(normalized);
    return res.json(result);
  } catch (error) {
    const status = Number.isInteger(error.status) ? error.status : 502;
    console.error(`[provider:${provider}]`, error.message);
    return res.status(status).json({ error: error.message || "Image provider request failed." });
  }
});

// Only the public folder is served. .env and server code are not exposed.
app.use(express.static(PUBLIC_DIR, { dotfiles: "deny", etag: true, maxAge: 0 }));
app.get("/", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "index.html")));
app.use((req, res) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ error: "API route not found." });
  return res.status(404).send("Not found");
});

app.listen(PORT, HOST, () => {
  console.log(`AI Studio listening at http://localhost:${PORT}`);
  console.log(`Ideogram API: ${IDEOGRAM_API_KEY ? "configured" : "not configured"}`);
  console.log(`Recraft API: ${RECRAFT_API_TOKEN ? "configured" : "not configured"}`);
  console.log(`Gemini / Google AI Studio API: ${GEMINI_API_KEY ? "configured" : "not configured"}`);
  console.log(`xAI Grok API: ${XAI_API_KEY ? "configured" : "not configured"}`);
  console.log(`Mistral API: ${MISTRAL_API_KEY ? "configured" : "not configured"}`);
  console.log(`Apify API: ${APIFY_API_TOKEN ? "configured" : "not configured"}; image target: ${APIFY_IMAGE_TASK_ID ? "task" : APIFY_IMAGE_ACTOR_ID ? "actor" : "not configured"}`);
  if (STUDIO_ACCESS_KEY) console.log("Studio access key protection is enabled.");
  else console.warn("No STUDIO_ACCESS_KEY set. Keep this server private or add access control before publishing it publicly.");
});
