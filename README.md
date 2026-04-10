Synchronized Applications Recommender Knowledgebases Search (SARKSearch) project was made as a part of the "Codex Creator Challenge", serving as a discovery engine that translates a beginner's plain-English problem into a curated list of tools.

# SARKSearch

SARKSearch is a production-style, multi-agent web application that helps beginners turn messy, plain-English goals into a ranked list of software tools, links, and first-step guides.

## What is in the repo

- `apps/web`: React single-page application for search, recommendations, and recent search visibility
- `services/node-api`: Node.js orchestration layer with caching, FastAPI proxying, and optional MongoDB persistence
- `services/recommendation-engine`: FastAPI preprocessing and recommendation engine with a hardcoded 40-tool knowledgebase
- `docs/`: product, architecture, and API reference artifacts

## Multi-agent system

The recommendation engine uses clearly separated agents with defined responsibilities:

- `OrchestratorAgent`: coordinates the full recommendation cycle and manages retries
- `SpecificationAgent`: translates plain-English input into structured intent and constraints
- `ArchitectureAgent`: builds a search plan and service boundaries for matching
- `ImplementationAgent`: scores, ranks, and assembles tool recommendations
- `EvaluationAgent`: checks confidence, diversity, and whether another refinement pass is needed

## Stack

- Frontend: React, Vite, CSS
- Backend gateway: Node.js, Express
- Recommendation service: Python, FastAPI
- Persistence: MongoDB when `MONGODB_URI` is provided, with graceful in-memory fallback
- Caching: TTL cache in the Node.js API layer

## Quick start

### 1. Install Node dependencies

```bash
npm install
```

### 2. Create the Python environment

```bash
py -3.12 -m venv .venv
```

### 3. Install Python dependencies

```bash
npm run install:python
```

### 4. Configure environment variables

Copy these tracked templates into local `.env` files:

- `apps/web/.env.example`
- `services/node-api/.env.example`
- `services/recommendation-engine/.env.example`

PowerShell:

```powershell
Copy-Item apps/web/.env.example apps/web/.env
Copy-Item services/node-api/.env.example services/node-api/.env
Copy-Item services/recommendation-engine/.env.example services/recommendation-engine/.env
```

Default values already point the three local services at each other:

- `apps/web/.env`: frontend dev host/port plus `VITE_API_BASE_URL`
- `services/node-api/.env`: Node host/port, FastAPI base URL, cache TTL, CORS origin, optional `MONGODB_URI`
- `services/recommendation-engine/.env`: FastAPI host/port, result limits, optional catalog provider settings, optional `OPENAI_API_KEY`, `OPENAI_MODEL`

Notes:

- Leave `MONGODB_URI` blank to use the in-memory recent-search fallback.
- Leave `OPENAI_API_KEY` blank to keep the recommendation engine in deterministic heuristic mode.
- Leave `CATALOG_PROVIDER=local` if you want the bundled 40-tool catalog only.

### 5. Run the full stack

```bash
npm run dev
```

Services:

- React app: `http://127.0.0.1:5173`
- Node API: `http://127.0.0.1:4000`
- FastAPI engine: `http://127.0.0.1:8000`

## Run each service separately

```bash
npm run dev:web
npm run dev:api
.\.venv\Scripts\python services/recommendation-engine/run_dev.py
```

Use these when you only need one layer at a time while debugging.

## Live catalog option

The recommendation engine can optionally augment the bundled catalog with Product Hunt data.

Recommended local setup:

```env
CATALOG_PROVIDER=product_hunt
CATALOG_INCLUDE_LOCAL=true
PRODUCT_HUNT_TOKEN=your_token_here
```

What this does:

- Resolves Product Hunt topics from `PRODUCT_HUNT_TOPICS`
- Pulls featured products from those topics
- Maps them into the same internal tool model used by the recommender
- Merges them with the local catalog unless `CATALOG_INCLUDE_LOCAL=false`

Why `CATALOG_INCLUDE_LOCAL=true` is the safer default:

- Product Hunt is strong for live discovery and newer products
- The bundled catalog still covers mainstream evergreen tools that may not rank well in Product Hunt queries
- The combined catalog gives broader coverage without losing local reliability

Other APIs worth evaluating next:

- G2 API for software categories, product metadata, domains, and reviews
- StackShare GraphQL API for tool metadata and developer-focused software discovery

## Features

- Beginner-friendly search with guided prompt pills
- 40 curated tools across career, learning, research, productivity, creative, coding, finance, and community categories
- Ranked top 5 results with show-more expansion
- Contextual relevance explanations and first-step tips
- One-page starter PDF guide for every recommended tool
- Simplified beginner-facing interface focused on search, results, and starter actions
- Optional MongoDB persistence for recent searches

## Architecture docs

- [Product requirements](./docs/PRD.md)
- [Feature breakdown](./docs/FEATURE_BREAKDOWN.md)
- [API contracts](./docs/API_CONTRACTS.md)
- [System architecture](./docs/ARCHITECTURE.md)
- [Database schema](./docs/DATABASE_SCHEMA.md)
- [Evaluation notes](./docs/EVALUATION.md)

## Notes

- The tool catalog is intentionally hardcoded for challenge speed and reliability.
- The codebase now supports an optional Product Hunt-backed catalog source with local fallback.
- The codebase includes comments marking future scaling points for external ingestion, richer ranking, and live API integrations.
- Every agent can run in optional GPT-4.1 mode when `OPENAI_API_KEY` is set in `services/recommendation-engine/.env`.
- The local default stays deterministic so the app still works without external API keys.
