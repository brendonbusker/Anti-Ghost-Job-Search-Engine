---
name: job-search-ui
description: Use this skill when designing or implementing the web search experience for the anti-ghost-job product, including filters, result cards, detail pages, scoring badges, explanations, save-job flows, and dense utility-first layouts. Do not use for schema design, ingestion adapters, or ranking formulas unless the UI work directly depends on them.
---

# job-search-ui

Design the interface so users can decide quickly whether a job is worth opening and worth applying to.

## Product role

The UI is not just a pretty wrapper around data. It is the decision surface for:
- trust
- freshness
- priority
- official-source routing
- time-saving prioritization

## UX principles

- serious, not gimmicky
- dense but readable
- modern and calm
- explanation-rich without being verbose
- optimized for job-search sessions on desktop
- fast to scan

## Core list view requirements

Each result card should usually include:
- title
- company
- location
- remote/hybrid/on-site
- salary if available
- official-source status
- trust label
- freshness label
- optional priority label
- one-line reason summary
- save action

The card should answer:
- Is this real enough?
- Is it fresh enough?
- Is it worth opening now?

## Core detail page requirements

Show:
- canonical job summary
- official apply link
- where else the listing was seen
- trust score and reasons
- freshness score and reasons
- priority label
- red flags if any
- listing history if available
- save/job notes actions

## Filter and sort defaults

Support:
- keyword
- title
- company
- location
- remote type
- salary range if available
- trust label
- freshness label
- official-source-only
- sort by relevance or priority

## Presentation rules

- Every badge needs hover or detail-page explanation.
- Do not surface raw score numbers unless they help and are interpretable.
- Prefer labels plus evidence over unexplained numbers.
- Use color sparingly and semantically.
- Do not overwhelm list cards with too many icons or status pills.
- Use clear language such as "Official source found" instead of vague AI terms.

## Engineering expectations

- Build reusable result-card and explanation components.
- Keep state and URL filters shareable.
- Design for future saved searches and alerts.
- Handle missing salary and missing location gracefully.
- Prefer accessible, keyboard-friendly interactions.

## Guardrails

- Do not make the interface playful at the expense of trust.
- Do not bury the official apply link.
- Do not show a badge that cannot be explained.
- Do not turn the detail page into an essay.
- Do not let scoring labels dominate title/company readability.

## Deliverables

When using this skill, provide:
1. component structure
2. page/route plan
3. badge and explanation UX
4. state/filter model
5. example result-card and detail-page behaviors
