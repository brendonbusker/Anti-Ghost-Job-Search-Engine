# Anti-Ghost Job Search Engine

An AI-powered anti-ghost-job search engine focused on helping job seekers avoid wasting time on fake, stale, duplicated, reposted, low-confidence, and non-official job listings.

## What This Project Is

This product is a webapp-first search and intelligence layer for job seekers.

It is designed to:

- aggregate jobs from structured, trustworthy public sources
- deduplicate listings into canonical job records
- resolve the official application source whenever possible
- score listings for trust, freshness, and user priority
- explain why a listing is worth applying to, questionable, or not worth the time

This project does not aim to be the biggest job board.
It aims to be the most useful quality filter.

## Core Product Thesis

Job seekers waste large amounts of time on:

- fake listings
- stale listings
- reposted listings
- duplicate listings
- jobs that are no longer truly hiring
- listings that do not route to the real official source
- scam-adjacent postings
- noisy low-quality search results from broad job platforms

The product should help users answer:

1. Is this job real?
2. Is this job fresh?
3. Is this job likely still open?
4. Is this the official source?
5. Is this worth applying to right now?

## Product Principles

- Trust over quantity
- Explainability over black-box AI
- Official source first
- Probability, not certainty
- Build a wedge, not a giant platform on day one

## Working Preferences

- Do not overcomplicate V1
- Be practical and startup-minded
- Prefer webapp-first decisions
- Keep architecture clean but not bloated
- Call out legal or platform-risky dependencies if they arise
- Prefer structured public sources and official sources over fragile scraping
- Build for explainability from day one
- Whenever proposing a feature, label it as `MVP`, `Post-MVP`, or `Avoid`

## MVP Focus

V1 should stay tightly focused on:

- search
- filtering
- canonical job pages
- trust, freshness, and priority scoring
- score explanations
- official-source resolution
- saved jobs

Saved searches and alerts should be designed for early, but kept lightweight in the first release.

## Data and System Priorities

When making technical decisions, prioritize:

1. ingestion quality
2. data model quality
3. canonicalization quality
4. trust and freshness scoring quality
5. search UX
6. saved jobs and alerts
7. browser extension later

## Source Strategy

Prefer:

1. structured ATS and public feeds
2. official company career pages
3. structured job metadata extraction
4. third-party aggregators only as supplemental references where safe and useful

Do not build the MVP around brittle or policy-risky scraping dependencies.

## Documentation

- Product brief: [docs/PRODUCT_BRIEF.md](./docs/PRODUCT_BRIEF.md)
- Repo structure: [docs/architecture/REPO_STRUCTURE.md](./docs/architecture/REPO_STRUCTURE.md)
- MVP build plan: [docs/architecture/MVP_BUILD_PLAN.md](./docs/architecture/MVP_BUILD_PLAN.md)
- Data model foundation: [docs/architecture/DATA_MODEL_FOUNDATION.md](./docs/architecture/DATA_MODEL_FOUNDATION.md)

## Initial Stack Direction

Default stack:

- Next.js
- TypeScript
- TailwindCSS
- PostgreSQL
- Prisma or Drizzle
- Redis if background jobs or caching require it

## Foundation Commands

- `npm install`
- `npm run dev`
- `npm run lint`
- `npm run typecheck`
- `npm run db:generate`

## Scheduled Alert Refresh

The monitored-search `MVP` now supports automatic due-alert refresh through the internal route:

- `GET /api/internal/alerts/run`
- `POST /api/internal/alerts/run`

Authentication:

- local/manual runs can use `ANTI_GHOST_ALERT_RUN_SECRET`
- Vercel cron runs can use `CRON_SECRET`
- setting both to the same value is the simplest deployment path

Scheduler behavior:

- the route runs every configured invocation, but the app itself decides which alerts are actually due
- the bundled Vercel cron config runs the route hourly at `0 * * * *`
- cadence-specific alert logic still lives in app code, so a single hourly cron is enough for the current daily and weekly `MVP` schedules

Deployment notes:

- if the Vercel project root is the repo root, use [vercel.json](./vercel.json)
- if the Vercel project root is `apps/web`, use [apps/web/vercel.json](./apps/web/vercel.json)

## Decision Filter

For product and engineering decisions, ask:

- Does this improve trust?
- Does this reduce wasted applications?
- Does this strengthen the scoring and history moat?
- Is this appropriate for MVP?
- Is this safer than a fragile shortcut?
- Is this explainable to users?
