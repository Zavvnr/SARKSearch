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
  const normalized = String(value ?? resolveDefaultBaseUrl()).trim().replace(/\/+$/, "");
  if (!normalized || /^https?:\/\//i.test(normalized) || normalized.startsWith("/")) {
    return normalized;
  }

  return `https://${normalized}`;
}

function buildAuthHeaders(sessionToken, extraHeaders = {}) {
  const headers = { ...extraHeaders };

  if (sessionToken) {
    headers.Authorization = `Bearer ${sessionToken}`;
  }

  return headers;
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

function normalizeRequestError(message, appendRetryPrompt) {
  const normalized = String(message ?? "Something went wrong.").trim() || "Something went wrong.";
  return appendRetryPrompt ? withRetrySearchPrompt(normalized) : normalized;
}

async function parseResponse(response, options = {}) {
  const appendRetryPrompt = options.appendRetryPrompt === true;
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(normalizeRequestError(payload.error, appendRetryPrompt));
  }

  return payload;
}

async function fetchJson(url, options = {}, settings = {}) {
  try {
    const response = await fetch(url, options);
    return await parseResponse(response, settings);
  } catch (error) {
    throw new Error(normalizeRequestError(error.message, settings.appendRetryPrompt === true));
  }
}

function toSearchExclusion(item) {
  return {
    slug: String(item?.slug ?? "").trim(),
    name: String(item?.name ?? "").trim(),
    url: String(item?.url ?? "").trim(),
  };
}

export async function startGuestSession() {
  return fetchJson(`${API_BASE_URL}/api/auth/guest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });
}

export async function createAccount({ email, password, name }) {
  return fetchJson(`${API_BASE_URL}/api/auth/signup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password, name }),
  });
}

export async function loginWithPassword({ email, password }) {
  return fetchJson(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
}

export async function fetchCurrentSession(sessionToken) {
  return fetchJson(`${API_BASE_URL}/api/auth/session`, {
    headers: buildAuthHeaders(sessionToken),
  });
}

export async function logoutSession(sessionToken) {
  return fetchJson(`${API_BASE_URL}/api/auth/logout`, {
    method: "POST",
    headers: buildAuthHeaders(sessionToken, {
      "Content-Type": "application/json",
    }),
  });
}

export async function searchTools(query, options = {}) {
  const normalizedOptions = typeof options === "number" ? { limit: options } : options;
  const limit = normalizedOptions.limit ?? DEFAULT_RESULT_LIMIT;
  const skipCache = normalizedOptions.skipCache === true;
  const skipSessionSave = normalizedOptions.skipSessionSave === true;
  const sessionToken = String(normalizedOptions.sessionToken ?? "").trim();
  const excludeResults = Array.isArray(normalizedOptions.excludeResults)
    ? normalizedOptions.excludeResults.map(toSearchExclusion).filter((item) => item.slug || item.name || item.url)
    : [];
  const body = { query, limit };

  if (skipCache) {
    body.skipCache = true;
  }

  if (skipSessionSave) {
    body.skipSessionSave = true;
  }

  if (excludeResults.length) {
    body.excludeResults = excludeResults;
  }

  return fetchJson(
    `${API_BASE_URL}/api/search`,
    {
      method: "POST",
      headers: buildAuthHeaders(sessionToken, {
        "Content-Type": "application/json",
      }),
      body: JSON.stringify(body),
    },
    { appendRetryPrompt: true },
  );
}

export async function fetchApplicationNetwork(query, options = {}) {
  const normalizedOptions = typeof options === "number" ? { limit: options } : options;
  const limit = normalizedOptions.limit ?? NETWORK_RESULT_LIMIT;
  const sessionToken = String(normalizedOptions.sessionToken ?? "").trim();

  return fetchJson(
    `${API_BASE_URL}/api/search/network`,
    {
      method: "POST",
      headers: buildAuthHeaders(sessionToken, {
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({ query, limit }),
    },
    { appendRetryPrompt: true },
  );
}

export async function fetchRecentSearches(sessionToken) {
  return fetchJson(`${API_BASE_URL}/api/sessions/recent`, {
    headers: buildAuthHeaders(sessionToken),
  });
}

export { API_BASE_URL, DEFAULT_RESULT_LIMIT, MAX_RESULT_LIMIT, NETWORK_RESULT_LIMIT };
