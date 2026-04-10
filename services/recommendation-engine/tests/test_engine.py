from pathlib import Path
from unittest import TestCase
import sys

sys.path.append(str(Path(__file__).resolve().parents[1]))

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
    mode = "gpt-5.4"

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
            "_model": "gpt-5.4",
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
        self.assertEqual(orchestration.mode, "gpt-5.4")
