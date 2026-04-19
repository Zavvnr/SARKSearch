from __future__ import annotations

from dataclasses import dataclass
from html import escape as html_escape
from io import BytesIO
from xml.sax.saxutils import escape as xml_escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from .models import Recommendation, Tool

GuideRecommendation = Tool | Recommendation


@dataclass(frozen=True)
class GuideContent:
    tool_name: str
    query: str
    category: str
    popularity: str
    best_for: str
    url: str
    description: str
    preparation_items: list[str]
    starter_steps: list[str]
    today_outcome: str
    pitfall_note: str
    understanding_checklist: list[str]


def _format_tag(tag: str) -> str:
    return tag.replace("-", " ").title()


def _tags_for(tool: GuideRecommendation) -> list[str]:
    existing_tags = getattr(tool, "tags", None)
    if existing_tags:
        return list(existing_tags)

    words = f"{tool.name} {tool.category} {tool.description}".lower().replace("/", " ").split()
    cleaned = ["".join(char for char in word if char.isalnum()) for word in words]
    return [word for word in cleaned if len(word) > 2][:8]


def _starter_steps_for(tool: GuideRecommendation) -> list[str]:
    existing_steps = getattr(tool, "starter_steps", None)
    if existing_steps:
        return list(existing_steps)

    starter_tip = getattr(tool, "starterTip", "")
    return [
        starter_tip or f"Open {tool.name} and look for the beginner or getting-started path.",
        "Use one small task from your original goal instead of exploring every feature.",
        "Save the useful result, link, or next step before leaving your first session.",
    ]


def _best_for(tool: GuideRecommendation) -> str:
    tags = [_format_tag(tag) for tag in _tags_for(tool)[:4]]
    return ", ".join(tags) if tags else tool.category


def _preparation_items(tool: GuideRecommendation, query: str) -> list[str]:
    lowered_tags = set(_tags_for(tool))
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


def _today_outcome(tool: GuideRecommendation) -> str:
    lowered_tags = set(_tags_for(tool))
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


def _pitfall_note(tool: GuideRecommendation) -> str:
    lowered_tags = set(_tags_for(tool))
    if {"design", "resume", "portfolio"}.intersection(lowered_tags):
        return "Do not spend your whole session changing colors, fonts, or layout before your actual content is ready."
    if {"research", "sources", "academic"}.intersection(lowered_tags):
        return "Do not rely on summaries alone. Open the original source and save the useful parts as you go."
    if {"coding", "python", "programming"}.intersection(lowered_tags):
        return "Do not stay in tutorial mode too long. Read enough to start building or practicing immediately."
    if {"organize", "planning", "tasks"}.intersection(lowered_tags):
        return "Do not build a huge system on day one. One page or board is usually the right starting point."
    return "Do not compare too many tools at once. Use this one long enough to learn whether it actually fits."


def _understanding_checklist(tool: GuideRecommendation) -> list[str]:
    return [
        f"Open {tool.name}'s official site and write down the main problem it solves.",
        "Find the account, pricing, or free-plan requirements before committing time.",
        "Locate the help center, docs, examples, templates, or getting-started page.",
        "Run one starter step from this guide and save the result or link.",
        "Write down what felt useful, confusing, or unnecessary after 15 to 20 minutes.",
        "Decide whether to keep using it, compare one alternative, or stop for now.",
    ]


def build_guide_content(tool: GuideRecommendation, query: str) -> GuideContent:
    return GuideContent(
        tool_name=tool.name,
        query=query.strip() or "your goal",
        category=tool.category,
        popularity=tool.popularity,
        best_for=_best_for(tool),
        url=tool.url,
        description=tool.description,
        preparation_items=_preparation_items(tool, query),
        starter_steps=_starter_steps_for(tool),
        today_outcome=_today_outcome(tool),
        pitfall_note=_pitfall_note(tool),
        understanding_checklist=_understanding_checklist(tool),
    )


def _plain_url(url: str) -> str:
    return url.replace("https://", "").replace("http://", "").rstrip("/")


def _pdf_styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "GuideTitle",
            parent=base["Title"],
            fontName="Helvetica-Bold",
            fontSize=24,
            leading=29,
            alignment=0,
            textColor=colors.HexColor("#173227"),
            spaceAfter=6,
        ),
        "meta": ParagraphStyle(
            "GuideMeta",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=10,
            leading=14,
            textColor=colors.HexColor("#5a7266"),
            spaceAfter=4,
        ),
        "sectionTitle": ParagraphStyle(
            "GuideSectionTitle",
            parent=base["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=13,
            leading=16,
            textColor=colors.HexColor("#2e7a56"),
            spaceBefore=0,
            spaceAfter=7,
        ),
        "body": ParagraphStyle(
            "GuideBody",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=10,
            leading=15,
            textColor=colors.HexColor("#20352a"),
            spaceAfter=5,
        ),
        "smallBold": ParagraphStyle(
            "GuideSmallBold",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=9,
            leading=12,
            textColor=colors.HexColor("#173227"),
        ),
        "footer": ParagraphStyle(
            "GuideFooter",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=9,
            leading=12,
            textColor=colors.HexColor("#5a7266"),
        ),
    }


def _p(text: str, style: ParagraphStyle) -> Paragraph:
    return Paragraph(xml_escape(text), style)


def _link(url: str, style: ParagraphStyle) -> Paragraph:
    escaped_url = xml_escape(url, {'"': "&quot;"})
    label = xml_escape(_plain_url(url))
    return Paragraph(f'<link href="{escaped_url}">{label}</link>', style)


def _list_items(items: list[str], style: ParagraphStyle, numbered: bool = False) -> list[Paragraph]:
    paragraphs = []
    for index, item in enumerate(items, start=1):
        prefix = f"{index}. " if numbered else "- "
        paragraphs.append(_p(f"{prefix}{item}", style))
    return paragraphs


def _card(title: str, flowables: list[object], styles: dict[str, ParagraphStyle], width: float) -> Table:
    content = [_p(title, styles["sectionTitle"]), *flowables]
    table = Table([[content]], colWidths=[width])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.white),
                ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#d3e4d4")),
                ("LEFTPADDING", (0, 0), (-1, -1), 14),
                ("RIGHTPADDING", (0, 0), (-1, -1), 14),
                ("TOPPADDING", (0, 0), (-1, -1), 12),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ]
        )
    )
    return table


def build_starter_pdf(tool: GuideRecommendation, query: str) -> bytes:
    content = build_guide_content(tool, query)
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        leftMargin=42,
        rightMargin=42,
        topMargin=42,
        bottomMargin=42,
    )
    styles = _pdf_styles()
    content_width = letter[0] - 84

    quick_snapshot = Table(
        [
            [
                _p("Popularity", styles["smallBold"]),
                _p("Best for", styles["smallBold"]),
                _p("Official link", styles["smallBold"]),
            ],
            [
                _p(content.popularity, styles["body"]),
                _p(content.best_for, styles["body"]),
                _link(content.url, styles["body"]),
            ],
        ],
        colWidths=[1.35 * inch, 2.65 * inch, content_width - (4 * inch)],
        hAlign="LEFT",
    )
    quick_snapshot.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eef7ef")),
                ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#d3e4d4")),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d3e4d4")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ]
        )
    )

    story: list[object] = [
        _p(f"{content.tool_name} starter guide", styles["title"]),
        _p(f"SARKSearch recommendation for: {content.query}", styles["meta"]),
        _p(f"Category: {content.category}", styles["meta"]),
        Spacer(1, 12),
        quick_snapshot,
        Spacer(1, 12),
        _card("Why this tool fits", [_p(content.description, styles["body"])], styles, content_width),
        Spacer(1, 10),
        _card("Before you open it", _list_items(content.preparation_items, styles["body"]), styles, content_width),
        Spacer(1, 10),
        _card("First 20 minutes", _list_items(content.starter_steps, styles["body"], numbered=True), styles, content_width),
        Spacer(1, 10),
        _card("Good outcome today", [_p(content.today_outcome, styles["body"])], styles, content_width),
        Spacer(1, 10),
        _card("Avoid this common mistake", [_p(content.pitfall_note, styles["body"])], styles, content_width),
        Spacer(1, 10),
        _card(
            "Checklist for understanding the application",
            _list_items(content.understanding_checklist, styles["body"]),
            styles,
            content_width,
        ),
        Spacer(1, 12),
        _p("Open the tool and save one useful result before you leave your first session.", styles["footer"]),
    ]

    doc.build(story)
    return buffer.getvalue()


def _html_list(items: list[str], ordered: bool = False) -> str:
    tag = "ol" if ordered else "ul"
    entries = "".join(f"<li>{html_escape(item)}</li>" for item in items)
    return f"<{tag}>{entries}</{tag}>"


def build_starter_document_html(tool: GuideRecommendation, query: str) -> str:
    content = build_guide_content(tool, query)
    title = f"{content.tool_name} starter guide"
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>{html_escape(title)}</title>
  <style>
    body {{
      color: #173227;
      font-family: Arial, Helvetica, sans-serif;
      line-height: 1.55;
      margin: 48px;
    }}
    h1 {{
      font-size: 28px;
      margin: 0 0 8px;
    }}
    h2 {{
      color: #2e7a56;
      font-size: 17px;
      margin: 24px 0 8px;
    }}
    p {{
      margin: 0 0 10px;
    }}
    table {{
      border-collapse: collapse;
      margin: 18px 0;
      width: 100%;
    }}
    th, td {{
      border: 1px solid #d3e4d4;
      padding: 10px;
      text-align: left;
      vertical-align: top;
    }}
    th {{
      background: #eef7ef;
    }}
    ul, ol {{
      margin-top: 8px;
      padding-left: 24px;
    }}
    .meta {{
      color: #5a7266;
      margin-bottom: 4px;
    }}
  </style>
</head>
<body>
  <h1>{html_escape(title)}</h1>
  <p class="meta">SARKSearch recommendation for: {html_escape(content.query)}</p>
  <p class="meta">Category: {html_escape(content.category)}</p>

  <h2>Quick snapshot</h2>
  <table>
    <tr>
      <th>Popularity</th>
      <th>Best for</th>
      <th>Official link</th>
    </tr>
    <tr>
      <td>{html_escape(content.popularity)}</td>
      <td>{html_escape(content.best_for)}</td>
      <td><a href="{html_escape(content.url, quote=True)}">{html_escape(_plain_url(content.url))}</a></td>
    </tr>
  </table>

  <h2>Why this tool fits</h2>
  <p>{html_escape(content.description)}</p>

  <h2>Before you open it</h2>
  {_html_list(content.preparation_items)}

  <h2>First 20 minutes</h2>
  {_html_list(content.starter_steps, ordered=True)}

  <h2>Good outcome today</h2>
  <p>{html_escape(content.today_outcome)}</p>

  <h2>Avoid this common mistake</h2>
  <p>{html_escape(content.pitfall_note)}</p>

  <h2>Checklist for understanding the application</h2>
  {_html_list(content.understanding_checklist)}
</body>
</html>
"""
