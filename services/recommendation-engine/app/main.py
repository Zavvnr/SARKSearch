from __future__ import annotations

from fastapi import FastAPI, HTTPException, Query, Response

from .agents import OrchestratorAgent, build_summary
from .knowledgebase import TOOLS
from .models import SearchRequest, SearchResponse
from .pdf_guides import build_starter_pdf

app = FastAPI(title="SARKSearch Recommendation Engine")
orchestrator = OrchestratorAgent()


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "tools": len(TOOLS)}


@app.post("/search", response_model=SearchResponse)
def search_tools(payload: SearchRequest) -> SearchResponse:
    recommendations, trace = orchestrator.run(payload.query, payload.limit)
    return SearchResponse(
        query=payload.query,
        summary=build_summary(payload.query, recommendations),
        results=recommendations,
        agentTrace=trace,
    )


@app.get("/guides/{slug}.pdf")
def starter_guide(slug: str, query: str = Query(default="your goal")) -> Response:
    tool = next((item for item in TOOLS if item.slug == slug), None)
    if not tool:
        raise HTTPException(status_code=404, detail="Tool not found.")

    return Response(content=build_starter_pdf(tool, query), media_type="application/pdf")
