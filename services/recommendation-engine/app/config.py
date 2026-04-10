from __future__ import annotations

import os
from pathlib import Path

SERVICE_ROOT = Path(__file__).resolve().parents[1]


def _load_env_file() -> None:
    env_path = SERVICE_ROOT / ".env"
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

        os.environ.setdefault(key, value)


def _get_int(name: str, fallback: int, minimum: int = 1) -> int:
    raw_value = str(os.getenv(name, "")).strip()
    try:
        parsed = int(raw_value)
    except ValueError:
        return fallback

    return parsed if parsed >= minimum else fallback


def _get_string(name: str, fallback: str = "") -> str:
    value = str(os.getenv(name, fallback)).strip()
    return value or fallback


def _get_bool(name: str, fallback: bool) -> bool:
    raw_value = str(os.getenv(name, "")).strip().lower()
    if raw_value in {"1", "true", "yes", "on"}:
        return True
    if raw_value in {"0", "false", "no", "off"}:
        return False
    return fallback


_load_env_file()


class Settings:
    def __init__(self) -> None:
        self.service_root = SERVICE_ROOT
        self.app_name = _get_string("RECOMMENDATION_ENGINE_NAME", "SARKSearch Recommendation Engine")
        self.host = _get_string("RECOMMENDATION_ENGINE_HOST", "127.0.0.1")
        self.port = _get_int("RECOMMENDATION_ENGINE_PORT", 8000)
        self.default_search_limit = _get_int("DEFAULT_SEARCH_LIMIT", 8)
        self.max_search_limit = _get_int("MAX_SEARCH_LIMIT", 12, self.default_search_limit)
        self.default_search_limit = min(self.default_search_limit, self.max_search_limit)
        self.catalog_provider = _get_string("CATALOG_PROVIDER", "local").lower()
        self.catalog_include_local = _get_bool("CATALOG_INCLUDE_LOCAL", True)
        self.catalog_cache_ttl_seconds = _get_int("CATALOG_CACHE_TTL_SECONDS", 3600)
        self.catalog_max_items = _get_int("CATALOG_MAX_ITEMS", 60)
        self.query_aware_catalog = _get_bool("QUERY_AWARE_CATALOG", True)
        self.product_hunt_token = _get_string("PRODUCT_HUNT_TOKEN", "")
        self.product_hunt_topics = _get_string(
            "PRODUCT_HUNT_TOPICS",
            "productivity,education,career,design tools,developer tools,artificial intelligence",
        )
        self.product_hunt_posts_per_topic = _get_int("PRODUCT_HUNT_POSTS_PER_TOPIC", 12)
        self.product_hunt_posted_after_days = _get_int("PRODUCT_HUNT_POSTED_AFTER_DAYS", 365)
        self.product_hunt_featured_only = _get_bool("PRODUCT_HUNT_FEATURED_ONLY", True)
        self.college_scorecard_api_key = _get_string("COLLEGE_SCORECARD_API_KEY", "")
        self.college_scorecard_per_page = _get_int("COLLEGE_SCORECARD_PER_PAGE", 8)
        self.codeforces_contest_limit = _get_int("CODEFORCES_CONTEST_LIMIT", 8)
        self.openai_api_key = _get_string("OPENAI_API_KEY", "")
        self.openai_model = _get_string("OPENAI_MODEL", "gpt-4.1")


settings = Settings()
