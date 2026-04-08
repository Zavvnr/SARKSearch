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

## Knowledgebase

The curated tool catalog is still code-backed for challenge speed and predictable ranking behavior.

### Tool shape

- `slug`
- `name`
- `category`
- `popularity`
- `popularity_score`
- `description`
- `tags`
- `url`
- `icon`
- `starter_steps`

## Scaling path

- Move the tool catalog into MongoDB or a CMS
- Add indexes on `query`, `createdAt`, and tool tags
- Add a separate analytics collection for click-throughs and PDF opens
- Layer embeddings or hybrid retrieval once the catalog becomes much larger
