from pathlib import Path
from unittest import TestCase
import sys

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.agent_runtime import OrchestratorAgent
from app.knowledgebase import TOOLS
from app.pdf_guides import build_starter_pdf


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
