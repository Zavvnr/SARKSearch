from __future__ import annotations

import json
from typing import Any

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


class OptionalLLMRuntime:
    def __init__(self) -> None:
        self.enabled = bool(settings.openai_api_key and OpenAI)
        self.model = settings.openai_model
        self.client = OpenAI(api_key=settings.openai_api_key) if self.enabled else None

    @property
    def mode(self) -> str:
        return self.model if self.enabled else "heuristic"

    def generate_json(self, *, instructions: str, input_text: str) -> dict[str, Any] | None:
        if not self.enabled or not self.client:
            return None

        try:
            response = self.client.responses.create(
                model=self.model,
                instructions=instructions,
                input=input_text,
            )
            text = _strip_code_fences(response.output_text)
            return json.loads(text)
        except Exception:
            return None
