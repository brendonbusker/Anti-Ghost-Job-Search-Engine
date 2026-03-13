# Repo Structure

## Recommendation

Use a small workspace-based repo that keeps the webapp, shared product contracts, and database model separate without prematurely splitting into many services.

This structure is:

- `MVP` for `apps/web`
- `MVP` for `packages/domain`
- `MVP` for `packages/database`
- `Post-MVP` for separate ingestion/scoring packages once those modules become large enough to deserve isolation
- `Avoid` creating many microservices in V1

## Ideal V1 Layout

```text
.
|-- AGENTS.md
|-- docs/
|   `-- architecture/
|       |-- DATA_MODEL_FOUNDATION.md
|       |-- MVP_BUILD_PLAN.md
|       `-- REPO_STRUCTURE.md
|-- apps/
|   `-- web/
|       |-- src/app/
|       |-- src/components/
|       `-- src/lib/
|-- packages/
|   |-- database/
|   |   |-- prisma/
|   |   `-- src/
|   `-- domain/
|       `-- src/
|-- package.json
`-- tsconfig.base.json
```

## What Lives Where

### `apps/web` (`MVP`)

Own the user-facing product:

- search UI
- result cards
- detail pages
- saved jobs flows
- route handlers and server actions for web-facing features

Keep web concerns here instead of mixing them into ingestion or scoring modules.

### `packages/domain` (`MVP`)

Own product-level contracts shared across web, ingestion, scoring, and evaluation:

- enums
- search filter types
- canonical job view models
- validation schemas

This keeps the product language consistent as the app grows.

### `packages/database` (`MVP`)

Own persistence and database concerns:

- Prisma schema
- Prisma client
- DB-oriented types and helpers

This package should preserve the raw/canonical/history split from day one.

## Planned Expansion

Add these only when the work justifies the extra surface area:

### `packages/ingestion` (`MVP`, next phase)

Create when the first real adapters land:

- Greenhouse
- Lever
- Ashby
- official careers page connectors

### `packages/scoring` (`MVP`, after ingestion baseline)

Create when trust/freshness heuristics become real code instead of notes:

- trust scoring rules
- staleness scoring rules
- priority composition
- reasons and flags builders

### `apps/admin` (`Post-MVP`)

Add only when internal review needs enough UI to justify a dedicated surface:

- raw listing inspection
- cluster review
- score-debug views

## What To Avoid In V1

- `Avoid` splitting the worker, API, search, and scoring logic into separate deployables before the product proves the workflow
- `Avoid` creating a browser extension package before the webapp foundation is stable
- `Avoid` putting raw, canonical, and score logic directly inside UI components
