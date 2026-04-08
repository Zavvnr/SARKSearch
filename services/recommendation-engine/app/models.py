from __future__ import annotations

from typing import List

from pydantic import BaseModel, Field


class SearchRequest(BaseModel):
    query: str = Field(min_length=3)
    limit: int = Field(default=8, ge=1, le=12)


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


class OrchestrationReport(BaseModel):
    mode: str
    milestones: List[MilestoneStatus]
    iterations: List[IterationLogEntry]
    assumptions: List[str]
    missingRequirements: List[str]
    serviceBoundaries: List[str]
    architectureNotes: List[str]


class SearchResponse(BaseModel):
    query: str
    summary: str
    results: List[Recommendation]
    agentTrace: List[AgentTraceItem]
    orchestration: OrchestrationReport
