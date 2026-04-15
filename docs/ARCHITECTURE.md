# Architecture

## Overview

The app follows the structure requested in the challenge prompt:

1. React SPA captures user intent.
2. Node.js API handles caching, persistence, and service orchestration.
3. FastAPI preprocesses the prompt, asks the GPT-5.4 LLM Brain for recommendations, and returns structured results.
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

- Treats GPT-5.4 as the LLM Brain knowledgebase
- Runs the agent pipeline
- Produces recommendation objects, explanations, and starter tips
- Generates one-page PDF guides
- Does not fall back to a hardcoded tool catalog when the LLM Brain is unavailable

## Scaling notes

- Add evaluation datasets for GPT-5.4 recommendation quality
- Add optional retrieval later only if the product needs auditable sources beyond the LLM Brain
- Move the Node cache to Redis for multi-instance deployment
- Move search persistence and analytics into indexed MongoDB collections
