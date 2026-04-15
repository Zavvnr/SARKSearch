Synchronized Applications Recommender Knowledgebases Search (SARKSearch) project was made as a part of the Handshake x OpenAI "Codex Creator Challenge", serving as a discovery engine that translates a beginner's plain-English problem into a curated list of tools.

# SARKSearch

SARKSearch is a production-style, multi-agent web application that helps beginners turn messy, plain-English goals into a ranked list of software tools, links, and first-step guides.

## What is in the repo

- `apps/web`: React single-page application for search, recommendations, and recent search visibility
- `services/node-api`: Node.js orchestration layer with caching, FastAPI proxying, and optional MongoDB persistence
- `services/recommendation-engine`: FastAPI preprocessing and recommendation engine powered by the GPT-5.4 LLM Brain
- `docs/`: product, architecture, and API reference artifacts

## Multi-agent system

The recommendation engine uses clearly separated agents with defined responsibilities:

- `OrchestratorAgent`: coordinates the full recommendation cycle and manages retries
- `SpecificationAgent`: translates plain-English input into structured intent and constraints
- `ArchitectureAgent`: builds a search plan and service boundaries for matching
- `LLMBrainAgent`: asks GPT-5.4 for structured recommendations from its own knowledgebase
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
- `services/recommendation-engine/.env`: FastAPI host/port, result limits, `OPENAI_API_KEY`, and `OPENAI_MODEL`

Notes:

- Leave `MONGODB_URI` blank to use the in-memory recent-search fallback.
- Set `OPENAI_API_KEY` so the LLM Brain can generate recommendations.
- `OPENAI_MODEL` now defaults to `gpt-4o-mini` for faster, lower-cost searches.

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

## LLM Brain recommendation mode

The recommendation engine no longer ranks against a bundled or external catalog. FastAPI asks GPT-5.4 to return structured recommendation objects directly from the LLM Brain.

What this means:

- There is no hardcoded app/site database in the active recommendation path.
- Product Hunt, College Scorecard, Codeforces, and other catalog APIs are no longer required.
- If the OpenAI runtime is not configured, the engine returns an empty recommendation set instead of falling back to a made-up local database.
- Starter PDFs are generated from the recommendations returned by the LLM Brain.

## Features

- Beginner-friendly search with guided prompt pills
- GPT-5.4 LLM Brain recommendations across career, learning, research, productivity, creative, coding, finance, and community goals
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

- The active recommendation path uses GPT-5.4 as the LLM Brain knowledgebase.
- The codebase intentionally avoids a made-up local recommendation database.
- Search history can still persist through MongoDB, but recommendations are generated at request time.
- If the LLM Brain is unavailable, the app reports that configuration issue instead of returning hardcoded fallback tools.
