from __future__ import annotations

from typing import List

from pydantic import BaseModel, Field

from .config import settings

NETWORK_RESULT_LIMIT = 50


class ExcludedRecommendation(BaseModel):
    slug: str = ""
    name: str = ""
    url: str = ""


class SearchRequest(BaseModel):
    query: str = Field(min_length=3)
    limit: int = Field(default=settings.default_search_limit, ge=1, le=settings.max_search_limit)
    excludeResults: List[ExcludedRecommendation] = Field(default_factory=list, max_length=20)


class NetworkRequest(BaseModel):
    query: str = Field(min_length=3)
    limit: int = Field(default=NETWORK_RESULT_LIMIT, ge=1, le=NETWORK_RESULT_LIMIT)


class Tool(BaseModel):
    slug: str
    name: str
    category: str
    popularity: str
    popularity_score: int
    description: str
    tags: List[str]
    url: str
    icon: str
    starter_steps: List[str]


class Recommendation(BaseModel):
    slug: str
    name: str
    category: str
    popularity: str
    description: str
    url: str
    icon: str
    relevanceReason: str
    starterTip: str


class AgentTraceItem(BaseModel):
    agent: str
    status: str
    detail: str
    mode: str = "heuristic"
    durationMs: float = 0.0


class MilestoneStatus(BaseModel):
    name: str
    owner: str
    status: str
    detail: str


class IterationLogEntry(BaseModel):
    iteration: int
    stage: str
    status: str
    detail: str


class StageTiming(BaseModel):
    stage: str
    durationMs: float


class OrchestrationReport(BaseModel):
    mode: str
    milestones: List[MilestoneStatus]
    iterations: List[IterationLogEntry]
    assumptions: List[str]
    missingRequirements: List[str]
    serviceBoundaries: List[str]
    architectureNotes: List[str]
    timings: List[StageTiming] = Field(default_factory=list)
    totalDurationMs: float = 0.0


class SearchResponse(BaseModel):
    query: str
    summary: str
    results: List[Recommendation]
    agentTrace: List[AgentTraceItem]
    orchestration: OrchestrationReport
