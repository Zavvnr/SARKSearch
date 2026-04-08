from pathlib import Path
from unittest import TestCase
import sys

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.agents import OrchestratorAgent
from app.knowledgebase import TOOLS
from app.pdf_guides import build_starter_pdf


class RecommendationEngineTests(TestCase):
    def test_resume_query_returns_expected_tools(self) -> None:
        results, _trace = OrchestratorAgent().run("I need a resume but I have no design skills", 5)
        names = [item.name for item in results]
        self.assertEqual(names[0], "Canva")
        self.assertIn("LinkedIn", names[:3])

    def test_pdf_generation_returns_bytes(self) -> None:
        pdf_bytes = build_starter_pdf(TOOLS[0], "build a resume")
        self.assertGreater(len(pdf_bytes), 500)
