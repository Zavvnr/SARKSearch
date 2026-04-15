# Database Schema

## Search session collection

MongoDB stores completed recommendation runs through the Node.js gateway.

### Fields

- `query`: original plain-English request
- `summary`: generated summary sentence for the run
- `tools`: list of recommended tool names
- `results`: full recommendation payload returned to the client
- `agentTrace`: ordered trace entries from the multi-agent pipeline
- `orchestration`: milestone, iteration, architecture, and assumption report
- `meta`: cache and runtime metadata
- `createdAt` / `updatedAt`: timestamps from Mongoose

## Recommendation source

SARKSearch no longer stores a curated recommendation catalog in code or MongoDB. The FastAPI service treats GPT-5.4 as the LLM Brain knowledgebase and generates recommendation objects at request time.

### Recommendation shape

- `slug`
- `name`
- `category`
- `popularity`
- `description`
- `url`
- `icon`
- `relevanceReason`
- `starterTip`

## Scaling path

- Add indexes on `query` and `createdAt`
- Add a separate analytics collection for click-throughs and PDF opens
- Add optional retrieval or source auditing later if the LLM Brain needs external grounding
