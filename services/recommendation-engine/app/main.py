from __future__ import annotations

from fastapi import FastAPI, HTTPException, Query, Response

from .agent_runtime import OrchestratorAgent, build_summary
from .catalog import tool_catalog
from .config import settings
from .models import SearchRequest, SearchResponse
from .pdf_guides import build_starter_pdf

app = FastAPI(title=settings.app_name)
orchestrator = OrchestratorAgent()


@app.get("/health")
def health() -> dict:
    snapshot = tool_catalog.get_snapshot()
    return {
        "status": "ok",
        "tools": len(snapshot.tools),
        "catalogSource": snapshot.source,
        "catalogDetail": snapshot.detail,
        "agentMode": orchestrator.runtime.mode,
    }


@app.post("/search", response_model=SearchResponse)
def search_tools(payload: SearchRequest) -> SearchResponse:
    snapshot = tool_catalog.get_snapshot()
    recommendations, trace, orchestration = orchestrator.run(payload.query, payload.limit, snapshot.tools)
    return SearchResponse(
        query=payload.query,
        summary=build_summary(payload.query, recommendations),
        results=recommendations,
        agentTrace=trace,
        orchestration=orchestration,
    )


@app.get("/guides/{slug}.pdf")
def starter_guide(slug: str, query: str = Query(default="your goal")) -> Response:
    tool = tool_catalog.get_tool_by_slug(slug)
    if not tool:
        raise HTTPException(status_code=404, detail="Tool not found.")

    return Response(content=build_starter_pdf(tool, query), media_type="application/pdf")
