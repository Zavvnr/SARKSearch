from __future__ import annotations

import json
from typing import Any, Sequence

from .config import settings

try:
    from openai import OpenAI
except ImportError:  # pragma: no cover - dependency is optional at runtime
    OpenAI = None


def _strip_code_fences(text: str) -> str:
    stripped = text.strip()
    if stripped.startswith("```"):
        lines = stripped.splitlines()
        if len(lines) >= 3:
            stripped = "\n".join(lines[1:-1]).strip()
    return stripped


def _parse_json_output(text: str) -> dict[str, Any] | None:
    stripped = _strip_code_fences(text)
    if not stripped:
        return None

    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        return None


class OptionalLLMRuntime:
    def __init__(self) -> None:
        self.enabled = bool(settings.openai_api_key and OpenAI)
        self.model = settings.openai_model
        self.client = OpenAI(api_key=settings.openai_api_key) if self.enabled else None

    @property
    def mode(self) -> str:
        return self.model if self.enabled else "heuristic"

    def _create_json_response(
        self,
        *,
        model: str,
        instructions: str,
        input_text: str,
        tools: Sequence[dict[str, Any]] | None = None,
        tool_choice: str | None = None,
    ) -> dict[str, Any] | None:
        if not self.client:
            return None

        request: dict[str, Any] = {
            "model": model,
            "instructions": instructions,
            "input": input_text,
            "text": {"format": {"type": "json_object"}},
        }
        if tools:
            request["tools"] = list(tools)
        if tool_choice:
            request["tool_choice"] = tool_choice

        response = self.client.responses.create(**request)
        return _parse_json_output(response.output_text)

    def _web_search_models(self) -> list[str]:
        candidates: list[str] = []
        for candidate in ("gpt-5.4", self.model):
            normalized = str(candidate or "").strip()
            if normalized and normalized not in candidates:
                candidates.append(normalized)
        return candidates

    def generate_json(self, *, instructions: str, input_text: str) -> dict[str, Any] | None:
        if not self.enabled or not self.client:
            return None

        try:
            return self._create_json_response(
                model=self.model,
                instructions=instructions,
                input_text=input_text,
            )
        except Exception:
            return None

    def discover_popular_tools(
        self,
        *,
        query: str,
        limit: int,
        current_recommendations: Sequence[dict[str, Any]] | None = None,
    ) -> dict[str, Any] | None:
        if not self.enabled or not self.client:
            return None

        instructions = (
            "You are the live web discovery assistant for SARKSearch. "
            "Use the web search tool to find popular, beginner-friendly sites, apps, schools, programs, contests, or communities that match the user's goal. "
            "Prioritize official pages, broadly adopted options, and results a first-time user can try today. "
            "Return JSON with keys summary and results. "
            f"results must contain at most {limit} objects. "
            "Each result object must contain name, category, popularity, description, url, relevance_reason, and starter_tip. "
            "Use concise strings, avoid duplicates, and do not invent URLs or popularity claims."
        )
        payload = json.dumps(
            {
                "query": query,
                "limit": limit,
                "current_recommendations": list(current_recommendations or [])[:5],
            }
        )

        for model in self._web_search_models():
            try:
                data = self._create_json_response(
                    model=model,
                    instructions=instructions,
                    input_text=payload,
                    tools=[{"type": "web_search"}],
                    tool_choice="required",
                )
            except Exception:
                continue

            if isinstance(data, dict) and isinstance(data.get("results"), list) and data["results"]:
                data["_model"] = model
                return data

        return None
