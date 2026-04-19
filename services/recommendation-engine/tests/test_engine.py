from pathlib import Path
from unittest import TestCase
import os
import sys
import time

sys.path.append(str(Path(__file__).resolve().parents[1]))
TEST_TEMP_ROOT = Path(__file__).resolve().parents[1] / ".tmp-tests"
os.environ.setdefault("SARKSEARCH_RECOMMENDATION_ENV_PATH", str(TEST_TEMP_ROOT / "missing.env"))

"""
Legacy catalog tests kept as non-executable history. The active test suite below
verifies the LLM Brain path and ensures no supplied local catalog is used.

from app.agent_runtime import OrchestratorAgent
from app.catalog import (
    build_tools_from_codeforces_contests,
    build_tools_from_college_scorecard_schools,
    build_tools_from_product_hunt_posts,
    recommended_query_sources,
)
from app.knowledgebase import TOOLS
from app.models import Tool
from app.pdf_guides import build_starter_pdf


class StubDiscoveryRuntime:
    enabled = True
    mode = "gpt-4o-mini"

    def generate_json(self, *, instructions: str, input_text: str):
        return None

    def discover_popular_tools(self, *, query: str, limit: int, current_recommendations):
        return {
            "summary": "Pulled fresher matches from the live web for a low-confidence query.",
            "results": [
                {
                    "name": "Miro",
                    "category": "Collaboration / Whiteboarding",
                    "popularity": "Popular web match",
                    "description": "Online whiteboards for brainstorming, mapping ideas, and team planning.",
                    "url": "https://miro.com/",
                    "relevance_reason": "Strong fit for open-ended brainstorming and idea capture.",
                    "starter_tip": "Open a blank board and sketch your first three ideas in one workspace.",
                },
                {
                    "name": "Whimsical",
                    "category": "Collaboration / Diagrams",
                    "popularity": "Popular web match",
                    "description": "A visual workspace for flowcharts, wireframes, and mind maps.",
                    "url": "https://whimsical.com/",
                    "relevance_reason": "Useful when the goal is still fuzzy and you need structure fast.",
                    "starter_tip": "Start with a mind map so you can sort the main branches of your idea.",
                },
            ],
            "_model": "gpt-4o-mini",
        }


class RecommendationEngineTests(TestCase):
    def test_catalog_contains_40_tools(self) -> None:
        self.assertEqual(len(TOOLS), 40)

    def test_resume_query_returns_expected_tools(self) -> None:
        results, _trace, orchestration = OrchestratorAgent().run("I need a resume but I have no design skills", 5)
        names = [item.name for item in results]
        self.assertEqual(names[0], "Canva")
        self.assertIn("LinkedIn", names[:3])
        self.assertEqual(orchestration.mode, "heuristic")
        self.assertEqual(len(orchestration.milestones), 4)

    def test_pdf_generation_returns_bytes(self) -> None:
        pdf_bytes = build_starter_pdf(TOOLS[0], "build a resume")
        self.assertGreater(len(pdf_bytes), 500)

    def test_product_hunt_posts_can_map_into_tools(self) -> None:
        tools = build_tools_from_product_hunt_posts(
            [
                {
                    "name": "FocusFlow",
                    "slug": "focusflow",
                    "tagline": "Calm task planning for students",
                    "description": "A lightweight planning app for classes, routines, and deadlines.",
                    "website": "https://focusflow.example.com",
                    "votesCount": 420,
                    "reviewsCount": 8,
                    "dailyRank": 4,
                    "topics": {"nodes": [{"name": "Productivity"}, {"name": "Education"}]},
                }
            ]
        )

        self.assertEqual(len(tools), 1)
        self.assertEqual(tools[0].slug, "focusflow")
        self.assertIn("productivity", tools[0].tags)
        self.assertEqual(tools[0].category, "Software / Productivity")

    def test_college_scorecard_schools_can_map_into_tools(self) -> None:
        tools = build_tools_from_college_scorecard_schools(
            [
                {
                    "school.name": "Madison Area Technical College",
                    "school.city": "Madison",
                    "school.state": "WI",
                    "school.school_url": "madisoncollege.edu",
                    "school.degrees_awarded.predominant": 2,
                    "latest.student.size": 14200,
                    "latest.cost.tuition.in_state": 5400,
                    "latest.admissions.admission_rate.overall": 0.88,
                }
            ]
        )

        self.assertEqual(len(tools), 1)
        self.assertEqual(tools[0].category, "Education / WI")
        self.assertEqual(tools[0].url, "https://madisoncollege.edu")
        self.assertIn("education", tools[0].tags)

    def test_codeforces_contests_can_map_into_tools(self) -> None:
        tools = build_tools_from_codeforces_contests(
            [
                {
                    "id": 2050,
                    "name": "Codeforces Round 2050",
                    "phase": "BEFORE",
                    "type": "CF",
                    "durationSeconds": 9000,
                    "startTimeSeconds": 1770000000,
                }
            ]
        )

        self.assertEqual(len(tools), 1)
        self.assertEqual(tools[0].slug, "codeforces-2050")
        self.assertEqual(tools[0].category, "Programming Competition / Contest")
        self.assertIn("codeforces.com/contest/2050", tools[0].url)

    def test_query_routing_detects_specialized_sources(self) -> None:
        self.assertEqual(recommended_query_sources("How should I obtain education in Wisconsin?"), ["college_scorecard"])
        self.assertEqual(
            recommended_query_sources("Where should I go to find programming competition?"),
            ["codeforces"],
        )
        self.assertEqual(recommended_query_sources("I want to learn Python from scratch"), [])

    def test_low_confidence_queries_can_use_live_web_discovery(self) -> None:
        sparse_catalog = [
            Tool(
                slug="calendar-basic",
                name="Calendar Basic",
                category="Productivity",
                popularity="Small catalog match",
                popularity_score=14,
                description="A simple calendar.",
                tags=["calendar", "planning"],
                url="https://calendar.example.com",
                icon="CB",
                starter_steps=["Create your first event."],
            ),
            Tool(
                slug="todo-basic",
                name="Todo Basic",
                category="Productivity",
                popularity="Small catalog match",
                popularity_score=12,
                description="A simple task list.",
                tags=["tasks", "planning"],
                url="https://todo.example.com",
                icon="TB",
                starter_steps=["Add your first task."],
            ),
        ]

        results, trace, orchestration = OrchestratorAgent(runtime=StubDiscoveryRuntime()).run(
            "I need help exploring brainstorming apps for a vague project idea",
            3,
            sparse_catalog,
        )

        self.assertEqual(results[0].name, "Miro")
        self.assertTrue(any(item.agent == "WebDiscoveryAgent" for item in trace))
        self.assertEqual(orchestration.mode, "gpt-4o-mini")
"""

from fastapi import HTTPException

import app.main as main_module
from app.agent_runtime import OrchestratorAgent, _build_llm_brain_recommendations, build_summary
from app.config import ACTIVE_ENV_KEYS, DEFAULT_OPENAI_MODEL, Settings, _load_env_file, _normalize_openai_model
from app.llm_runtime import OptionalLLMRuntime, _json_mode_input
from app.models import ExcludedRecommendation, Recommendation, Tool
from app.models import NetworkRequest, SearchRequest
from app.pdf_guides import build_starter_document_html, build_starter_pdf


LLM_RESULT = {
    "slug": "chatgpt",
    "name": "ChatGPT",
    "category": "AI / Assistant",
    "popularity": "Widely adopted AI assistant",
    "description": "Conversational AI assistant for brainstorming, drafting, learning, and planning.",
    "url": "https://chatgpt.com/",
    "icon": "AI",
    "relevance_reason": "The LLM Brain selected it as a broad, beginner-friendly starting point.",
    "starter_tip": "Ask for a short checklist, then use the answer to take one practical next step.",
}


def read_env_example_values(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    return values


class StubLLMBrainRuntime:
    enabled = True
    mode = "gpt-4o-mini"
    model = "gpt-4o-mini"

    def generate_json(self, *, instructions: str, input_text: str):
        if "SpecificationAgent" in instructions:
            return {
                "keywords": ["resume", "career"],
                "expanded_keywords": ["resume", "career", "job"],
                "needs": ["career"],
                "assumptions": ["The user wants beginner-friendly options."],
                "missing_requirements": [],
            }
        if "ArchitectureAgent" in instructions:
            return {
                "categories": ["AI / Assistant", "Career / Planning"],
                "service_boundaries": ["FastAPI asks the LLM Brain for recommendation objects."],
                "architecture_notes": ["No curated app catalog is used for ranking."],
            }
        if "EvaluationAgent" in instructions:
            return {"should_retry": False, "detail": "The LLM Brain returned a usable shortlist."}
        if "OrchestratorAgent" in instructions:
            return {"detail": "Coordinated the LLM Brain recommendation flow."}
        return None

    def recommend_tools(self, *, query: str, limit: int, excluded_results=None):
        return {
            "summary": "The LLM Brain selected mainstream starting points.",
            "confidence": 0.88,
            "results": [LLM_RESULT],
        }

    def recommend_tool_for_guide(self, *, slug: str, query: str):
        return {"result": {**LLM_RESULT, "slug": slug}}


class CountingLLMBrainRuntime(StubLLMBrainRuntime):
    def __init__(self) -> None:
        self.generate_json_calls = 0
        self.recommend_tools_calls = 0

    def generate_json(self, *, instructions: str, input_text: str):
        self.generate_json_calls += 1
        return super().generate_json(instructions=instructions, input_text=input_text)

    def recommend_tools(self, *, query: str, limit: int, excluded_results=None):
        self.recommend_tools_calls += 1
        return super().recommend_tools(query=query, limit=limit, excluded_results=excluded_results)


class SlowLLMBrainRuntime(StubLLMBrainRuntime):
    def __init__(self, delay_seconds: float = 0.03) -> None:
        self.delay_seconds = delay_seconds

    def recommend_tools(self, *, query: str, limit: int, excluded_results=None):
        time.sleep(self.delay_seconds)
        return super().recommend_tools(query=query, limit=limit, excluded_results=excluded_results)


class ReplacementLLMBrainRuntime(StubLLMBrainRuntime):
    def __init__(self) -> None:
        self.recommend_tools_calls = 0

    def recommend_tools(self, *, query: str, limit: int, excluded_results=None):
        self.recommend_tools_calls += 1
        if self.recommend_tools_calls == 1:
            return {
                "summary": "The LLM Brain tried one existing result and one fresh result.",
                "confidence": 0.82,
                "results": [
                    LLM_RESULT,
                    {
                        "slug": "github",
                        "name": "GitHub",
                        "category": "Developer / Collaboration",
                        "popularity": "Widely used developer platform",
                        "description": "Code hosting, collaboration, issues, and project discovery.",
                        "url": "https://github.com/",
                        "icon": "GH",
                        "relevance_reason": "Useful for discovering examples and organizing technical work.",
                        "starter_tip": "Create one repository or save one relevant example project.",
                    },
                ],
            }

        return {
            "summary": "The LLM Brain replaced excluded matches with a distinct result.",
            "confidence": 0.8,
            "results": [
                {
                    "slug": "notion",
                    "name": "Notion",
                    "category": "Productivity / Notes",
                    "popularity": "Popular workspace app",
                    "description": "Flexible workspace for notes, tasks, databases, and planning.",
                    "url": "https://www.notion.com/",
                    "icon": "NO",
                    "relevance_reason": "Helpful for keeping next steps and resources in one place.",
                    "starter_tip": "Start one page for the goal and add your first three tasks.",
                }
            ],
        }


class ManyResultsLLMBrainRuntime(StubLLMBrainRuntime):
    def recommend_tools(self, *, query: str, limit: int, excluded_results=None):
        return {
            "summary": "The LLM Brain selected a broad application network.",
            "confidence": 0.9,
            "results": [
                {
                    "slug": f"tool-{index}",
                    "name": f"Tool {index}",
                    "category": "Software / Discovery",
                    "popularity": "Network match",
                    "description": f"Tool {index} helps beginners compare useful applications.",
                    "url": f"https://tool-{index}.example.com/",
                    "icon": "TL",
                    "relevance_reason": "Relevant to the user's requested application network.",
                    "starter_tip": "Open the official site and try one small task.",
                }
                for index in range(1, limit + 1)
            ],
        }


class DisabledLLMRuntime:
    enabled = False
    mode = "llm-brain-unavailable"

    def generate_json(self, *, instructions: str, input_text: str):
        return None

    def recommend_tools(self, *, query: str, limit: int, excluded_results=None):
        return None

    def recommend_tool_for_guide(self, *, slug: str, query: str):
        return None


class BadRequestLLMRuntime(DisabledLLMRuntime):
    enabled = True
    mode = "gpt-4o-mini"

    def status_detail(self):
        return "The last LLM Brain request failed: BadRequestError: invalid request body."


class FakeResponsesClient:
    def __init__(self) -> None:
        self.requests = []

    def create(self, **request):
        self.requests.append(request)

        class Response:
            output_text = '{"ok": true}'

        return Response()


class FakeOpenAIClient:
    def __init__(self) -> None:
        self.responses = FakeResponsesClient()


class LLMBrainRecommendationEngineTests(TestCase):
    def test_json_mode_input_contains_required_json_marker(self) -> None:
        wrapped = _json_mode_input('{"query": "resume help"}')

        self.assertIn("JSON", wrapped)
        self.assertIn("resume help", wrapped)

    def test_openai_json_request_wraps_plain_payload_with_json_marker(self) -> None:
        runtime = OptionalLLMRuntime.__new__(OptionalLLMRuntime)
        runtime.client = FakeOpenAIClient()
        runtime.model = "gpt-4o-mini"

        result = runtime._create_json_response(
            instructions="Return strict JSON.",
            input_text='{"query": "resume help"}',
        )

        self.assertEqual(result, {"ok": True})
        sent_input = runtime.client.responses.requests[0]["input"]
        self.assertIn("JSON", sent_input)
        self.assertIn("resume help", sent_input)

    def test_model_normalization_prefers_smaller_default_model(self) -> None:
        self.assertEqual(_normalize_openai_model(""), DEFAULT_OPENAI_MODEL)
        self.assertEqual(_normalize_openai_model("gpt-5.4"), DEFAULT_OPENAI_MODEL)
        self.assertEqual(_normalize_openai_model("gpt-4.1"), DEFAULT_OPENAI_MODEL)
        self.assertEqual(_normalize_openai_model("gpt-4o-mini"), DEFAULT_OPENAI_MODEL)

    def test_recommendation_engine_env_example_matches_active_config_contract(self) -> None:
        values = read_env_example_values(Path(__file__).resolve().parents[1] / ".env.example")
        settings = Settings(environ=values)

        self.assertEqual(set(values), set(ACTIVE_ENV_KEYS))
        self.assertEqual(settings.app_name, "SARKSearch Recommendation Engine")
        self.assertEqual(settings.host, "127.0.0.1")
        self.assertEqual(settings.port, 8000)
        self.assertEqual(settings.default_search_limit, 5)
        self.assertEqual(settings.max_search_limit, 20)
        self.assertEqual(settings.openai_model, DEFAULT_OPENAI_MODEL)

    def test_recommendation_engine_env_file_is_loaded_and_used_by_settings(self) -> None:
        TEST_TEMP_ROOT.mkdir(exist_ok=True)
        env_path = TEST_TEMP_ROOT / "recommendation-engine.fixture.env"
        env_path.write_text(
            "\n".join(
                [
                    "RECOMMENDATION_ENGINE_NAME='Test Recommendation Engine'",
                    "RECOMMENDATION_ENGINE_HOST=0.0.0.0",
                    "RECOMMENDATION_ENGINE_PORT=8123",
                    "DEFAULT_SEARCH_LIMIT=6",
                    "MAX_SEARCH_LIMIT=9",
                    "OPENAI_API_KEY=test-key-from-temp-env",
                    "OPENAI_MODEL=gpt-4.1",
                    "",
                ]
            ),
            encoding="utf-8",
        )
        environ: dict[str, str] = {}

        _load_env_file(env_path, environ)
        settings = Settings(environ=environ)

        self.assertEqual(settings.app_name, "Test Recommendation Engine")
        self.assertEqual(settings.host, "0.0.0.0")
        self.assertEqual(settings.port, 8123)
        self.assertEqual(settings.default_search_limit, 6)
        self.assertEqual(settings.max_search_limit, 9)
        self.assertEqual(settings.openai_api_key, "test-key-from-temp-env")
        self.assertEqual(settings.openai_model, "gpt-4o-mini")

    def test_recommendation_engine_env_loader_does_not_override_existing_values(self) -> None:
        TEST_TEMP_ROOT.mkdir(exist_ok=True)
        env_path = TEST_TEMP_ROOT / "recommendation-engine-existing-values.fixture.env"
        env_path.write_text("OPENAI_MODEL=gpt-4.1\nOPENAI_API_KEY=file-value\n", encoding="utf-8")
        environ = {
            "OPENAI_MODEL": "gpt-4o-mini",
            "OPENAI_API_KEY": "existing-value",
        }

        _load_env_file(env_path, environ)

        self.assertEqual(environ["OPENAI_MODEL"], "gpt-4o-mini")
        self.assertEqual(environ["OPENAI_API_KEY"], "existing-value")

    def test_orchestrator_uses_llm_brain_recommendations(self) -> None:
        results, trace, orchestration = OrchestratorAgent(runtime=StubLLMBrainRuntime()).run(
            "I need a resume but I have no design skills",
            5,
        )

        self.assertEqual(results[0].name, "ChatGPT")
        self.assertTrue(any(item.agent == "LLMBrainAgent" for item in trace))
        self.assertEqual(orchestration.mode, "gpt-4o-mini")
        self.assertEqual(orchestration.milestones[2].owner, "LLMBrainAgent")

    def test_search_pipeline_uses_one_llm_brain_recommendation_call(self) -> None:
        runtime = CountingLLMBrainRuntime()

        results, _trace, _orchestration = OrchestratorAgent(runtime=runtime).run(
            "I want to get a job, but I don't know where to start",
            5,
        )

        self.assertEqual(results[0].name, "ChatGPT")
        self.assertEqual(runtime.recommend_tools_calls, 1)
        self.assertEqual(runtime.generate_json_calls, 0)

    def test_search_more_filters_existing_results_and_replaces_duplicates(self) -> None:
        runtime = ReplacementLLMBrainRuntime()

        results, trace, _orchestration = OrchestratorAgent(runtime=runtime).run(
            "I need tools for my first software project",
            2,
            excluded_results=[
                ExcludedRecommendation(
                    slug="chatgpt",
                    name="ChatGPT",
                    url="https://chatgpt.com/",
                )
            ],
        )
        brain_trace = next(item for item in trace if item.agent == "LLMBrainAgent")

        self.assertEqual([item.name for item in results], ["GitHub", "Notion"])
        self.assertEqual(runtime.recommend_tools_calls, 2)
        self.assertIn("avoiding 1 existing results", brain_trace.detail)

    def test_search_timing_identifies_slow_llm_brain_stage(self) -> None:
        results, trace, orchestration = OrchestratorAgent(runtime=SlowLLMBrainRuntime()).run(
            "I want to get a job, but I don't know where to start",
            5,
        )
        timings = {item.stage: item.durationMs for item in orchestration.timings}
        brain_trace = next(item for item in trace if item.agent == "LLMBrainAgent")

        self.assertEqual(results[0].name, "ChatGPT")
        self.assertGreaterEqual(timings["LLMBrainAgent"], 20)
        self.assertGreaterEqual(brain_trace.durationMs, 20)
        self.assertGreaterEqual(orchestration.totalDurationMs, timings["LLMBrainAgent"])
        self.assertGreater(timings["LLMBrainAgent"], timings["SpecificationAgent"])

    def test_supplied_catalog_is_ignored(self) -> None:
        fake_catalog = [
            Tool(
                slug="fake-local-tool",
                name="Fake Local Tool",
                category="Made Up",
                popularity="Not real",
                popularity_score=100,
                description="This should never be used.",
                tags=["resume"],
                url="https://example.com/",
                icon="FT",
                starter_steps=["Do not use this."],
            )
        ]

        results, _trace, _orchestration = OrchestratorAgent(runtime=StubLLMBrainRuntime()).run(
            "I need a resume but I have no design skills",
            5,
            fake_catalog,
        )

        self.assertEqual([item.name for item in results], ["ChatGPT"])

    def test_missing_llm_runtime_does_not_fall_back_to_local_database(self) -> None:
        results, trace, orchestration = OrchestratorAgent(runtime=DisabledLLMRuntime()).run(
            "I need a resume but I have no design skills",
            5,
        )

        self.assertEqual(results, [])
        self.assertTrue(any(item.agent == "LLMBrainAgent" and item.status == "blocked" for item in trace))
        self.assertEqual(orchestration.mode, "llm-brain-unavailable")
        self.assertIn("LLM Brain did not return", build_summary("resume help", results))

    def test_llm_brain_trace_includes_bad_request_details(self) -> None:
        _results, trace, _orchestration = OrchestratorAgent(runtime=BadRequestLLMRuntime()).run(
            "I need resume help",
            5,
        )

        brain_trace = next(item for item in trace if item.agent == "LLMBrainAgent")
        self.assertEqual(brain_trace.status, "blocked")
        self.assertIn("BadRequestError", brain_trace.detail)

    def test_fastapi_search_returns_503_when_llm_brain_is_unavailable(self) -> None:
        original_orchestrator = main_module.orchestrator
        main_module.orchestrator = OrchestratorAgent(runtime=DisabledLLMRuntime())

        try:
            with self.assertRaises(HTTPException) as error:
                main_module.search_tools(SearchRequest(query="I need a resume but I have no design skills", limit=5))
        finally:
            main_module.orchestrator = original_orchestrator

        self.assertEqual(error.exception.status_code, 503)
        self.assertEqual(error.exception.detail["knowledgebase"], "LLM Brain")
        self.assertEqual(error.exception.detail["agentMode"], "llm-brain-unavailable")

    def test_pdf_generation_from_llm_recommendation_returns_bytes(self) -> None:
        recommendation = Recommendation(
            slug="chatgpt",
            name="ChatGPT",
            category="AI / Assistant",
            popularity="Widely adopted AI assistant",
            description="Conversational AI assistant for brainstorming, drafting, learning, and planning.",
            url="https://chatgpt.com/",
            icon="AI",
            relevanceReason="The LLM Brain selected it as a beginner-friendly starting point.",
            starterTip="Ask for a checklist, then act on the first step.",
        )

        pdf_bytes = build_starter_pdf(recommendation, "build a resume")
        self.assertGreater(len(pdf_bytes), 500)

    def test_starter_document_includes_pdf_content_and_checklist(self) -> None:
        recommendation = Recommendation(
            slug="chatgpt",
            name="ChatGPT",
            category="AI / Assistant",
            popularity="Widely adopted AI assistant",
            description="Conversational AI assistant for brainstorming, drafting, learning, and planning.",
            url="https://chatgpt.com/",
            icon="AI",
            relevanceReason="The LLM Brain selected it as a beginner-friendly starting point.",
            starterTip="Ask for a checklist, then act on the first step.",
        )

        document_html = build_starter_document_html(recommendation, "build a resume")

        self.assertIn("Quick snapshot", document_html)
        self.assertIn("First 20 minutes", document_html)
        self.assertIn("Checklist for understanding the application", document_html)
        self.assertIn("ChatGPT", document_html)

    def test_fastapi_network_search_returns_50_recommendations(self) -> None:
        original_orchestrator = main_module.orchestrator
        main_module.orchestrator = OrchestratorAgent(runtime=ManyResultsLLMBrainRuntime())

        try:
            response = main_module.search_application_network(
                NetworkRequest(query="show me a network of learning applications", limit=50)
            )
        finally:
            main_module.orchestrator = original_orchestrator

        self.assertEqual(len(response.results), 50)
        self.assertEqual(response.results[0].name, "Tool 1")

    def test_guide_lookup_can_rehydrate_from_llm_brain(self) -> None:
        orchestrator = OrchestratorAgent(runtime=StubLLMBrainRuntime())
        recommendation = orchestrator.get_recommendation_for_guide("chatgpt", "build a resume")

        self.assertIsNotNone(recommendation)
        self.assertEqual(recommendation.name, "ChatGPT")

    def test_llm_brain_parser_accepts_realistic_field_variants(self) -> None:
        recommendations = _build_llm_brain_recommendations(
            [
                {
                    "title": "freeCodeCamp",
                    "type": "Coding / Learning",
                    "adoption": "Popular beginner coding curriculum",
                    "summary": "A free coding curriculum with guided lessons and projects.",
                    "officialUrl": "freecodecamp.org",
                    "relevanceReason": "Strong fit for beginner programming practice.",
                    "starterTip": "Start with the first responsive web design lesson.",
                }
            ],
            5,
        )

        self.assertEqual(len(recommendations), 1)
        self.assertEqual(recommendations[0].name, "freeCodeCamp")
        self.assertEqual(recommendations[0].url, "https://freecodecamp.org")
        self.assertEqual(recommendations[0].relevanceReason, "Strong fit for beginner programming practice.")

    def test_llm_brain_parser_filters_unusable_recommendations(self) -> None:
        recommendations = _build_llm_brain_recommendations(
            [
                {
                    "name": "Unknown Tool",
                    "description": "No official link, so this should not become a recommendation.",
                    "url": "",
                },
                {
                    "name": "GitHub",
                    "description": "Code hosting and collaboration platform.",
                    "url": "https://github.com/",
                },
            ],
            5,
        )

        self.assertEqual([item.name for item in recommendations], ["GitHub"])
