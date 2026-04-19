function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveDefaultBaseUrl() {
  if (typeof window === "undefined") {
    return "http://localhost:4000";
  }

  const { hostname } = window.location;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "http://localhost:4000";
  }

  return "/gateway";
}

function normalizeBaseUrl(value) {
  return String(value ?? resolveDefaultBaseUrl()).replace(/\/+$/, "");
}

const API_BASE_URL = normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL || resolveDefaultBaseUrl());
const DEFAULT_RESULT_LIMIT = parsePositiveInteger(import.meta.env.VITE_DEFAULT_RESULT_LIMIT, 5);
const MAX_RESULT_LIMIT = parsePositiveInteger(import.meta.env.VITE_MAX_RESULT_LIMIT, 20);
const NETWORK_RESULT_LIMIT = 50;
const RETRY_SEARCH_PROMPT = "Try to search one more time.";

function withRetrySearchPrompt(message) {
  const normalized = String(message ?? "Something went wrong while loading recommendations.").trim();
  if (/try to search one more time/i.test(normalized)) {
    return normalized;
  }

  return `${normalized} ${RETRY_SEARCH_PROMPT}`;
}

async function parseResponse(response) {
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(withRetrySearchPrompt(payload.error));
  }

  return payload;
}

async function fetchJson(url, options = {}) {
  try {
    const response = await fetch(url, options);
    return await parseResponse(response);
  } catch (error) {
    throw new Error(withRetrySearchPrompt(error.message));
  }
}

function toSearchExclusion(item) {
  return {
    slug: String(item?.slug ?? "").trim(),
    name: String(item?.name ?? "").trim(),
    url: String(item?.url ?? "").trim(),
  };
}

export async function searchTools(query, options = {}) {
  const normalizedOptions = typeof options === "number" ? { limit: options } : options;
  const limit = normalizedOptions.limit ?? DEFAULT_RESULT_LIMIT;
  const excludeResults = Array.isArray(normalizedOptions.excludeResults)
    ? normalizedOptions.excludeResults.map(toSearchExclusion).filter((item) => item.slug || item.name || item.url)
    : [];
  const body = { query, limit };

  if (excludeResults.length) {
    body.excludeResults = excludeResults;
  }

  return fetchJson(`${API_BASE_URL}/api/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

export async function fetchApplicationNetwork(query, options = {}) {
  const normalizedOptions = typeof options === "number" ? { limit: options } : options;
  const limit = normalizedOptions.limit ?? NETWORK_RESULT_LIMIT;
  return fetchJson(`${API_BASE_URL}/api/search/network`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, limit }),
  });
}

export async function fetchRecentSearches() {
  return fetchJson(`${API_BASE_URL}/api/sessions/recent`);
}

export { API_BASE_URL, DEFAULT_RESULT_LIMIT, MAX_RESULT_LIMIT, NETWORK_RESULT_LIMIT };
