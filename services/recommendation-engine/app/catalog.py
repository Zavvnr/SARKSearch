from __future__ import annotations

import json
import math
import re
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from .config import settings
from .knowledgebase import TOOLS as LOCAL_TOOLS
from .models import Tool

PRODUCT_HUNT_API_URL = "https://api.producthunt.com/v2/api/graphql"
TOKEN_PATTERN = re.compile(r"[a-z0-9][a-z0-9.+-]{1,}", re.IGNORECASE)
IGNORED_TAGS = {
    "about",
    "apps",
    "best",
    "build",
    "find",
    "first",
    "from",
    "help",
    "learn",
    "make",
    "more",
    "site",
    "sites",
    "start",
    "that",
    "tool",
    "tools",
    "with",
}


@dataclass(frozen=True)
class CatalogSnapshot:
    tools: list[Tool]
    source: str
    detail: str


def _slugify(value: str) -> str:
    return re.sub(r"-{2,}", "-", re.sub(r"[^a-z0-9]+", "-", value.lower())).strip("-") or "tool"


def _icon_for_name(name: str) -> str:
    pieces = [part[0] for part in name.split() if part]
    return ("".join(pieces[:2]) or name[:2] or "TL").upper()


def _tokens_from_text(*parts: str) -> list[str]:
    tokens: list[str] = []
    for part in parts:
        for token in TOKEN_PATTERN.findall(part.lower()):
            if len(token) < 3 or token in IGNORED_TAGS:
                continue
            tokens.append(token)
    return tokens


def _popularity_score(votes_count: int, reviews_count: int, rank: int | None) -> int:
    score = 48 + int(math.log1p(max(votes_count, 0)) * 10)
    if reviews_count > 0:
        score += min(reviews_count * 2, 10)
    if rank and rank > 0:
        score += max(0, 14 - min(rank, 14))
    return min(score, 100)


def _popularity_label(votes_count: int, reviews_count: int) -> str:
    if reviews_count > 0:
        return f"{votes_count} votes and {reviews_count} reviews on Product Hunt"
    return f"{votes_count} votes on Product Hunt"


def _derive_category(topic_names: Iterable[str]) -> str:
    names = [name for name in topic_names if name]
    if not names:
        return "Software / Discovery"
    return f"Software / {names[0].title()}"


def _starter_steps_for(name: str) -> list[str]:
    return [
        f"Open {name} and skim the main use cases before signing up.",
        "Start with the free plan, demo, or starter workflow if one is available.",
        "Try one small task tied to your goal before comparing alternatives.",
    ]


def _dedupe_tools(tools: Iterable[Tool]) -> list[Tool]:
    seen: set[str] = set()
    deduped: list[Tool] = []
    for tool in tools:
        key = tool.slug or _slugify(tool.name)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(tool)
    return deduped


def _build_tool_from_product_hunt_post(post: dict[str, Any]) -> Tool | None:
    name = str(post.get("name") or "").strip()
    website = str(post.get("website") or post.get("url") or "").strip()
    slug = str(post.get("slug") or _slugify(name)).strip()
    description = str(post.get("description") or post.get("tagline") or "").strip()
    if not name or not website or not description:
        return None

    topic_names = [
        str(item.get("name") or "").strip().lower()
        for item in (post.get("topics") or {}).get("nodes", [])
        if str(item.get("name") or "").strip()
    ]
    tags = sorted(set(_tokens_from_text(name, description, post.get("tagline") or "", *topic_names) + topic_names))
    votes_count = int(post.get("votesCount") or 0)
    reviews_count = int(post.get("reviewsCount") or 0)
    rank = post.get("dailyRank") or post.get("weeklyRank") or post.get("monthlyRank")

    return Tool(
        slug=slug,
        name=name,
        category=_derive_category(topic_names),
        popularity=_popularity_label(votes_count, reviews_count),
        popularity_score=_popularity_score(votes_count, reviews_count, rank if isinstance(rank, int) else None),
        description=description,
        tags=tags or ["software", "discovery"],
        url=website,
        icon=_icon_for_name(name),
        starter_steps=_starter_steps_for(name),
    )


def build_tools_from_product_hunt_posts(posts: Iterable[dict[str, Any]]) -> list[Tool]:
    tools = [_build_tool_from_product_hunt_post(post) for post in posts]
    return [tool for tool in tools if tool]


class ToolCatalog:
    def __init__(self) -> None:
        self._cached_snapshot: CatalogSnapshot | None = None
        self._expires_at = 0.0

    def get_snapshot(self) -> CatalogSnapshot:
        provider = settings.catalog_provider
        if provider != "product_hunt":
            return CatalogSnapshot(tools=list(LOCAL_TOOLS), source="local", detail="Using the bundled catalog.")

        now = time.time()
        if self._cached_snapshot and now < self._expires_at:
            return self._cached_snapshot

        snapshot = self._load_product_hunt_snapshot()
        self._cached_snapshot = snapshot
        self._expires_at = now + settings.catalog_cache_ttl_seconds
        return snapshot

    def get_tool_by_slug(self, slug: str) -> Tool | None:
        return next((tool for tool in self.get_snapshot().tools if tool.slug == slug), None)

    def _load_product_hunt_snapshot(self) -> CatalogSnapshot:
        if not settings.product_hunt_token:
            return CatalogSnapshot(
                tools=list(LOCAL_TOOLS),
                source="local",
                detail="PRODUCT_HUNT_TOKEN is missing, so the bundled catalog is being used.",
            )

        try:
            remote_tools = self._fetch_product_hunt_tools()
        except (HTTPError, URLError, TimeoutError, ValueError, OSError) as error:
            return CatalogSnapshot(
                tools=list(LOCAL_TOOLS),
                source="local-fallback",
                detail=f"Product Hunt catalog unavailable: {error}. Falling back to the bundled catalog.",
            )

        if not remote_tools:
            return CatalogSnapshot(
                tools=list(LOCAL_TOOLS),
                source="local-fallback",
                detail="Product Hunt returned no tools, so the bundled catalog is being used.",
            )

        if settings.catalog_include_local:
            merged_tools = _dedupe_tools([*LOCAL_TOOLS, *remote_tools])[: settings.catalog_max_items]
            return CatalogSnapshot(
                tools=merged_tools,
                source="product_hunt+local",
                detail=f"Merged {len(remote_tools)} Product Hunt tools with the bundled catalog.",
            )

        return CatalogSnapshot(
            tools=remote_tools[: settings.catalog_max_items],
            source="product_hunt",
            detail=f"Loaded {len(remote_tools[: settings.catalog_max_items])} tools from Product Hunt.",
        )

    def _fetch_product_hunt_tools(self) -> list[Tool]:
        resolved_topics = self._resolve_product_hunt_topics()
        if not resolved_topics:
            return []

        posted_after = (datetime.now(timezone.utc) - timedelta(days=settings.product_hunt_posted_after_days)).isoformat()
        posts_query = """
        query CatalogPosts($topic: String!, $first: Int!, $featured: Boolean!, $postedAfter: DateTime!) {
          posts(
            topic: $topic
            first: $first
            featured: $featured
            order: VOTES
            postedAfter: $postedAfter
          ) {
            nodes {
              name
              slug
              tagline
              description
              url
              website
              votesCount
              reviewsCount
              dailyRank
              weeklyRank
              monthlyRank
              topics(first: 6) {
                nodes {
                  name
                }
              }
            }
          }
        }
        """

        remote_posts: list[dict[str, Any]] = []
        seen_slugs: set[str] = set()
        for topic in resolved_topics:
            payload = self._product_hunt_request(
                posts_query,
                {
                    "topic": topic,
                    "first": settings.product_hunt_posts_per_topic,
                    "featured": settings.product_hunt_featured_only,
                    "postedAfter": posted_after,
                },
            )
            for post in payload.get("posts", {}).get("nodes", []):
                slug = str(post.get("slug") or "").strip()
                if not slug or slug in seen_slugs:
                    continue
                seen_slugs.add(slug)
                remote_posts.append(post)

        tools = build_tools_from_product_hunt_posts(remote_posts)
        tools.sort(key=lambda item: item.popularity_score, reverse=True)
        return tools[: settings.catalog_max_items]

    def _resolve_product_hunt_topics(self) -> list[str]:
        topic_queries = [
            part.strip()
            for part in settings.product_hunt_topics.split(",")
            if part.strip()
        ]
        if not topic_queries:
            return []

        query = """
        query ResolveTopics($query: String!) {
          topics(query: $query, first: 1) {
            nodes {
              slug
            }
          }
        }
        """

        slugs: list[str] = []
        seen: set[str] = set()
        for topic_query in topic_queries:
            payload = self._product_hunt_request(query, {"query": topic_query})
            topic_nodes = payload.get("topics", {}).get("nodes", [])
            slug = str(topic_nodes[0].get("slug") if topic_nodes else "").strip()
            if not slug or slug in seen:
                continue
            seen.add(slug)
            slugs.append(slug)
        return slugs

    def _product_hunt_request(self, query: str, variables: dict[str, Any]) -> dict[str, Any]:
        request = Request(
            PRODUCT_HUNT_API_URL,
            data=json.dumps({"query": query, "variables": variables}).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {settings.product_hunt_token}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            method="POST",
        )

        with urlopen(request, timeout=12) as response:
            payload = json.loads(response.read().decode("utf-8"))

        if payload.get("errors"):
            raise ValueError(payload["errors"][0].get("message") or "Product Hunt returned an error.")

        return payload.get("data", {})


tool_catalog = ToolCatalog()
