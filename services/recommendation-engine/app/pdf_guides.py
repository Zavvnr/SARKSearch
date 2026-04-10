from __future__ import annotations

from io import BytesIO

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

from .models import Tool


def _wrap_to_width(pdf: canvas.Canvas, text: str, font_name: str, font_size: int, max_width: int) -> list[str]:
    words = text.split()
    if not words:
        return []

    lines: list[str] = []
    current = words[0]
    for word in words[1:]:
        candidate = f"{current} {word}"
        if pdf.stringWidth(candidate, font_name, font_size) <= max_width:
            current = candidate
        else:
            lines.append(current)
            current = word
    lines.append(current)
    return lines


def _draw_paragraph(
    pdf: canvas.Canvas,
    text: str,
    *,
    x: int,
    y: int,
    max_width: int,
    font_name: str = "Helvetica",
    font_size: int = 10,
    color: str = "#20352a",
    line_height: int = 14,
) -> int:
    pdf.setFont(font_name, font_size)
    pdf.setFillColor(HexColor(color))
    for line in _wrap_to_width(pdf, text, font_name, font_size, max_width):
        pdf.drawString(x, y, line)
        y -= line_height
    return y


def _draw_list(
    pdf: canvas.Canvas,
    items: list[str],
    *,
    x: int,
    y: int,
    max_width: int,
    numbered: bool = False,
) -> int:
    for index, item in enumerate(items, start=1):
        prefix = f"{index}. " if numbered else "- "
        wrapped_lines = _wrap_to_width(pdf, f"{prefix}{item}", "Helvetica", 10, max_width)
        for line in wrapped_lines:
            pdf.drawString(x, y, line)
            y -= 14
        y -= 6
    return y


def _draw_card(
    pdf: canvas.Canvas,
    *,
    x: int,
    top: int,
    width: int,
    height: int,
    title: str,
) -> int:
    pdf.setFillColor(HexColor("#ffffff"))
    pdf.setStrokeColor(HexColor("#d3e4d4"))
    pdf.roundRect(x, top - height, width, height, 16, stroke=1, fill=1)
    pdf.setFont("Helvetica-Bold", 12)
    pdf.setFillColor(HexColor("#2e7a56"))
    pdf.drawString(x + 16, top - 24, title)
    return top - 42


def _format_tag(tag: str) -> str:
    return tag.replace("-", " ").title()


def _best_for(tool: Tool) -> str:
    tags = [_format_tag(tag) for tag in tool.tags[:4]]
    return ", ".join(tags) if tags else tool.category


def _preparation_items(tool: Tool, query: str) -> list[str]:
    lowered_tags = set(tool.tags)
    items = [f"Decide on one very small outcome tied to {query.strip() or 'your goal'}."]

    if {"resume", "writing", "essay", "paper"}.intersection(lowered_tags):
        items.append("Bring your current draft, notes, or bullet points before you start editing.")
    elif {"research", "citations", "sources", "academic"}.intersection(lowered_tags):
        items.append("Keep 2 or 3 search phrases, source links, or questions ready to guide the session.")
    elif {"coding", "programming", "python", "developer"}.intersection(lowered_tags):
        items.append("Know the exact language, bug, or practice problem you want to focus on first.")
    elif {"organize", "tasks", "planning", "deadline", "calendar"}.intersection(lowered_tags):
        items.append("List your top priorities or deadlines so you can build around real work right away.")
    elif {"community", "friends", "events", "networking"}.intersection(lowered_tags):
        items.append("Choose one interest, topic, or type of group you want to explore first.")
    else:
        items.append("Gather the one file, topic, or question you will use during your first session.")

    items.append("Set a 15 to 20 minute timer so you focus on trying the tool instead of overthinking it.")
    return items


def _today_outcome(tool: Tool) -> str:
    lowered_tags = set(tool.tags)
    if {"resume", "portfolio", "writing"}.intersection(lowered_tags):
        return "A strong first session ends with a saved draft you can revise later, not a perfect final version."
    if {"research", "citations", "sources"}.intersection(lowered_tags):
        return "A strong first session ends with a short source list or note set you can build on tomorrow."
    if {"coding", "programming", "python"}.intersection(lowered_tags):
        return "A strong first session ends with one solved problem, one working script, or one clean repo update."
    if {"organize", "tasks", "planning"}.intersection(lowered_tags):
        return "A strong first session ends with one usable board, page, or schedule you can keep using tomorrow."
    if {"community", "friends", "networking", "events"}.intersection(lowered_tags):
        return "A strong first session ends with one community joined, one event saved, or one conversation started."
    return f"A strong first session with {tool.name} ends with one small result you can save, share, or revisit."


def _pitfall_note(tool: Tool) -> str:
    lowered_tags = set(tool.tags)
    if {"design", "resume", "portfolio"}.intersection(lowered_tags):
        return "Do not spend your whole session changing colors, fonts, or layout before your actual content is ready."
    if {"research", "sources", "academic"}.intersection(lowered_tags):
        return "Do not rely on summaries alone. Open the original source and save the useful parts as you go."
    if {"coding", "python", "programming"}.intersection(lowered_tags):
        return "Do not stay in tutorial mode too long. Read enough to start building or practicing immediately."
    if {"organize", "planning", "tasks"}.intersection(lowered_tags):
        return "Do not build a huge system on day one. One page or board is usually the right starting point."
    return "Do not compare too many tools at once. Use this one long enough to learn whether it actually fits."


def build_starter_pdf(tool: Tool, query: str) -> bytes:
    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=letter)
    width, height = letter

    pdf.setFillColor(HexColor("#f5faf4"))
    pdf.rect(0, 0, width, height, stroke=0, fill=1)
    pdf.setStrokeColor(HexColor("#d3e4d4"))
    pdf.line(42, height - 104, width - 42, height - 104)

    pdf.setFillColor(HexColor("#173227"))
    pdf.setFont("Helvetica-Bold", 24)
    pdf.drawString(42, height - 58, f"{tool.name} starter guide")

    pdf.setFont("Helvetica", 11)
    pdf.setFillColor(HexColor("#5a7266"))
    pdf.drawString(42, height - 78, f"SARKSearch recommendation for: {query}")
    pdf.drawString(42, height - 94, f"Category: {tool.category}")

    content_width = width - 84
    left_x = 42
    right_x = 318
    column_width = 252

    y = _draw_card(pdf, x=42, top=660, width=content_width, height=92, title="Quick snapshot")
    pdf.setFont("Helvetica-Bold", 10)
    pdf.setFillColor(HexColor("#173227"))
    pdf.drawString(58, y, "Popularity")
    pdf.drawString(222, y, "Best for")
    pdf.drawString(406, y, "Official link")

    pdf.setFont("Helvetica", 10)
    pdf.setFillColor(HexColor("#20352a"))
    pdf.drawString(58, y - 18, tool.popularity)
    pdf.drawString(222, y - 18, _best_for(tool))
    link_text = tool.url.replace("https://", "").replace("http://", "")
    pdf.drawString(406, y - 18, link_text[:23])
    pdf.linkURL(tool.url, (406, y - 24, 528, y - 8), relative=0)

    y = _draw_card(pdf, x=left_x, top=548, width=column_width, height=138, title="Why this tool fits")
    y = _draw_paragraph(
        pdf,
        tool.description,
        x=left_x + 16,
        y=y,
        max_width=column_width - 32,
        font_size=10,
        line_height=14,
    )
    y -= 4
    pdf.setFont("Helvetica-Bold", 10)
    pdf.setFillColor(HexColor("#173227"))
    pdf.drawString(left_x + 16, y, "Strong first use cases")
    _draw_paragraph(
        pdf,
        _best_for(tool),
        x=left_x + 16,
        y=y - 16,
        max_width=column_width - 32,
        font_size=10,
        line_height=14,
    )

    y = _draw_card(pdf, x=right_x, top=548, width=column_width, height=138, title="Before you open it")
    pdf.setFillColor(HexColor("#20352a"))
    pdf.setFont("Helvetica", 10)
    _draw_list(
        pdf,
        _preparation_items(tool, query),
        x=right_x + 16,
        y=y,
        max_width=column_width - 32,
    )

    y = _draw_card(pdf, x=42, top=392, width=content_width, height=162, title="First 20 minutes")
    pdf.setFillColor(HexColor("#20352a"))
    pdf.setFont("Helvetica", 10)
    _draw_list(
        pdf,
        tool.starter_steps,
        x=58,
        y=y,
        max_width=content_width - 32,
        numbered=True,
    )

    y = _draw_card(pdf, x=left_x, top=212, width=column_width, height=104, title="Good outcome today")
    _draw_paragraph(
        pdf,
        _today_outcome(tool),
        x=left_x + 16,
        y=y,
        max_width=column_width - 32,
        font_size=10,
        line_height=15,
    )

    y = _draw_card(pdf, x=right_x, top=212, width=column_width, height=104, title="Avoid this common mistake")
    _draw_paragraph(
        pdf,
        _pitfall_note(tool),
        x=right_x + 16,
        y=y,
        max_width=column_width - 32,
        font_size=10,
        line_height=15,
    )

    pdf.setFillColor(HexColor("#5a7266"))
    pdf.setFont("Helvetica", 10)
    pdf.drawString(42, 34, "Open the tool and save one useful result before you leave your first session.")
    pdf.showPage()
    pdf.save()

    return buffer.getvalue()
