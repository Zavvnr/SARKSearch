from __future__ import annotations

from io import BytesIO
from textwrap import wrap

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

from .models import Tool


def build_starter_pdf(tool: Tool, query: str) -> bytes:
    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=letter)
    width, height = letter

    pdf.setFillColor(HexColor("#08111f"))
    pdf.rect(0, 0, width, height, stroke=0, fill=1)
    pdf.setFillColor(HexColor("#f2eadf"))

    pdf.setFont("Helvetica-Bold", 22)
    pdf.drawString(48, height - 64, f"{tool.name} starter guide")

    pdf.setFont("Helvetica", 11)
    pdf.setFillColor(HexColor("#d0c7bb"))
    pdf.drawString(48, height - 88, f"SARKSearch recommendation for: {query}")
    pdf.drawString(48, height - 106, f"Category: {tool.category}")
    pdf.drawString(48, height - 124, f"Popularity signal: {tool.popularity}")

    pdf.setFillColor(HexColor("#f6c76f"))
    pdf.setFont("Helvetica-Bold", 13)
    pdf.drawString(48, height - 168, "Why this tool fits")

    pdf.setFillColor(HexColor("#f2eadf"))
    pdf.setFont("Helvetica", 11)
    y_position = height - 188
    for line in wrap(tool.description, width=82):
        pdf.drawString(48, y_position, line)
        y_position -= 16

    y_position -= 10
    pdf.setFillColor(HexColor("#f6c76f"))
    pdf.setFont("Helvetica-Bold", 13)
    pdf.drawString(48, y_position, "How to start")
    y_position -= 20

    pdf.setFillColor(HexColor("#f2eadf"))
    pdf.setFont("Helvetica", 11)
    for index, step in enumerate(tool.starter_steps, start=1):
        for line in wrap(f"{index}. {step}", width=84):
            pdf.drawString(54, y_position, line)
            y_position -= 16
        y_position -= 6

    pdf.setFillColor(HexColor("#d0c7bb"))
    pdf.drawString(48, 56, f"Open the tool: {tool.url}")
    pdf.showPage()
    pdf.save()

    return buffer.getvalue()
