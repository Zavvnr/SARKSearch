from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Iterable, List, Sequence, Tuple

from .llm_runtime import OptionalLLMRuntime
from .models import (
    AgentTraceItem,
    IterationLogEntry,
    MilestoneStatus,
    OrchestrationReport,
    Recommendation,
    StageTiming,
    Tool,
)

STOP_WORDS = {
    "a",
    "an",
    "and",
    "are",
    "but",
    "for",
    "from",
    "have",
    "i",
    "into",
    "it",
    "me",
    "my",
    "of",
    "on",
    "or",
    "so",
    "start",
    "that",
    "the",
    "to",
    "want",
    "with",
}

SYNONYM_GROUPS = {
    "resume": ["resume", "cv"],
    "job": ["job", "career", "hiring", "apply", "internship", "interview"],
    "networking": ["networking", "connections", "recruiter"],
    "learn": ["learn", "study", "course", "beginner", "tutorial"],
    "python": ["python", "coding", "programming", "developer"],
    "research": ["research", "paper", "sources", "citations", "academic"],
    "friends": ["friends", "community", "chat", "social", "groups"],
    "organize": ["organize", "planning", "tasks", "deadline", "schedule", "notes"],
    "design": ["design", "creative", "template", "visual", "portfolio"],
    "education": ["education", "college", "university", "school", "degree", "certificate", "campus"],
    "competition": ["competition", "competitions", "contest", "contests", "hackathon", "olympiad"],
    "programming": ["programming", "coding", "developer", "algorithms", "leetcode", "codeforces"],
}

DEFAULT_SERVICE_BOUNDARIES = [
    "React SPA handles the beginner-friendly interface and result rendering.",
    "Node.js gateway handles caching, MongoDB persistence, and FastAPI proxying.",
    "FastAPI owns LLM Brain orchestration, recommendation shaping, and starter PDF generation.",
]

DEFAULT_ARCHITECTURE_NOTES = [
    "FastAPI preprocesses plain-English input before the React UI renders results.",
    "The LLM Brain is treated as the recommendation knowledgebase; no curated app catalog is used.",
    "Caching belongs in the Node gateway so repeated prompts do not recompute recommendations.",
]


def _slugify(value: str) -> str:
    cleaned = "".join(char.lower() if char.isalnum() else "-" for char in value)
    collapsed = "-".join(part for part in cleaned.split("-") if part)
    return collapsed or "tool"


def _icon_for_name(name: str) -> str:
    pieces = [part[0] for part in name.split() if part]
    return ("".join(pieces[:2]) or name[:2] or "TL").upper()


def tokenize(text: str) -> List[str]:
    lowered = "".join(char.lower() if char.isalnum() else " " for char in text)
    return [token for token in lowered.split() if token and token not in STOP_WORDS]


def _duration_ms(start_time: float) -> float:
    return round((time.perf_counter() - start_time) * 1000, 3)


def _first_string(raw_item: dict[str, object], *keys: str) -> str:
    for key in keys:
        value = raw_item.get(key)
        if value is None:
            continue
        normalized = str(value).strip()
        if normalized:
            return normalized
    return ""


def _normalize_recommendation_url(value: str) -> str:
    normalized = value.strip()
    if normalized.startswith(("http://", "https://")):
        return normalized
    if "." in normalized and " " not in normalized:
        return f"https://{normalized.lstrip('/')}"
    return ""


def _build_llm_brain_recommendations(raw_results: Sequence[object], limit: int) -> List[Recommendation]:
    recommendations: List[Recommendation] = []
    seen: set[str] = set()

    for raw_item in raw_results:
        if not isinstance(raw_item, dict):
            continue

        name = _first_string(raw_item, "name", "title")
        url = _normalize_recommendation_url(
            _first_string(raw_item, "url", "official_url", "officialUrl", "website", "link")
        )
        description = _first_string(raw_item, "description", "summary", "tagline")
        if not name or not url or not description:
            continue

        slug = _first_string(raw_item, "slug", "id") or _slugify(name)
        dedupe_key = slug.lower()
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)

        recommendations.append(
            Recommendation(
                slug=slug,
                name=name,
                category=_first_string(raw_item, "category", "type") or "Software / Discovery",
                popularity=_first_string(raw_item, "popularity", "adoption", "audience") or "LLM Brain match",
                description=description,
                url=url,
                icon=_first_string(raw_item, "icon") or _icon_for_name(name),
                relevanceReason=(
                    _first_string(raw_item, "relevance_reason", "relevanceReason", "reason")
                    or "The LLM Brain selected this as a practical, beginner-friendly match for the goal."
                ),
                starterTip=(
                    _first_string(raw_item, "starter_tip", "starterTip", "first_step", "firstStep")
                    or "Open the official site and try one small task tied to your goal."
                ),
            )
        )

        if len(recommendations) >= limit:
            break

    return recommendations


@dataclass
class Specification:
    original_query: str
    keywords: List[str]
    expanded_keywords: List[str]
    needs: List[str]
    assumptions: List[str]
    missing_requirements: List[str]


@dataclass
class ArchitecturePlan:
    categories: List[str]
    service_boundaries: List[str]
    architecture_notes: List[str]


class SpecificationAgent:
    def __init__(self, runtime: OptionalLLMRuntime) -> None:
        self.runtime = runtime

    def run(self, query: str) -> Tuple[Specification, AgentTraceItem]:
        keywords = tokenize(query)
        expanded = set(keywords)
        needs = []

        for label, related_terms in SYNONYM_GROUPS.items():
            if any(term in keywords for term in related_terms):
                expanded.update(related_terms)
                needs.append(label)

        assumptions = [
            "The user is a beginner and benefits from mainstream, well-supported tools.",
            "Ranking should prefer tools that are both relevant and widely adopted.",
        ]
        missing_requirements = []
        mode = "heuristic"

        specification = Specification(
            original_query=query,
            keywords=keywords,
            expanded_keywords=sorted(expanded),
            needs=needs or ["general discovery"],
            assumptions=assumptions,
            missing_requirements=missing_requirements,
        )

        return specification, AgentTraceItem(
            agent="SpecificationAgent",
            status="completed",
            detail=(
                f"Extracted keywords {specification.keywords[:6]} and mapped needs to "
                f"{', '.join(specification.needs)}."
            ),
            mode=mode,
        )


class ArchitectureAgent:
    def __init__(self, runtime: OptionalLLMRuntime) -> None:
        self.runtime = runtime

    def run(self, specification: Specification) -> Tuple[ArchitecturePlan, AgentTraceItem]:
        categories = list(dict.fromkeys(specification.needs))
        service_boundaries = list(DEFAULT_SERVICE_BOUNDARIES)
        architecture_notes = list(DEFAULT_ARCHITECTURE_NOTES)
        mode = "heuristic"

        plan = ArchitecturePlan(
            categories=categories,
            service_boundaries=service_boundaries or list(DEFAULT_SERVICE_BOUNDARIES),
            architecture_notes=architecture_notes or list(DEFAULT_ARCHITECTURE_NOTES),
        )
        category_text = ", ".join(plan.categories[:4]) if plan.categories else "broad LLM Brain search"
        return plan, AgentTraceItem(
            agent="ArchitectureAgent",
            status="completed",
            detail=f"Built a search plan across {category_text}.",
            mode=mode,
        )


class ImplementationAgent:
    def __init__(self, runtime: OptionalLLMRuntime) -> None:
        self.runtime = runtime

    def run(
        self,
        specification: Specification,
        limit: int,
    ) -> Tuple[List[Recommendation], AgentTraceItem, float]:
        llm_data = None
        if callable(getattr(self.runtime, "recommend_tools", None)):
            llm_data = self.runtime.recommend_tools(query=specification.original_query, limit=limit)

        recommendations = _build_llm_brain_recommendations(
            llm_data.get("results", []) if isinstance(llm_data, dict) else [],
            limit,
        )
        confidence = 0.0
        if isinstance(llm_data, dict):
            try:
                confidence = float(llm_data.get("confidence", confidence))
            except (TypeError, ValueError):
                confidence = 0.0

        status = "completed" if recommendations else "blocked"
        detail = (
            f"Asked the LLM Brain for recommendations and assembled {len(recommendations)} matches."
            if recommendations
            else (
                "The LLM Brain did not return usable recommendations. "
                f"{getattr(self.runtime, 'status_detail', lambda: 'Check the OpenAI runtime configuration.')()}"
            )
        )

        return recommendations, AgentTraceItem(
            agent="LLMBrainAgent",
            status=status,
            detail=detail,
            mode=self.runtime.mode,
        ), min(max(confidence, 0.0), 1.0)


class EvaluationAgent:
    def __init__(self, runtime: OptionalLLMRuntime) -> None:
        self.runtime = runtime

    def run(self, recommendations: Sequence[Recommendation], confidence: float) -> Tuple[bool, AgentTraceItem]:
        categories = {item.category for item in recommendations}
        should_retry = confidence < 0.56 and len(categories) < 2
        detail = (
            "Confidence was low, so the orchestrator should widen the search."
            if should_retry
            else f"Confidence is acceptable at {confidence:.2f} with {len(categories)} categories represented."
        )
        mode = "heuristic"

        return should_retry, AgentTraceItem(
            agent="EvaluationAgent",
            status="completed",
            detail=detail,
            mode=mode,
        )


class OrchestratorAgent:
    def __init__(self, runtime: OptionalLLMRuntime | None = None) -> None:
        self.runtime = runtime or OptionalLLMRuntime()
        self.specification_agent = SpecificationAgent(self.runtime)
        self.architecture_agent = ArchitectureAgent(self.runtime)
        self.implementation_agent = ImplementationAgent(self.runtime)
        self.evaluation_agent = EvaluationAgent(self.runtime)
        self._recommendation_cache: dict[str, Recommendation] = {}

    def run(
        self,
        query: str,
        limit: int,
        tools: Sequence[Tool] | None = None,
    ) -> Tuple[List[Recommendation], List[AgentTraceItem], OrchestrationReport]:
        pipeline_start = time.perf_counter()
        trace: List[AgentTraceItem] = []
        timings: List[StageTiming] = []
        iterations: List[IterationLogEntry] = [
            IterationLogEntry(
                iteration=1,
                stage="OrchestratorAgent",
                status="started",
                detail="Accepted the plain-English request and opened the LLM Brain pipeline.",
            )
        ]

        stage_start = time.perf_counter()
        orchestrator_detail = "Sequenced local intent parsing, one LLM Brain recommendation call, and result validation."
        orchestrator_duration = _duration_ms(stage_start)

        trace.append(
            AgentTraceItem(
                agent="OrchestratorAgent",
                status="completed",
                detail=orchestrator_detail,
                mode=self.runtime.mode,
                durationMs=orchestrator_duration,
            )
        )
        timings.append(StageTiming(stage="OrchestratorAgent", durationMs=orchestrator_duration))

        stage_start = time.perf_counter()
        specification, spec_trace = self.specification_agent.run(query)
        spec_trace.durationMs = _duration_ms(stage_start)
        trace.append(spec_trace)
        timings.append(StageTiming(stage="SpecificationAgent", durationMs=spec_trace.durationMs))
        iterations.append(
            IterationLogEntry(
                iteration=1,
                stage="SpecificationAgent",
                status="completed",
                detail=spec_trace.detail,
            )
        )

        stage_start = time.perf_counter()
        architecture_plan, architecture_trace = self.architecture_agent.run(specification)
        architecture_trace.durationMs = _duration_ms(stage_start)
        trace.append(architecture_trace)
        timings.append(StageTiming(stage="ArchitectureAgent", durationMs=architecture_trace.durationMs))
        iterations.append(
            IterationLogEntry(
                iteration=1,
                stage="ArchitectureAgent",
                status="completed",
                detail=architecture_trace.detail,
            )
        )

        stage_start = time.perf_counter()
        recommendations, implementation_trace, confidence = self.implementation_agent.run(
            specification,
            limit,
        )
        implementation_trace.durationMs = _duration_ms(stage_start)
        trace.append(implementation_trace)
        timings.append(StageTiming(stage="LLMBrainAgent", durationMs=implementation_trace.durationMs))
        iterations.append(
            IterationLogEntry(
                iteration=1,
                stage="LLMBrainAgent",
                status=implementation_trace.status,
                detail=implementation_trace.detail,
            )
        )

        stage_start = time.perf_counter()
        retry_required, evaluation_trace = self.evaluation_agent.run(recommendations, confidence)
        evaluation_trace.durationMs = _duration_ms(stage_start)
        trace.append(evaluation_trace)
        timings.append(StageTiming(stage="EvaluationAgent", durationMs=evaluation_trace.durationMs))
        iterations.append(
            IterationLogEntry(
                iteration=1,
                stage="EvaluationAgent",
                status="completed",
                detail=evaluation_trace.detail,
            )
        )

        for recommendation in recommendations:
            self._recommendation_cache[recommendation.slug] = recommendation

        report = OrchestrationReport(
            mode=self.runtime.mode,
            milestones=[
                MilestoneStatus(
                    name="Specification",
                    owner="SpecificationAgent",
                    status="completed",
                    detail="Converted the plain-English request into searchable intent, assumptions, and constraints.",
                ),
                MilestoneStatus(
                    name="Architecture",
                    owner="ArchitectureAgent",
                    status="completed",
                    detail="Mapped the query to search categories and service boundaries.",
                ),
                MilestoneStatus(
                    name="Implementation",
                    owner="LLMBrainAgent",
                    status=implementation_trace.status,
                    detail="Asked the LLM Brain knowledgebase for recommendation objects and starter guidance.",
                ),
                MilestoneStatus(
                    name="Evaluation",
                    owner="EvaluationAgent",
                    status="completed",
                    detail="Reviewed confidence, maintainability, and whether a retry pass was needed.",
                ),
            ],
            iterations=iterations,
            assumptions=specification.assumptions,
            missingRequirements=specification.missing_requirements,
            serviceBoundaries=architecture_plan.service_boundaries,
            architectureNotes=architecture_plan.architecture_notes,
            timings=timings,
            totalDurationMs=_duration_ms(pipeline_start),
        )
        return recommendations, trace, report

    def get_recommendation_for_guide(self, slug: str, query: str) -> Recommendation | None:
        cached = self._recommendation_cache.get(slug)
        if cached:
            return cached

        if not callable(getattr(self.runtime, "recommend_tool_for_guide", None)):
            return None

        llm_data = self.runtime.recommend_tool_for_guide(slug=slug, query=query)
        raw_result = llm_data.get("result") if isinstance(llm_data, dict) else None
        recommendations = _build_llm_brain_recommendations([raw_result] if raw_result else [], 1)
        if not recommendations:
            return None

        recommendation = recommendations[0]
        self._recommendation_cache[recommendation.slug] = recommendation
        return recommendation


def build_summary(query: str, recommendations: Iterable[Recommendation]) -> str:
    top = list(recommendations)[:3]
    if not top:
        return "The LLM Brain did not return recommendations yet. Check the OpenAI configuration and try again."

    names = [tool.name for tool in top]
    tool_text = names[0] if len(names) == 1 else ", ".join(names[:-1]) + f", and {names[-1]}"
    return f"For \"{query},\" start with {tool_text} so you can move from exploration into your first practical step."
