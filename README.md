Syncronized Applications Recommender Knowledgebases Search (SARKSearch) project was made as a part of 'Codex Creator Challenge', serving as a discovery engine that translates a beginner's plain-English problem into a curated list of tools.

# SARKSearch

SARKSearch is a production-style, multi-agent web application that helps beginners turn messy, plain-English goals into a ranked list of software tools, links, and first-step guides.

## What is in the repo

- `apps/web`: React single-page application for search, recommendations, and agent trace visibility
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

Copy these files if you want custom settings:

- `apps/web/.env.example`
- `services/node-api/.env.example`

### 5. Run the full stack

```bash
npm run dev
```

Services:

- React app: `http://localhost:5173`
- Node API: `http://localhost:4000`
- FastAPI engine: `http://localhost:8000`

## Features

- Beginner-friendly search with guided prompt pills
- 40 curated tools across career, learning, research, productivity, creative, coding, finance, and community categories
- Ranked top 5 results with show-more expansion
- Contextual relevance explanations and first-step tips
- One-page starter PDF guide for every recommended tool
- Agent trace so users can understand how recommendations were formed
- Optional MongoDB persistence for recent searches

## Architecture docs

- [Product requirements](./docs/PRD.md)
- [API contracts](./docs/API_CONTRACTS.md)
- [System architecture](./docs/ARCHITECTURE.md)

## Notes

- The tool catalog is intentionally hardcoded for challenge speed and reliability.
- The codebase includes comments marking future scaling points for external ingestion, richer ranking, and live API integrations.
- The GPT-4.1 requirement from the prompt is represented as an extensibility point in the agent layer; the default local mode uses deterministic heuristics so the app works without external API keys.
