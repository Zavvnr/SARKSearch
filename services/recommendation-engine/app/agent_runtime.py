from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Iterable, List, Sequence, Tuple

from .knowledgebase import TOOLS as LOCAL_TOOLS
from .llm_runtime import OptionalLLMRuntime
from .models import (
    AgentTraceItem,
    IterationLogEntry,
    MilestoneStatus,
    OrchestrationReport,
    Recommendation,
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
    "FastAPI owns agent reasoning, ranking, and starter PDF generation.",
]

DEFAULT_ARCHITECTURE_NOTES = [
    "FastAPI preprocesses plain-English input before the React UI renders results.",
    "The catalog can stay local for reliability or be augmented by external provider data.",
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


def _coerce_list(raw: object, fallback: Sequence[str], lowercase: bool = True) -> List[str]:
    if not isinstance(raw, list):
        return list(fallback)
    cleaned = [str(item).strip() for item in raw if str(item).strip()]
    if lowercase:
        cleaned = [item.lower() for item in cleaned]
    return cleaned or list(fallback)


def _build_web_discovery_recommendations(raw_results: Sequence[object], limit: int) -> List[Recommendation]:
    recommendations: List[Recommendation] = []
    seen: set[str] = set()

    for raw_item in raw_results:
        if not isinstance(raw_item, dict):
            continue

        name = str(raw_item.get("name") or "").strip()
        url = str(raw_item.get("url") or "").strip()
        description = str(raw_item.get("description") or "").strip()
        if not name or not url.startswith("http") or not description:
            continue

        slug = str(raw_item.get("slug") or _slugify(name)).strip() or _slugify(name)
        dedupe_key = slug.lower()
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)

        recommendations.append(
            Recommendation(
                slug=slug,
                name=name,
                category=str(raw_item.get("category") or "Software / Discovery"),
                popularity=str(raw_item.get("popularity") or "Popular web match"),
                description=description,
                url=url,
                icon=str(raw_item.get("icon") or _icon_for_name(name)),
                relevanceReason=str(
                    raw_item.get("relevance_reason")
                    or "Popular on the web for this goal and easier to try than niche alternatives."
                ),
                starterTip=str(
                    raw_item.get("starter_tip")
                    or "Open the official site and try one small task tied to your goal."
                ),
            )
        )

        if len(recommendations) >= limit:
            break

    return recommendations


def _merge_recommendations(
    primary: Sequence[Recommendation],
    secondary: Sequence[Recommendation],
    limit: int,
) -> List[Recommendation]:
    merged: List[Recommendation] = []
    seen: set[str] = set()

    for collection in (primary, secondary):
        for item in collection:
            key = item.slug.lower()
            if key in seen:
                continue
            seen.add(key)
            merged.append(item)
            if len(merged) >= limit:
                return merged

    return merged


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

        llm_data = self.runtime.generate_json(
            instructions=(
                "You are the SpecificationAgent for SARKSearch. "
                "Return strict JSON with keys keywords, expanded_keywords, needs, assumptions, missing_requirements. "
                "Each value must be an array of short lowercase strings. "
                "Infer only what helps a beginner discovery engine."
            ),
            input_text=f"User query: {query}",
        )

        if llm_data:
            keywords = _coerce_list(llm_data.get("keywords"), keywords)
            expanded = set(_coerce_list(llm_data.get("expanded_keywords"), sorted(expanded)))
            needs = _coerce_list(llm_data.get("needs"), needs or ["general discovery"])
            assumptions = _coerce_list(llm_data.get("assumptions"), assumptions, lowercase=False)
            missing_requirements = _coerce_list(
                llm_data.get("missing_requirements"),
                missing_requirements,
                lowercase=False,
            )
            mode = self.runtime.mode

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

    def run(self, specification: Specification, tools: Sequence[Tool]) -> Tuple[ArchitecturePlan, AgentTraceItem]:
        categories = sorted(
            {
                tool.category
                for tool in tools
                if any(keyword in tool.tags for keyword in specification.expanded_keywords)
            }
        )
        service_boundaries = list(DEFAULT_SERVICE_BOUNDARIES)
        architecture_notes = list(DEFAULT_ARCHITECTURE_NOTES)
        mode = "heuristic"

        llm_data = self.runtime.generate_json(
            instructions=(
                "You are the ArchitectureAgent for SARKSearch. "
                "Return strict JSON with keys categories, service_boundaries, architecture_notes. "
                "categories should be an array of short strings. "
                "service_boundaries and architecture_notes should be arrays of concise sentences. "
                "Stay consistent with a React SPA, Node.js gateway, FastAPI reasoning layer, and MongoDB storage."
            ),
            input_text=json.dumps(
                {
                    "query": specification.original_query,
                    "keywords": specification.expanded_keywords,
                    "matched_categories": categories,
                }
            ),
        )

        if llm_data:
            categories = [item for item in _coerce_list(llm_data.get("categories"), categories, lowercase=False) if item]
            service_boundaries = _coerce_list(
                llm_data.get("service_boundaries"),
                service_boundaries,
                lowercase=False,
            )
            architecture_notes = _coerce_list(
                llm_data.get("architecture_notes"),
                architecture_notes,
                lowercase=False,
            )
            mode = self.runtime.mode

        plan = ArchitecturePlan(
            categories=categories,
            service_boundaries=service_boundaries or list(DEFAULT_SERVICE_BOUNDARIES),
            architecture_notes=architecture_notes or list(DEFAULT_ARCHITECTURE_NOTES),
        )
        category_text = ", ".join(plan.categories[:4]) if plan.categories else "broad catalog search"
        return plan, AgentTraceItem(
            agent="ArchitectureAgent",
            status="completed",
            detail=f"Built a search plan across {category_text}.",
            mode=mode,
        )


class ImplementationAgent:
    def __init__(self, runtime: OptionalLLMRuntime) -> None:
        self.runtime = runtime

    def _score_tool(
        self,
        tool: Tool,
        raw_keywords: Sequence[str],
        expanded_keywords: Sequence[str],
        needs: Sequence[str],
    ) -> Tuple[int, List[str]]:
        score = tool.popularity_score
        matches = []

        for keyword in raw_keywords:
            if keyword in tool.tags:
                score += 20
                matches.append(keyword)
            elif keyword in tool.category.lower():
                score += 12
                matches.append(keyword)

        for keyword in expanded_keywords:
            if keyword in raw_keywords:
                continue
            if keyword in tool.tags:
                score += 8
                matches.append(keyword)
            elif keyword in tool.category.lower():
                score += 6
                matches.append(keyword)

        for need in needs:
            if need in tool.category.lower() or need in tool.tags:
                score += 10

        if "resume" in raw_keywords:
            if "resume" in tool.tags:
                score += 18
            if "template" in tool.tags or "templates" in tool.tags:
                score += 10
            if {"job", "career", "networking"}.intersection(tool.tags):
                score += 10

        return score, matches

    def _heuristic_recommendation(self, tool: Tool, matches: Sequence[str]) -> Recommendation:
        return Recommendation(
            slug=tool.slug,
            name=tool.name,
            category=tool.category,
            popularity=tool.popularity,
            description=tool.description,
            url=tool.url,
            icon=tool.icon,
            relevanceReason=(
                f"Matches {', '.join(matches[:3]) if matches else tool.category} "
                "and stays high because of its broad adoption."
            ),
            starterTip=tool.starter_steps[0],
        )

    def run(
        self,
        specification: Specification,
        limit: int,
        tools: Sequence[Tool],
    ) -> Tuple[List[Recommendation], AgentTraceItem, float]:
        ranked = []

        for tool in tools:
            score, matches = self._score_tool(
                tool,
                specification.keywords,
                specification.expanded_keywords,
                specification.needs,
            )
            ranked.append((score, matches, tool))

        ranked.sort(key=lambda item: item[0], reverse=True)
        shortlist = ranked[: max(limit, 8)]
        top_scores = [item[0] for item in shortlist[:limit]]
        confidence = (sum(top_scores) / len(top_scores)) / 140 if top_scores else 0

        recommendations = [self._heuristic_recommendation(tool, matches) for _score, matches, tool in shortlist[:limit]]
        mode = "heuristic"

        llm_data = self.runtime.generate_json(
            instructions=(
                "You are the ImplementationAgent for SARKSearch. "
                "Given a beginner query and candidate tools, return strict JSON with keys ranking and confidence. "
                "ranking must be an array of objects with slug, relevance_reason, and starter_tip. "
                "Use only the provided slugs and keep tips practical for first-time users."
            ),
            input_text=json.dumps(
                {
                    "query": specification.original_query,
                    "candidates": [
                        {
                            "slug": tool.slug,
                            "name": tool.name,
                            "category": tool.category,
                            "popularity": tool.popularity,
                            "description": tool.description,
                            "tags": tool.tags,
                            "starter_steps": tool.starter_steps,
                            "score": score,
                            "matches": matches[:5],
                        }
                        for score, matches, tool in shortlist
                    ],
                }
            ),
        )

        if llm_data:
            candidate_map = {tool.slug: (tool, matches) for _score, matches, tool in shortlist}
            used = set()
            reranked = []
            for item in llm_data.get("ranking", []):
                slug = str(item.get("slug", "")).strip()
                if slug in used or slug not in candidate_map:
                    continue
                tool, matches = candidate_map[slug]
                fallback = self._heuristic_recommendation(tool, matches)
                reranked.append(
                    Recommendation(
                        slug=tool.slug,
                        name=tool.name,
                        category=tool.category,
                        popularity=tool.popularity,
                        description=tool.description,
                        url=tool.url,
                        icon=tool.icon,
                        relevanceReason=str(item.get("relevance_reason") or fallback.relevanceReason),
                        starterTip=str(item.get("starter_tip") or tool.starter_steps[0]),
                    )
                )
                used.add(slug)

            for _score, matches, tool in shortlist:
                if len(reranked) >= limit:
                    break
                if tool.slug in used:
                    continue
                reranked.append(self._heuristic_recommendation(tool, matches))

            if reranked:
                recommendations = reranked[:limit]
                try:
                    confidence = float(llm_data.get("confidence", confidence))
                except (TypeError, ValueError):
                    pass
                mode = self.runtime.mode

        return recommendations, AgentTraceItem(
            agent="ImplementationAgent",
            status="completed",
            detail=f"Ranked {len(tools)} tools and assembled the top {len(recommendations)} matches.",
            mode=mode,
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

        llm_data = self.runtime.generate_json(
            instructions=(
                "You are the EvaluationAgent for SARKSearch. "
                "Return strict JSON with keys should_retry and detail. "
                "should_retry must be a boolean and detail must be a short sentence about quality and maintainability."
            ),
            input_text=json.dumps(
                {
                    "confidence": confidence,
                    "recommendations": [item.model_dump() for item in recommendations],
                }
            ),
        )

        if llm_data:
            should_retry = bool(llm_data.get("should_retry", should_retry))
            detail = str(llm_data.get("detail") or detail)
            mode = self.runtime.mode

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

    def run(
        self,
        query: str,
        limit: int,
        tools: Sequence[Tool] | None = None,
    ) -> Tuple[List[Recommendation], List[AgentTraceItem], OrchestrationReport]:
        catalog_tools = list(tools or LOCAL_TOOLS)
        trace: List[AgentTraceItem] = []
        iterations: List[IterationLogEntry] = [
            IterationLogEntry(
                iteration=1,
                stage="OrchestratorAgent",
                status="started",
                detail="Accepted the plain-English request and opened the milestone pipeline.",
            )
        ]

        orchestrator_detail = "Sequenced specification, architecture, implementation, and evaluation milestones."
        if self.runtime.enabled:
            llm_data = self.runtime.generate_json(
                instructions=(
                    "You are the OrchestratorAgent for SARKSearch. "
                    "Return strict JSON with one key called detail containing a short sentence "
                    "about how you would coordinate the downstream agents."
                ),
                input_text=f"User query: {query}",
            )
            if llm_data and llm_data.get("detail"):
                orchestrator_detail = str(llm_data["detail"])

        trace.append(
            AgentTraceItem(
                agent="OrchestratorAgent",
                status="completed",
                detail=orchestrator_detail,
                mode=self.runtime.mode,
            )
        )

        specification, spec_trace = self.specification_agent.run(query)
        trace.append(spec_trace)
        iterations.append(
            IterationLogEntry(
                iteration=1,
                stage="SpecificationAgent",
                status="completed",
                detail=spec_trace.detail,
            )
        )

        architecture_plan, architecture_trace = self.architecture_agent.run(specification, catalog_tools)
        trace.append(architecture_trace)
        iterations.append(
            IterationLogEntry(
                iteration=1,
                stage="ArchitectureAgent",
                status="completed",
                detail=architecture_trace.detail,
            )
        )

        recommendations, implementation_trace, confidence = self.implementation_agent.run(
            specification,
            limit,
            catalog_tools,
        )
        trace.append(implementation_trace)
        iterations.append(
            IterationLogEntry(
                iteration=1,
                stage="ImplementationAgent",
                status="completed",
                detail=implementation_trace.detail,
            )
        )

        retry_required, evaluation_trace = self.evaluation_agent.run(recommendations, confidence)
        trace.append(evaluation_trace)
        iterations.append(
            IterationLogEntry(
                iteration=1,
                stage="EvaluationAgent",
                status="completed",
                detail=evaluation_trace.detail,
            )
        )

        if retry_required:
            web_discovery = None
            discover_popular_tools = getattr(self.runtime, "discover_popular_tools", None)
            if callable(discover_popular_tools):
                web_discovery = discover_popular_tools(
                    query=specification.original_query,
                    limit=limit,
                    current_recommendations=[item.model_dump() for item in recommendations],
                )

            live_web_results = _build_web_discovery_recommendations(
                web_discovery.get("results", []) if isinstance(web_discovery, dict) else [],
                limit,
            )

            if live_web_results:
                recommendations = _merge_recommendations(live_web_results, recommendations, limit)
                web_detail = str(
                    web_discovery.get("summary")
                    or "Used live web discovery to widen the shortlist after the heuristic pass came back narrow."
                )
                web_mode = str(web_discovery.get("_model") or self.runtime.mode)
                trace.append(
                    AgentTraceItem(
                        agent="OrchestratorAgent",
                        status="retried",
                        detail="Escalated the low-confidence query to live web discovery for fresher tool coverage.",
                        mode=web_mode,
                    )
                )
                trace.append(
                    AgentTraceItem(
                        agent="WebDiscoveryAgent",
                        status="completed",
                        detail=web_detail,
                        mode=web_mode,
                    )
                )
                iterations.append(
                    IterationLogEntry(
                        iteration=2,
                        stage="OrchestratorAgent",
                        status="retried",
                        detail="Escalated from local heuristics to live web discovery because the first pass was narrow.",
                    )
                )
                iterations.append(
                    IterationLogEntry(
                        iteration=2,
                        stage="WebDiscoveryAgent",
                        status="completed",
                        detail=web_detail,
                    )
                )
            else:
                widened_specification = Specification(
                    original_query=specification.original_query,
                    keywords=specification.keywords,
                    expanded_keywords=sorted(set(specification.expanded_keywords + ["beginner", "free", "community"])),
                    needs=specification.needs,
                    assumptions=specification.assumptions,
                    missing_requirements=specification.missing_requirements,
                )
                recommendations, retried_trace, retried_confidence = self.implementation_agent.run(
                    widened_specification,
                    limit,
                    catalog_tools,
                )
                trace.append(
                    AgentTraceItem(
                        agent="OrchestratorAgent",
                        status="retried",
                        detail=f"Triggered one refinement pass and raised confidence to {retried_confidence:.2f}.",
                        mode=self.runtime.mode,
                    )
                )
                trace.append(retried_trace)
                iterations.append(
                    IterationLogEntry(
                        iteration=2,
                        stage="OrchestratorAgent",
                        status="retried",
                        detail="Expanded the keyword set with beginner-friendly fallback terms.",
                    )
                )
                iterations.append(
                    IterationLogEntry(
                        iteration=2,
                        stage="ImplementationAgent",
                        status="completed",
                        detail=retried_trace.detail,
                    )
                )

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
                    owner="ImplementationAgent",
                    status="completed",
                    detail="Ranked the active catalog and prepared starter guidance for the returned tools.",
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
        )
        return recommendations, trace, report


def build_summary(query: str, recommendations: Iterable[Recommendation]) -> str:
    top = list(recommendations)[:3]
    if not top:
        return "Start with broad, beginner-friendly tools and refine from there."

    names = [tool.name for tool in top]
    tool_text = names[0] if len(names) == 1 else ", ".join(names[:-1]) + f", and {names[-1]}"
    return f"For \"{query},\" start with {tool_text} so you can move from exploration into your first practical step."
