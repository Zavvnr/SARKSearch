import cors from "cors";
import express from "express";
import { config } from "./lib/config.js";
import { TtlCache } from "./lib/cache.js";
import {
  createGuestSession,
  getPersistenceMode,
  invalidateAuthSession,
  initializePersistence,
  listRecentSearches,
  loginUser,
  registerUser,
  resolveAuthSession,
  saveSearchSession,
} from "./lib/store.js";
import {
  getUpstreamErrorMessage,
  mapUpstreamStatus,
  readUpstreamPayload,
} from "./lib/upstream.js";

const app = express();
const cache = new TtlCache(config.cacheTtlMs);
const MAX_EXCLUDE_RESULTS = 20;
const NETWORK_RESULT_LIMIT = 50;

function buildCorsOptions() {
  if (config.corsOrigins === "*") {
    return { origin: true };
  }

  const allowedOrigins = new Set(config.corsOrigins);
  return {
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin ${origin} is not allowed by CORS.`));
    },
  };
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.requestTimeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function normalizeExcludeResults(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set();
  const normalizedResults = [];

  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const normalized = {
      slug: String(item.slug ?? "").trim(),
      name: String(item.name ?? "").trim(),
      url: String(item.url ?? "").trim(),
    };

    if (!normalized.slug && !normalized.name && !normalized.url) {
      continue;
    }

    const key = `${normalized.slug.toLowerCase()}|${normalized.name.toLowerCase()}|${normalized.url.toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalizedResults.push(normalized);

    if (normalizedResults.length >= MAX_EXCLUDE_RESULTS) {
      break;
    }
  }

  return normalizedResults;
}

function buildSearchCacheKey(query, limit, excludeResults) {
  const exclusionKey = excludeResults
    .map((item) => `${item.slug}:${item.name}:${item.url}`.toLowerCase())
    .sort()
    .join(",");

  return `${query.toLowerCase()}::${limit}::${exclusionKey}`;
}

function buildNetworkCacheKey(query, limit) {
  return `network::${query.toLowerCase()}::${limit}`;
}

function buildGuideUrls(slug, query) {
  const encodedSlug = encodeURIComponent(slug);
  const encodedQuery = encodeURIComponent(query);

  return {
    guideUrl: `/api/guides/${encodedSlug}.doc?query=${encodedQuery}`,
    documentUrl: `/api/guides/${encodedSlug}.doc?query=${encodedQuery}`,
    wordGuideUrl: `/api/guides/${encodedSlug}.doc?query=${encodedQuery}`,
    docsGuideUrl: `/api/guides/${encodedSlug}.doc?query=${encodedQuery}`,
    pdfGuideUrl: `/api/guides/${encodedSlug}.pdf?query=${encodedQuery}`,
    htmlGuideUrl: `/api/guides/${encodedSlug}.html?query=${encodedQuery}`,
  };
}

function attachGuideUrls(payload, query) {
  return {
    ...payload,
    results: (Array.isArray(payload.results) ? payload.results : []).map((item) => ({
      ...item,
      ...buildGuideUrls(item.slug, query),
    })),
  };
}

function getSessionToken(request) {
  const authorization = String(request.get("authorization") ?? "").trim();
  if (/^bearer\s+/i.test(authorization)) {
    return authorization.replace(/^bearer\s+/i, "").trim();
  }

  return String(request.get("x-sarksearch-session") ?? "").trim();
}

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeName(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 60);
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value ?? "").trim());
}

function validatePassword(value) {
  return String(value ?? "").length >= 8;
}

async function getAuthContext(request) {
  const token = getSessionToken(request);
  if (!token) {
    return null;
  }

  return resolveAuthSession(token);
}

function buildSessionPayload(authContext, token = "") {
  return {
    ...(token ? { token } : {}),
    session: {
      id: authContext.sessionId,
      kind: authContext.kind,
      user: authContext.user,
      label: authContext.user?.name || authContext.user?.email || "Default guest",
    },
  };
}

function getStatusCode(error) {
  return Number.isInteger(error?.statusCode) ? error.statusCode : 500;
}

function sendRequestError(response, error, fallbackMessage) {
  response.status(getStatusCode(error)).json({
    error: error?.message || fallbackMessage,
  });
}

app.use(cors(buildCorsOptions()));
app.use(express.json());

app.get("/api/health", (_request, response) => {
  response.json({
    status: "ok",
    persistenceMode: getPersistenceMode(),
    gateway: "node-api",
  });
});

app.post("/api/auth/guest", async (_request, response) => {
  try {
    const { token, authContext } = await createGuestSession();
    response.status(201).json(buildSessionPayload(authContext, token));
  } catch (error) {
    sendRequestError(response, error, "Could not start a guest session.");
  }
});

app.post("/api/auth/signup", async (request, response) => {
  const email = normalizeEmail(request.body?.email);
  const password = String(request.body?.password ?? "");
  const name = normalizeName(request.body?.name);

  if (!isValidEmail(email)) {
    response.status(400).json({ error: "Enter a valid email address." });
    return;
  }

  if (!validatePassword(password)) {
    response.status(400).json({ error: "Use a password with at least 8 characters." });
    return;
  }

  try {
    const { token, authContext } = await registerUser({ email, password, name });
    response.status(201).json(buildSessionPayload(authContext, token));
  } catch (error) {
    sendRequestError(response, error, "Could not create the account.");
  }
});

app.post("/api/auth/login", async (request, response) => {
  const email = normalizeEmail(request.body?.email);
  const password = String(request.body?.password ?? "");

  if (!isValidEmail(email)) {
    response.status(400).json({ error: "Enter a valid email address." });
    return;
  }

  if (!password) {
    response.status(400).json({ error: "Password is required." });
    return;
  }

  try {
    const { token, authContext } = await loginUser({ email, password });
    response.json(buildSessionPayload(authContext, token));
  } catch (error) {
    sendRequestError(response, error, "Could not log in.");
  }
});

app.get("/api/auth/session", async (request, response) => {
  const authContext = await getAuthContext(request);

  if (!authContext) {
    response.status(401).json({ error: "Your session is no longer active." });
    return;
  }

  response.json(buildSessionPayload(authContext));
});

app.post("/api/auth/logout", async (request, response) => {
  await invalidateAuthSession(getSessionToken(request));
  response.json({ ok: true });
});

app.get("/api/sessions/recent", async (request, response) => {
  const authContext = await getAuthContext(request);
  const sessions = await listRecentSearches({ authContext });
  response.json({ sessions });
});

app.post("/api/search", async (request, response) => {
  const query = String(request.body?.query ?? "").trim();
  const authContext = await getAuthContext(request);
  const parsedLimit = Number.parseInt(String(request.body?.limit ?? config.defaultSearchLimit), 10);
  const limit = Number.isFinite(parsedLimit)
    ? Math.min(Math.max(parsedLimit, 1), config.maxSearchLimit)
    : config.defaultSearchLimit;
  const skipCache = request.body?.skipCache === true;
  const skipSessionSave = request.body?.skipSessionSave === true;
  const excludeResults = normalizeExcludeResults(request.body?.excludeResults);

  if (!query) {
    response.status(400).json({ error: "Query is required." });
    return;
  }

  const cacheKey = buildSearchCacheKey(query, limit, excludeResults);
  const cached = skipCache ? null : cache.get(cacheKey);

  if (cached) {
    const cachedResponse = {
      ...cached,
      meta: {
        ...(cached.meta ?? {}),
        cache: "hit",
        excludedResults: excludeResults.length,
        persistenceMode: getPersistenceMode(),
      },
    };

    if (authContext && !excludeResults.length && !skipSessionSave) {
      await saveSearchSession(cachedResponse, { authContext });
    }

    response.json(cachedResponse);
    return;
  }

  try {
    const upstream = await fetchWithTimeout(`${config.fastApiBaseUrl}/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, limit, excludeResults }),
    });

    const payload = await readUpstreamPayload(upstream);
    if (!upstream.ok) {
      response.status(mapUpstreamStatus(upstream.status)).json({
        error: getUpstreamErrorMessage(
          payload,
          "Recommendation engine did not respond successfully.",
        ),
        detail: payload.detail ?? payload.raw ?? payload,
      });
      return;
    }

    const withGuides = {
      ...attachGuideUrls(payload, query),
      meta: {
        cache: "miss",
        excludedResults: excludeResults.length,
        persistenceMode: getPersistenceMode(),
        agentMode: payload.orchestration?.mode ?? "llm-brain-unavailable",
      },
    };

    cache.set(cacheKey, withGuides);
    if (authContext && !excludeResults.length && !skipSessionSave) {
      await saveSearchSession(withGuides, { authContext });
    }
    response.json(withGuides);
  } catch (error) {
    const timedOut = error.name === "AbortError";
    response.status(timedOut ? 504 : 502).json({
      error: timedOut
        ? "The recommendation engine took too long to respond. Try again, or increase REQUEST_TIMEOUT_MS for slower LLM searches."
        : "SARKSearch could not reach the recommendation engine.",
      detail: error.message,
    });
  }
});

app.post("/api/search/network", async (request, response) => {
  const query = String(request.body?.query ?? "").trim();
  const parsedLimit = Number.parseInt(String(request.body?.limit ?? NETWORK_RESULT_LIMIT), 10);
  const limit = Number.isFinite(parsedLimit)
    ? Math.min(Math.max(parsedLimit, 1), NETWORK_RESULT_LIMIT)
    : NETWORK_RESULT_LIMIT;

  if (!query) {
    response.status(400).json({ error: "Query is required." });
    return;
  }

  const cacheKey = buildNetworkCacheKey(query, limit);
  const cached = cache.get(cacheKey);

  if (cached) {
    response.json({
      ...cached,
      meta: {
        ...(cached.meta ?? {}),
        cache: "hit",
        networkLimit: limit,
        persistenceMode: getPersistenceMode(),
      },
    });
    return;
  }

  try {
    const upstream = await fetchWithTimeout(`${config.fastApiBaseUrl}/search/network`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, limit }),
    });

    const payload = await readUpstreamPayload(upstream);
    if (!upstream.ok) {
      response.status(mapUpstreamStatus(upstream.status)).json({
        error: getUpstreamErrorMessage(
          payload,
          "Recommendation engine did not respond successfully.",
        ),
        detail: payload.detail ?? payload.raw ?? payload,
      });
      return;
    }

    const withGuides = {
      ...attachGuideUrls(payload, query),
      meta: {
        cache: "miss",
        networkLimit: limit,
        persistenceMode: getPersistenceMode(),
        agentMode: payload.orchestration?.mode ?? "llm-brain-unavailable",
      },
    };

    cache.set(cacheKey, withGuides);
    response.json(withGuides);
  } catch (error) {
    const timedOut = error.name === "AbortError";
    response.status(timedOut ? 504 : 502).json({
      error: timedOut
        ? "The recommendation engine took too long to build the application network. Try again, or increase REQUEST_TIMEOUT_MS for slower LLM searches."
        : "SARKSearch could not reach the recommendation engine.",
      detail: error.message,
    });
  }
});

app.get("/api/guides/:slug.doc", async (request, response) => {
  const query = String(request.query.query ?? "");
  const slug = request.params.slug;

  try {
    const upstream = await fetchWithTimeout(
      `${config.fastApiBaseUrl}/guides/${encodeURIComponent(slug)}.doc?query=${encodeURIComponent(query)}`,
    );

    if (!upstream.ok) {
      response.status(upstream.status).json({ error: "Guide document not available." });
      return;
    }

    const documentBuffer = Buffer.from(await upstream.arrayBuffer());
    response.setHeader("Content-Type", "application/msword; charset=utf-8");
    response.setHeader("Content-Disposition", `inline; filename="${slug}-starter-guide.doc"`);
    response.send(documentBuffer);
  } catch (error) {
    response.status(502).json({
      error: "Failed to retrieve the starter document.",
      detail: error.message,
    });
  }
});

app.get("/api/guides/:slug.pdf", async (request, response) => {
  const query = String(request.query.query ?? "");
  const slug = request.params.slug;

  try {
    const upstream = await fetchWithTimeout(
      `${config.fastApiBaseUrl}/guides/${encodeURIComponent(slug)}.pdf?query=${encodeURIComponent(query)}`,
    );

    if (!upstream.ok) {
      response.status(upstream.status).json({ error: "Guide PDF not available." });
      return;
    }

    const pdfBuffer = Buffer.from(await upstream.arrayBuffer());
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Content-Disposition", `inline; filename="${slug}-starter-guide.pdf"`);
    response.send(pdfBuffer);
  } catch (error) {
    response.status(502).json({
      error: "Failed to retrieve the starter PDF.",
      detail: error.message,
    });
  }
});

app.get("/api/guides/:slug.html", async (request, response) => {
  const query = String(request.query.query ?? "");
  const slug = request.params.slug;

  try {
    const upstream = await fetchWithTimeout(
      `${config.fastApiBaseUrl}/guides/${encodeURIComponent(slug)}.html?query=${encodeURIComponent(query)}`,
    );

    if (!upstream.ok) {
      response.status(upstream.status).json({ error: "Guide HTML not available." });
      return;
    }

    const html = await upstream.text();
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.setHeader("Content-Disposition", `inline; filename="${slug}-starter-guide.html"`);
    response.send(html);
  } catch (error) {
    response.status(502).json({
      error: "Failed to retrieve the starter HTML.",
      detail: error.message,
    });
  }
});

export async function initializeApp() {
  await initializePersistence();
  return app;
}

export { app };
