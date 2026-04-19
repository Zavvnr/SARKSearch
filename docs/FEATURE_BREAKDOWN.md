# Feature Breakdown

## Search intake

- Plain-English query box
- Guided prompt pills for uncertain users
- Recent-search recall

## Recommendation engine

- Using The "LLM Brain" API as the knowledgebase
- Keyword extraction and synonym expansion
- Relevance-plus-popularity ranking
- GPT-5.4 optional agent mode with heuristic fallback
- Iterative refinement loop when confidence is weak

## Results experience

- Top 5 default results
- Search-more expansion in 5-result batches up to 20 total results
- Temporary per-search result set used to avoid showing duplicate recommendations
- Application network expansion that requests up to 50 nearby applications and sites for a prompt-centered graph
- Tool link, popularity, relevance reason, and starter tip
- Google Docs-compatible starter guide for each tool, including the starter content and an application-understanding checklist

## Transparency

- Agent trace
- Milestone status display
- Iteration log
- Architecture notes, assumptions, and open requirements

## Backend support

- Node.js API gateway
- FastAPI preprocessing and recommendation service
- MongoDB persistence through Mongoose
- TTL cache for repeated requests
