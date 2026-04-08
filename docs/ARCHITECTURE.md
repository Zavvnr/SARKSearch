# Architecture

## Overview

The app follows the structure requested in the challenge prompt:

1. React SPA captures user intent.
2. Node.js API handles caching, persistence, and service orchestration.
3. FastAPI preprocesses the prompt, runs the agent pipeline, and returns ranked tools.
4. MongoDB stores recent searches when configured.

## Services

### React SPA

- Single-page search experience
- Guided prompts and recent searches
- Result rendering with tool links and starter PDFs
- Agent trace for transparency

### Node.js API

- Validates incoming search requests
- Applies TTL caching
- Calls the FastAPI recommendation engine
- Persists recent searches to MongoDB or in-memory fallback
- Proxies starter PDF requests

### FastAPI recommendation engine

- Hosts the hardcoded tool knowledgebase
- Runs the agent pipeline
- Produces ranking, explanations, and starter tips
- Generates one-page PDF guides

## Scaling notes

- Replace the hardcoded tool list with ingestion from a CMS, database, or crawler pipeline
- Swap heuristic agents for GPT-4.1-backed agents behind the current interfaces
- Move the Node cache to Redis for multi-instance deployment
- Move search persistence and analytics into indexed MongoDB collections
- Add embeddings or hybrid retrieval when the catalog becomes large
