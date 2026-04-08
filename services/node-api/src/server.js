import cors from "cors";
import express from "express";
import { config } from "./lib/config.js";
import { TtlCache } from "./lib/cache.js";
import {
  getPersistenceMode,
  initializePersistence,
  listRecentSearches,
  saveSearchSession,
} from "./lib/store.js";

const app = express();
const cache = new TtlCache(config.cacheTtlMs);

app.use(cors());
app.use(express.json());

app.get("/api/health", (_request, response) => {
  response.json({
    status: "ok",
    persistenceMode: getPersistenceMode(),
  });
});

app.get("/api/sessions/recent", async (_request, response) => {
  const sessions = await listRecentSearches();
  response.json({ sessions });
});

app.post("/api/search", async (request, response) => {
  const query = String(request.body?.query ?? "").trim();
  const limit = Number(request.body?.limit ?? 8);

  if (!query) {
    response.status(400).json({ error: "Query is required." });
    return;
  }

  const cacheKey = `${query.toLowerCase()}::${limit}`;
  const cached = cache.get(cacheKey);

  if (cached) {
    response.json({
      ...cached,
      meta: {
        ...(cached.meta ?? {}),
        cache: "hit",
        persistenceMode: getPersistenceMode(),
      },
    });
    return;
  }

  try {
    const upstream = await fetch(`${config.fastApiBaseUrl}/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, limit }),
    });

    if (!upstream.ok) {
      throw new Error("Recommendation engine did not respond successfully.");
    }

    const payload = await upstream.json();
    const withGuides = {
      ...payload,
      results: payload.results.map((item) => ({
        ...item,
        guideUrl: `/api/guides/${item.slug}.pdf?query=${encodeURIComponent(query)}`,
      })),
      meta: {
        cache: "miss",
        persistenceMode: getPersistenceMode(),
      },
    };

    cache.set(cacheKey, withGuides);
    await saveSearchSession(withGuides);
    response.json(withGuides);
  } catch (error) {
    response.status(502).json({
      error: "SARKSearch could not reach the recommendation engine.",
      detail: error.message,
    });
  }
});

app.get("/api/guides/:slug.pdf", async (request, response) => {
  const query = String(request.query.query ?? "");
  const slug = request.params.slug;

  try {
    const upstream = await fetch(
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

async function bootstrap() {
  await initializePersistence();

  app.listen(config.port, () => {
    console.log(`Node API listening on http://localhost:${config.port}`);
  });
}

bootstrap();
