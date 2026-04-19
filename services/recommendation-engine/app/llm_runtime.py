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


def _safe_error_message(error: Exception) -> str:
    message = str(getattr(error, "message", "") or error).strip()
    if not message:
        return type(error).__name__
    redacted = message.replace(settings.openai_api_key, "[redacted]") if settings.openai_api_key else message
    return f"{type(error).__name__}: {redacted[:700]}"


def _json_mode_input(input_text: str) -> str:
    if "json" in input_text.lower():
        return input_text
    return f"Return JSON only.\n{input_text}"


def _string_field(item: object, field: str) -> str:
    if isinstance(item, dict):
        value = item.get(field, "")
    else:
        value = getattr(item, field, "")
    return str(value or "").strip()


def _excluded_results_payload(excluded_results: Sequence[object] | None) -> list[dict[str, str]]:
    payload = []
    for item in excluded_results or []:
        normalized = {
            "slug": _string_field(item, "slug"),
            "name": _string_field(item, "name"),
            "url": _string_field(item, "url"),
        }
        if normalized["slug"] or normalized["name"] or normalized["url"]:
            payload.append(normalized)
    return payload


class OptionalLLMRuntime:
    def __init__(self) -> None:
        self.enabled = bool(settings.openai_api_key and OpenAI)
        self.model = settings.openai_model
        self.client = OpenAI(api_key=settings.openai_api_key) if self.enabled else None
        self.last_error = ""

    @property
    def mode(self) -> str:
        return self.model if self.enabled else "llm-brain-unavailable"

    def status_detail(self) -> str:
        if OpenAI is None:
            return "The OpenAI Python package is not installed in this runtime."
        if not settings.openai_api_key:
            return "OPENAI_API_KEY is not configured for the recommendation engine."
        if self.last_error:
            return f"The last LLM Brain request failed: {self.last_error}."
        return "The LLM Brain runtime is configured."

    def _create_json_response(
        self,
        *,
        instructions: str,
        input_text: str,
    ) -> dict[str, Any] | None:
        if not self.client:
            return None

        response = self.client.responses.create(
            model=self.model,
            instructions=instructions,
            input=_json_mode_input(input_text),
            text={"format": {"type": "json_object"}},
        )
        return _parse_json_output(response.output_text)

    def generate_json(self, *, instructions: str, input_text: str) -> dict[str, Any] | None:
        if not self.enabled or not self.client:
            self.last_error = self.status_detail()
            return None

        try:
            self.last_error = ""
            return self._create_json_response(
                instructions=instructions,
                input_text=input_text,
            )
        except Exception as error:
            self.last_error = _safe_error_message(error)
            return None

    def recommend_tools(
        self,
        *,
        query: str,
        limit: int,
        excluded_results: Sequence[object] | None = None,
    ) -> dict[str, Any] | None:
        excluded_payload = _excluded_results_payload(excluded_results)
        exclusion_instruction = (
            "Do not return any result whose slug, name, or official URL appears in excluded_results. "
            "If a best match is excluded, replace it with the next best distinct recommendation. "
            if excluded_payload
            else ""
        )
        instructions = (
            "You are the LLM Brain knowledgebase for SARKSearch. "
            "Use your broad knowledge of well-known sites, apps, schools, programs, communities, and services. "
            "Do not use a provided catalog, Product Hunt, Codeforces, College Scorecard, or any local database. "
            "Return strict JSON with keys summary, confidence, and results. "
            f"results must contain at most {limit} objects. "
            "Each result object must contain slug, name, category, popularity, description, url, icon, "
            "relevance_reason, and starter_tip. "
            f"When limit is {limit}, aim to return that many distinct usable recommendations if enough exist. "
            f"{exclusion_instruction}"
            "Prefer official websites and broadly recognized tools. "
            "If you are not confident about an official URL, omit that result instead of inventing one. "
            "Use a logo or favicon URL for icon when you are confident; otherwise use short initials. "
            "Keep descriptions and starter tips beginner-friendly and practical."
        )
        payload = json.dumps({"query": query, "limit": limit, "excluded_results": excluded_payload})
        return self.generate_json(instructions=instructions, input_text=payload)

    def recommend_tool_for_guide(self, *, slug: str, query: str) -> dict[str, Any] | None:
        instructions = (
            "You are the LLM Brain knowledgebase for SARKSearch starter documents. "
            "Reconstruct one beginner-friendly recommendation from a slug and user goal. "
            "Do not use a local catalog or external product database. "
            "Return strict JSON with one key result. "
            "result must contain slug, name, category, popularity, description, url, icon, "
            "relevance_reason, and starter_tip. "
            "Use only an official URL you are confident is real. If unsure, return result as null."
        )
        payload = json.dumps({"slug": slug, "query": query})
        return self.generate_json(instructions=instructions, input_text=payload)
