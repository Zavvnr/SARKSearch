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
- GPT-5.4 LLM Brain as the recommendation knowledgebase
- Structured recommendation results with relevance explanations
- Top 5 results with search-more expansion up to 20 fresh results
- Prompt-centered application network with up to 50 nearby apps and sites
- Google Docs-compatible starter guide per tool
- Multi-agent pipeline with visible trace
- Optional MongoDB persistence

## Non-goals for this version

- Full internet scraping
- User authentication
- Personalized accounts
- A made-up local tool database
- External catalog APIs for MVP recommendation coverage

## User stories

- As a beginner, I can describe my goal naturally and still get useful recommendations.
- As a job seeker, I can find resume and networking tools without knowing their names.
- As a first-time user, I can open a starter document and immediately know what to do next.
- As a curious user, I can inspect the agent trace and understand how the app reasoned about my request.
