from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, List, Sequence, Tuple

from .knowledgebase import TOOLS
from .models import AgentTraceItem, Recommendation, Tool

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
}


def tokenize(text: str) -> List[str]:
    lowered = "".join(char.lower() if char.isalnum() else " " for char in text)
    return [token for token in lowered.split() if token and token not in STOP_WORDS]


@dataclass
class Specification:
    original_query: str
    keywords: List[str]
    expanded_keywords: List[str]
    needs: List[str]


class SpecificationAgent:
    def run(self, query: str) -> Tuple[Specification, AgentTraceItem]:
        keywords = tokenize(query)
        expanded = set(keywords)
        needs = []

        for label, related_terms in SYNONYM_GROUPS.items():
            if any(term in keywords for term in related_terms):
                expanded.update(related_terms)
                needs.append(label)

        specification = Specification(
            original_query=query,
            keywords=keywords,
            expanded_keywords=sorted(expanded),
            needs=needs or ["general discovery"],
        )

        return specification, AgentTraceItem(
            agent="SpecificationAgent",
            status="completed",
            detail=f"Extracted keywords {specification.keywords[:6]} and mapped needs to {', '.join(specification.needs)}.",
        )


class ArchitectureAgent:
    def run(self, specification: Specification) -> AgentTraceItem:
        matching_categories = sorted(
            {
                tool.category
                for tool in TOOLS
                if any(keyword in tool.tags for keyword in specification.expanded_keywords)
            }
        )
        category_text = ", ".join(matching_categories[:4]) if matching_categories else "broad catalog search"
        return AgentTraceItem(
            agent="ArchitectureAgent",
            status="completed",
            detail=f"Built a search plan across {category_text}.",
        )


class ImplementationAgent:
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

    def run(self, specification: Specification, limit: int) -> Tuple[List[Recommendation], AgentTraceItem, float]:
        ranked = []

        for tool in TOOLS:
            score, matches = self._score_tool(
                tool,
                specification.keywords,
                specification.expanded_keywords,
                specification.needs,
            )
            ranked.append((score, matches, tool))

        ranked.sort(key=lambda item: item[0], reverse=True)

        recommendations = []
        top_scores = []
        for score, matches, tool in ranked[:limit]:
            top_scores.append(score)
            recommendations.append(
                Recommendation(
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
            )

        confidence = (sum(top_scores) / len(top_scores)) / 140 if top_scores else 0
        return recommendations, AgentTraceItem(
            agent="ImplementationAgent",
            status="completed",
            detail=f"Ranked {len(TOOLS)} tools and assembled the top {len(recommendations)} matches.",
        ), min(confidence, 1.0)


class EvaluationAgent:
    def run(self, recommendations: Sequence[Recommendation], confidence: float) -> Tuple[bool, AgentTraceItem]:
        categories = {item.category for item in recommendations}
        should_retry = confidence < 0.56 and len(categories) < 2
        detail = (
            "Confidence was low, so the orchestrator should widen the search."
            if should_retry
            else f"Confidence is acceptable at {confidence:.2f} with {len(categories)} categories represented."
        )
        return should_retry, AgentTraceItem(
            agent="EvaluationAgent",
            status="completed",
            detail=detail,
        )


class OrchestratorAgent:
    def __init__(self) -> None:
        self.specification_agent = SpecificationAgent()
        self.architecture_agent = ArchitectureAgent()
        self.implementation_agent = ImplementationAgent()
        self.evaluation_agent = EvaluationAgent()

    def run(self, query: str, limit: int) -> Tuple[List[Recommendation], List[AgentTraceItem]]:
        trace = []
        specification, spec_trace = self.specification_agent.run(query)
        trace.append(spec_trace)
        trace.append(self.architecture_agent.run(specification))

        recommendations, implementation_trace, confidence = self.implementation_agent.run(specification, limit)
        trace.append(implementation_trace)

        retry_required, evaluation_trace = self.evaluation_agent.run(recommendations, confidence)
        trace.append(evaluation_trace)

        if retry_required:
            widened_specification = Specification(
                original_query=specification.original_query,
                keywords=specification.keywords,
                expanded_keywords=sorted(set(specification.expanded_keywords + ["beginner", "free", "community"])),
                needs=specification.needs,
            )
            recommendations, retried_trace, retried_confidence = self.implementation_agent.run(
                widened_specification,
                limit,
            )
            trace.append(
                AgentTraceItem(
                    agent="OrchestratorAgent",
                    status="retried",
                    detail=f"Triggered one refinement pass and raised confidence to {retried_confidence:.2f}.",
                )
            )
            trace.append(retried_trace)

        return recommendations, trace


def build_summary(query: str, recommendations: Iterable[Recommendation]) -> str:
    top = list(recommendations)[:3]
    if not top:
        return "Start with broad, beginner-friendly tools and refine from there."

    names = [tool.name for tool in top]
    tool_text = names[0] if len(names) == 1 else ", ".join(names[:-1]) + f", and {names[-1]}"
    return f"For \"{query},\" start with {tool_text} so you can move from exploration into your first practical step."
