# Feature Breakdown

## Search intake

- Plain-English query box
- Guided prompt pills for uncertain users
- Recent-search recall

## Recommendation engine

- Hardcoded curated knowledgebase with 40 tools
- Keyword extraction and synonym expansion
- Relevance-plus-popularity ranking
- GPT-4.1 optional agent mode with heuristic fallback
- Iterative refinement loop when confidence is weak

## Results experience

- Top 5 default results
- Show-more expansion
- Tool link, popularity, relevance reason, and starter tip
- One-page starter PDF for each tool

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
