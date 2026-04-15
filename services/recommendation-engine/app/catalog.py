from __future__ import annotations

import json
import math
import re
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from .config import settings
from .knowledgebase import TOOLS as LOCAL_TOOLS
from .models import Tool

PRODUCT_HUNT_API_URL = "https://api.producthunt.com/v2/api/graphql"
COLLEGE_SCORECARD_API_URL = "https://api.data.gov/ed/collegescorecard/v1/schools"
CODEFORCES_API_URL = "https://codeforces.com/api/contest.list"
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
EDUCATION_TERMS = {
    "admissions",
    "associate",
    "bachelor",
    "bootcamp",
    "campus",
    "certificate",
    "college",
    "degree",
    "education",
    "enrollment",
    "financial",
    "major",
    "majors",
    "technical",
    "training",
    "transfer",
    "tuition",
    "university",
}
COMPETITION_TERMS = {
    "challenge",
    "competition",
    "competitions",
    "competitive",
    "contest",
    "contests",
    "hackathon",
    "hackathons",
    "olympiad",
}
PROGRAMMING_TERMS = {
    "algorithm",
    "algorithms",
    "coding",
    "code",
    "developer",
    "leetcode",
    "programming",
    "software",
}
US_STATE_CODES = {
    "alabama": "AL",
    "alaska": "AK",
    "arizona": "AZ",
    "arkansas": "AR",
    "california": "CA",
    "colorado": "CO",
    "connecticut": "CT",
    "delaware": "DE",
    "florida": "FL",
    "georgia": "GA",
    "hawaii": "HI",
    "idaho": "ID",
    "illinois": "IL",
    "indiana": "IN",
    "iowa": "IA",
    "kansas": "KS",
    "kentucky": "KY",
    "louisiana": "LA",
    "maine": "ME",
    "maryland": "MD",
    "massachusetts": "MA",
    "michigan": "MI",
    "minnesota": "MN",
    "mississippi": "MS",
    "missouri": "MO",
    "montana": "MT",
    "nebraska": "NE",
    "nevada": "NV",
    "new hampshire": "NH",
    "new jersey": "NJ",
    "new mexico": "NM",
    "new york": "NY",
    "north carolina": "NC",
    "north dakota": "ND",
    "ohio": "OH",
    "oklahoma": "OK",
    "oregon": "OR",
    "pennsylvania": "PA",
    "rhode island": "RI",
    "south carolina": "SC",
    "south dakota": "SD",
    "tennessee": "TN",
    "texas": "TX",
    "utah": "UT",
    "vermont": "VT",
    "virginia": "VA",
    "washington": "WA",
    "west virginia": "WV",
    "wisconsin": "WI",
    "wyoming": "WY",
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


def _tokens_from_query(query: str) -> set[str]:
    return set(_tokens_from_text(query))


def _normalize_url(value: str) -> str:
    normalized = str(value or "").strip()
    if not normalized:
        return ""
    if normalized.startswith(("http://", "https://")):
        return normalized
    return f"https://{normalized.lstrip('/')}"


def _looks_like_education_query(query: str) -> bool:
    tokens = _tokens_from_query(query)
    return bool(tokens.intersection(EDUCATION_TERMS))


def _looks_like_programming_competition_query(query: str) -> bool:
    lowered = query.lower()
    if "programming competition" in lowered or "competitive programming" in lowered:
        return True
    tokens = _tokens_from_query(query)
    has_competition = bool(tokens.intersection(COMPETITION_TERMS))
    has_programming = bool(tokens.intersection(PROGRAMMING_TERMS))
    return has_competition and has_programming


def _extract_state_code(query: str) -> str | None:
    lowered = query.lower()
    for state_name, state_code in US_STATE_CODES.items():
        if state_name in lowered:
            return state_code
    return None


def recommended_query_sources(query: str) -> list[str]:
    sources: list[str] = []
    if _looks_like_education_query(query):
        sources.append("college_scorecard")
    if _looks_like_programming_competition_query(query):
        sources.append("codeforces")
    return sources


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


def _student_popularity_label(student_size: int, state_code: str) -> str:
    if student_size > 0:
        return f"About {student_size:,} students in {state_code}"
    return f"School option in {state_code}"


def _student_popularity_score(student_size: int) -> int:
    return min(95, 54 + int(math.log1p(max(student_size, 0)) * 7))


def _format_tuition(value: object) -> str:
    try:
        tuition = int(float(value))
    except (TypeError, ValueError):
        return ""
    return f"${tuition:,} in-state tuition"


def _format_rate(value: object) -> str:
    try:
        rate = float(value)
    except (TypeError, ValueError):
        return ""
    if rate <= 0:
        return ""
    return f"{round(rate * 100)}% admit rate"


def _format_duration(duration_seconds: object) -> str:
    try:
        total_hours = int(float(duration_seconds) // 3600)
    except (TypeError, ValueError):
        return ""
    if total_hours <= 0:
        return ""
    return f"{total_hours}h duration"


def _format_start_time(epoch_seconds: object) -> str:
    try:
        timestamp = int(float(epoch_seconds))
    except (TypeError, ValueError):
        return ""
    return datetime.fromtimestamp(timestamp, timezone.utc).strftime("%b %d, %Y")


def _degree_label(value: object) -> str:
    mapping = {
        1: "certificate-focused",
        2: "associate degree",
        3: "bachelor's degree",
        4: "graduate degree",
    }
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return "degree-granting"
    return mapping.get(parsed, "degree-granting")


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


def _build_tool_from_college_scorecard_school(school: dict[str, Any]) -> Tool | None:
    name = str(school.get("school.name") or "").strip()
    state_code = str(school.get("school.state") or "").strip().upper()
    city = str(school.get("school.city") or "").strip()
    website = _normalize_url(school.get("school.school_url") or "")
    if not name or not state_code or not website:
        return None

    student_size = int(float(school.get("latest.student.size") or 0))
    tuition = _format_tuition(school.get("latest.cost.tuition.in_state"))
    admission_rate = _format_rate(school.get("latest.admissions.admission_rate.overall"))
    degree_label = _degree_label(school.get("school.degrees_awarded.predominant"))
    detail_parts = [f"{degree_label.title()} option in {city}, {state_code}" if city else f"{degree_label.title()} option in {state_code}"]
    if tuition:
        detail_parts.append(tuition)
    if admission_rate:
        detail_parts.append(admission_rate)

    tags = sorted(
        set(
            _tokens_from_text(name, city, state_code, degree_label, "education college university school admissions tuition")
            + ["education", "college", "school", "university", state_code.lower()]
        )
    )

    return Tool(
        slug=_slugify(name),
        name=name,
        category=f"Education / {state_code}",
        popularity=_student_popularity_label(student_size, state_code),
        popularity_score=_student_popularity_score(student_size),
        description=". ".join(part for part in detail_parts if part) + ".",
        tags=tags,
        url=website,
        icon=_icon_for_name(name),
        starter_steps=[
            "Open the admissions or academics page and compare the programs that match your goal.",
            "Check tuition, deadlines, and whether the school offers beginner-friendly advising or transfer options.",
            "Save two or three schools to compare before you apply.",
        ],
    )


def build_tools_from_college_scorecard_schools(schools: Iterable[dict[str, Any]]) -> list[Tool]:
    tools = [_build_tool_from_college_scorecard_school(school) for school in schools]
    return [tool for tool in tools if tool]


def _build_tool_from_codeforces_contest(contest: dict[str, Any]) -> Tool | None:
    contest_id = contest.get("id")
    name = str(contest.get("name") or "").strip()
    if not contest_id or not name:
        return None

    phase = str(contest.get("phase") or "").strip().upper()
    type_label = str(contest.get("type") or "programming").strip().lower()
    start_label = _format_start_time(contest.get("startTimeSeconds"))
    duration_label = _format_duration(contest.get("durationSeconds"))
    detail_parts = [f"Codeforces {type_label} contest"]
    if start_label:
        detail_parts.append(f"starts {start_label}")
    if duration_label:
        detail_parts.append(duration_label)

    phase_label = {
        "BEFORE": "Upcoming Codeforces contest",
        "CODING": "Live Codeforces contest",
    }.get(phase, "Codeforces programming contest")
    score = 86 if phase == "BEFORE" else 82 if phase == "CODING" else 74
    tags = sorted(
        set(
            _tokens_from_text(name, phase, type_label, "programming competition contest algorithms codeforces")
            + ["programming", "competition", "contest", "codeforces", "algorithms"]
        )
    )

    return Tool(
        slug=f"codeforces-{contest_id}",
        name=name,
        category="Programming Competition / Contest",
        popularity=phase_label,
        popularity_score=score,
        description=". ".join(part for part in detail_parts if part) + ".",
        tags=tags,
        url=f"https://codeforces.com/contest/{contest_id}",
        icon="CF",
        starter_steps=[
            "Open the contest page and read the timing, rules, and rating notes first.",
            "Create a Codeforces account or sign in before the contest starts.",
            "Warm up with one or two practice problems so the interface feels familiar.",
        ],
    )


def build_tools_from_codeforces_contests(contests: Iterable[dict[str, Any]]) -> list[Tool]:
    tools = [_build_tool_from_codeforces_contest(contest) for contest in contests]
    return [tool for tool in tools if tool]


class ToolCatalog:
    def __init__(self) -> None:
        self._cached_snapshot: CatalogSnapshot | None = None
        self._expires_at = 0.0

    def get_snapshot(self, query: str | None = None) -> CatalogSnapshot:
        base_snapshot = self._get_base_snapshot()
        if not query or not settings.query_aware_catalog:
            return base_snapshot

        query_tools, query_details = self._load_query_specific_tools(query)
        if not query_tools:
            return base_snapshot

        merged_tools = _dedupe_tools([*query_tools, *base_snapshot.tools])[: settings.catalog_max_items]
        source_parts = [part for part in [base_snapshot.source, *recommended_query_sources(query)] if part]
        detail = " ".join([base_snapshot.detail, *query_details]).strip()
        return CatalogSnapshot(
            tools=merged_tools,
            source="+".join(dict.fromkeys(source_parts)),
            detail=detail,
        )

    def _get_base_snapshot(self) -> CatalogSnapshot:
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

    def _load_query_specific_tools(self, query: str) -> tuple[list[Tool], list[str]]:
        tools: list[Tool] = []
        details: list[str] = []

        for source in recommended_query_sources(query):
            try:
                if source == "college_scorecard":
                    college_tools = self._load_college_scorecard_tools(query)
                    if college_tools:
                        tools.extend(college_tools)
                        details.append(f"Added {len(college_tools)} College Scorecard education matches.")
                elif source == "codeforces":
                    contest_tools = self._load_codeforces_tools()
                    if contest_tools:
                        tools.extend(contest_tools)
                        details.append(f"Added {len(contest_tools)} Codeforces competition matches.")
            except (HTTPError, URLError, TimeoutError, ValueError, OSError) as error:
                details.append(f"{source.replace('_', ' ').title()} was unavailable: {error}.")

        return tools, details

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

    def _load_college_scorecard_tools(self, query: str) -> list[Tool]:
        if not settings.college_scorecard_api_key:
            return []

        params = {
            "api_key": settings.college_scorecard_api_key,
            "fields": ",".join(
                [
                    "id",
                    "school.name",
                    "school.city",
                    "school.state",
                    "school.school_url",
                    "school.degrees_awarded.predominant",
                    "latest.student.size",
                    "latest.cost.tuition.in_state",
                    "latest.admissions.admission_rate.overall",
                ]
            ),
            "sort": "latest.student.size:desc",
            "per_page": settings.college_scorecard_per_page,
        }

        state_code = _extract_state_code(query)
        if state_code:
            params["school.state"] = state_code

        request = Request(
            f"{COLLEGE_SCORECARD_API_URL}?{urlencode(params)}",
            headers={"Accept": "application/json"},
            method="GET",
        )
        with urlopen(request, timeout=12) as response:
            payload = json.loads(response.read().decode("utf-8"))

        results = payload.get("results", [])
        return build_tools_from_college_scorecard_schools(results)

    def _load_codeforces_tools(self) -> list[Tool]:
        request = Request(
            f"{CODEFORCES_API_URL}?{urlencode({'gym': 'false'})}",
            headers={"Accept": "application/json"},
            method="GET",
        )
        with urlopen(request, timeout=12) as response:
            payload = json.loads(response.read().decode("utf-8"))

        if payload.get("status") != "OK":
            raise ValueError("Codeforces returned an error.")

        contests = payload.get("result", [])
        preferred_phases = {"BEFORE", "CODING"}
        filtered = [contest for contest in contests if str(contest.get("phase") or "").upper() in preferred_phases]
        if not filtered:
            filtered = contests[: settings.codeforces_contest_limit]
        return build_tools_from_codeforces_contests(filtered[: settings.codeforces_contest_limit])

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


class LLMBrainCatalog:
    """Compatibility shim for older imports.

    The active recommendation path no longer uses this module or any catalog
    provider. Callers should use OrchestratorAgent, which asks the LLM Brain for
    recommendation objects directly.
    """

    def get_snapshot(self, query: str | None = None) -> CatalogSnapshot:
        return CatalogSnapshot(
            tools=[],
            source="llm_brain",
            detail="Catalog providers are disabled; recommendations come from the LLM Brain.",
        )

    def get_tool_by_slug(self, slug: str) -> Tool | None:
        return None


tool_catalog = LLMBrainCatalog()
