from __future__ import annotations

from fastapi import FastAPI, HTTPException, Query, Response

from .agent_runtime import OrchestratorAgent, build_summary
from .config import settings
from .models import SearchRequest, SearchResponse
from .pdf_guides import build_starter_pdf

app = FastAPI(title=settings.app_name)
orchestrator = OrchestratorAgent()


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "knowledgebase": "LLM Brain",
        "model": settings.openai_model,
        "llmEnabled": orchestrator.runtime.enabled,
        "agentMode": orchestrator.runtime.mode,
    }


@app.post("/search", response_model=SearchResponse)
def search_tools(payload: SearchRequest) -> SearchResponse:
    recommendations, trace, orchestration = orchestrator.run(payload.query, payload.limit)
    if not recommendations:
        brain_trace = next((item for item in trace if item.agent == "LLMBrainAgent"), None)
        message = (
            brain_trace.detail
            if brain_trace
            else "The LLM Brain did not return usable recommendations."
        )
        raise HTTPException(
            status_code=503,
            detail={
                "message": message,
                "knowledgebase": "LLM Brain",
                "model": settings.openai_model,
                "agentMode": orchestration.mode,
            },
        )

    return SearchResponse(
        query=payload.query,
        summary=build_summary(payload.query, recommendations),
        results=recommendations,
        agentTrace=trace,
        orchestration=orchestration,
    )


@app.get("/guides/{slug}.pdf")
def starter_guide(slug: str, query: str = Query(default="your goal")) -> Response:
    recommendation = orchestrator.get_recommendation_for_guide(slug, query)
    if not recommendation:
        raise HTTPException(status_code=404, detail="LLM Brain could not reconstruct this starter guide.")

    return Response(content=build_starter_pdf(recommendation, query), media_type="application/pdf")
