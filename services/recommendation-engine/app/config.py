from __future__ import annotations

import os
from pathlib import Path
from typing import Mapping, MutableMapping

SERVICE_ROOT = Path(__file__).resolve().parents[1]
ENV_PATH_OVERRIDE = "SARKSEARCH_RECOMMENDATION_ENV_PATH"
DEFAULT_OPENAI_MODEL = "gpt-4o-mini"
ACTIVE_ENV_KEYS = frozenset(
    {
        "RECOMMENDATION_ENGINE_NAME",
        "RECOMMENDATION_ENGINE_HOST",
        "RECOMMENDATION_ENGINE_PORT",
        "DEFAULT_SEARCH_LIMIT",
        "MAX_SEARCH_LIMIT",
        "OPENAI_API_KEY",
        "OPENAI_MODEL",
    }
)


def _resolve_env_path(environ: Mapping[str, str] | None = None) -> Path:
    source = environ if environ is not None else os.environ
    override = str(source.get(ENV_PATH_OVERRIDE, "")).strip()
    return Path(override) if override else SERVICE_ROOT / ".env"


def _load_env_file(
    env_path: Path | None = None,
    environ: MutableMapping[str, str] | None = None,
) -> None:
    env_path = env_path or SERVICE_ROOT / ".env"
    target_environ = environ if environ is not None else os.environ
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if value and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]

        target_environ.setdefault(key, value)


def _get_int(name: str, fallback: int, minimum: int = 1, environ: Mapping[str, str] | None = None) -> int:
    source = environ if environ is not None else os.environ
    raw_value = str(source.get(name, "")).strip()
    try:
        parsed = int(raw_value)
    except ValueError:
        return fallback

    return parsed if parsed >= minimum else fallback


def _get_string(name: str, fallback: str = "", environ: Mapping[str, str] | None = None) -> str:
    source = environ if environ is not None else os.environ
    value = str(source.get(name, fallback)).strip()
    return value or fallback


def _get_bool(name: str, fallback: bool, environ: Mapping[str, str] | None = None) -> bool:
    source = environ if environ is not None else os.environ
    raw_value = str(source.get(name, "")).strip().lower()
    if raw_value in {"1", "true", "yes", "on"}:
        return True
    if raw_value in {"0", "false", "no", "off"}:
        return False
    return fallback


def _normalize_openai_model(value: str) -> str:
    normalized = value.strip()
    if normalized.lower() in {"gpt-5.4", "gpt 5.4", "gpt-4.1", "gpt 4.1"}:
        return DEFAULT_OPENAI_MODEL
    return normalized or DEFAULT_OPENAI_MODEL


_load_env_file(_resolve_env_path())


class Settings:
    def __init__(self, environ: Mapping[str, str] | None = None) -> None:
        source = environ if environ is not None else os.environ
        self.service_root = SERVICE_ROOT
        self.app_name = _get_string(
            "RECOMMENDATION_ENGINE_NAME",
            "SARKSearch Recommendation Engine",
            source,
        )
        self.host = _get_string("RECOMMENDATION_ENGINE_HOST", "127.0.0.1", source)
        self.port = _get_int("RECOMMENDATION_ENGINE_PORT", 8000, environ=source)
        self.default_search_limit = _get_int("DEFAULT_SEARCH_LIMIT", 8, environ=source)
        self.max_search_limit = _get_int("MAX_SEARCH_LIMIT", 12, self.default_search_limit, source)
        self.default_search_limit = min(self.default_search_limit, self.max_search_limit)
        self.openai_api_key = _get_string("OPENAI_API_KEY", "", source)
        self.openai_model = _normalize_openai_model(_get_string("OPENAI_MODEL", DEFAULT_OPENAI_MODEL, source))


settings = Settings()
