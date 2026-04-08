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


class SearchResponse(BaseModel):
    query: str
    summary: str
    results: List[Recommendation]
    agentTrace: List[AgentTraceItem]
