from __future__ import annotations

import os


class Settings:
    openai_api_key = os.getenv("OPENAI_API_KEY", "").strip()
    openai_model = os.getenv("OPENAI_MODEL", "gpt-4.1").strip() or "gpt-4.1"


settings = Settings()
