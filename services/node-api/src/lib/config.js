import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const serviceRoot = path.resolve(currentDir, "../..");
const envPath = process.env.SARKSEARCH_NODE_ENV_PATH || path.join(serviceRoot, ".env");

export const EXAMPLE_ENV_KEYS = Object.freeze([
  "PORT",
  "HOST",
  "FASTAPI_BASE_URL",
  "CACHE_TTL_MS",
  "REQUEST_TIMEOUT_MS",
  "CORS_ORIGIN",
  "MONGODB_URI",
  "DEFAULT_SEARCH_LIMIT",
  "MAX_SEARCH_LIMIT",
  "RECENT_SEARCH_LIMIT",
]);

export const SUPPORTED_ENV_KEYS = Object.freeze([
  ...EXAMPLE_ENV_KEYS,
  "ENGINE_URL",
]);

dotenv.config({ path: envPath });

function getString(name, fallback = "") {
  const value = String(process.env[name] ?? fallback).trim();
  return value || fallback;
}

function getNumber(name, fallback, minimum = 1) {
  const parsed = Number.parseInt(String(process.env[name] ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < minimum) {
    return fallback;
  }

  return parsed;
}

function getOrigins(name, fallback) {
  const value = getString(name, fallback);
  if (value === "*") {
    return "*";
  }

  const origins = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return origins.length ? origins : fallback.split(",").map((item) => item.trim());
}

function normalizeServiceUrl(value, fallback) {
  const normalized = getString(value, fallback).replace(/\/+$/, "");
  if (!normalized || /^https?:\/\//i.test(normalized)) {
    return normalized;
  }

  return `http://${normalized}`;
}

export function buildConfig() {
  const defaultSearchLimit = getNumber("DEFAULT_SEARCH_LIMIT", 5);
  const maxSearchLimit = getNumber("MAX_SEARCH_LIMIT", 20, defaultSearchLimit);

  return {
    host: getString("HOST", "127.0.0.1"),
    port: getNumber("PORT", 4000),
    fastApiBaseUrl: normalizeServiceUrl("ENGINE_URL", getString("FASTAPI_BASE_URL", "http://127.0.0.1:8000")),
    cacheTtlMs: getNumber("CACHE_TTL_MS", 300000),
    requestTimeoutMs: getNumber("REQUEST_TIMEOUT_MS", 100000),
    corsOrigins: getOrigins("CORS_ORIGIN", "http://127.0.0.1:5173,http://localhost:5173"),
    mongoDbUri: getString("MONGODB_URI", ""),
    defaultSearchLimit: Math.min(defaultSearchLimit, maxSearchLimit),
    maxSearchLimit,
    recentSearchLimit: getNumber("RECENT_SEARCH_LIMIT", 6),
  };
}

export const config = buildConfig();
