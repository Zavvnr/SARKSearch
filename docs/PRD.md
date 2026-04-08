# Product Requirements Document

## Product

SARKSearch is a beginner-first discovery engine that converts plain-English goals into a curated shortlist of software tools, websites, and starter actions.

## Problem

Beginners often know their goal but not the name of the tool, category, or workflow that can help them start.

## Primary users

- Students who need help getting started
- Job seekers building resumes, portfolios, or networks
- Beginners learning coding, research, design, or productivity workflows
- People exploring communities, competitions, or practical online tools

## Core goals

- Accept natural-language intent without requiring jargon
- Return the most relevant and popular tools first
- Explain why each tool fits the prompt
- Give a clear first step for each recommendation
- Keep the interface simple and welcoming

## MVP scope

- Search box with plain-English query support
- Guided prompt pills
- Hardcoded knowledgebase of 30 to 50 tools
- Ranking by relevance plus popularity
- Top 5 results with show-more
- One-page starter PDF guide per tool
- Multi-agent pipeline with visible trace
- Optional MongoDB persistence

## Non-goals for this version

- Full internet scraping
- User authentication
- Personalized accounts
- Live LLM dependency for core functionality

## User stories

- As a beginner, I can describe my goal naturally and still get useful recommendations.
- As a job seeker, I can find resume and networking tools without knowing their names.
- As a first-time user, I can open a starter PDF and immediately know what to do next.
- As a curious user, I can inspect the agent trace and understand how the app reasoned about my request.
