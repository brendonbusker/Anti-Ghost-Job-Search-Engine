# Anti-Ghost Job Search Engine

This repository builds a web-first anti-ghost-job search product. The product is not trying to become a generic job board or a LinkedIn clone. Its purpose is to help job seekers avoid wasting time on fake, stale, duplicate, reposted, scam-adjacent, and low-value job listings.

## Product priorities

1. Trust over quantity.
2. Explainability over black-box scoring.
3. Official source over third-party mirrors.
4. History over one-time snapshots.
5. MVP discipline over feature sprawl.

## Codex working rules

- Before starting work, decide which repository skill or skills apply and use them.
- Before starting work, read `AGENTS.md` and `docs/status.md`.
- Keep AGENTS guidance small and stable; put specialized workflows in skills.
- Treat every major feature as one of: MVP, post-MVP, or avoid.
- Prefer a webapp-first architecture. Browser extension work is post-MVP unless explicitly requested.
- Prefer TypeScript, Next.js, Tailwind, PostgreSQL, and Prisma or Drizzle unless a clearly better alternative is justified.
- Preserve raw source data, normalized data, canonical job entities, snapshots, and score explanations from day one.
- Prefer public, first-party, and structured job sources. Do not make brittle or policy-risky scraping a foundational dependency.
- When making architecture decisions, optimize for: explainability, data quality, auditability, testability, and future scoring improvement.
- Do not overengineer V1, but do not choose shortcuts that destroy the raw/canonical/history model.
- When you propose or build something, say briefly why it belongs in MVP, post-MVP, or avoid.

## Status file workflow

- `docs/status.md` is the repo-level context handoff file.
- At the start of work, read `docs/status.md` before acting.
- When a new phase begins, write or refresh a concise status summary in `docs/status.md` with:
  - what is completed
  - key architecture decisions
  - open questions
  - next recommended steps
- When a phase meaningfully advances or completes, refresh `docs/status.md` so a new thread can resume from files instead of chat memory.
- Stay focused on the current phase after updating `docs/status.md`.

## Product truths

This product should help users answer:
- Is this job real?
- Is this job fresh?
- Is this job likely still active?
- Is this the official source?
- Is this worth applying to right now?

The most valuable long-term asset is a job-listing history graph and strong trust/freshness scoring, not simply a large count of aggregated jobs.

## Source strategy defaults

Priority order:
1. Public ATS/job-board feeds and official company career pages.
2. Structured job pages and official source resolution.
3. Supplemental references from other public pages where appropriate.
4. Anything brittle or policy-risky only if explicitly approved and not foundational.

## UX defaults

The product should feel:
- serious
- fast
- dense but readable
- trustworthy
- utility-first
- not gimmicky

Every badge shown to the user must have a clear meaning.

## Required repository skills

Use these skills when relevant:
- jobs-data-model
- job-ingestion-pipeline
- job-dedup-canonicalization
- job-trust-scoring
- job-staleness-scoring
- job-search-ui
- ranking-evaluation
- browser-extension-overlay

If a task matches a skill, use the skill instead of improvising from scratch.
