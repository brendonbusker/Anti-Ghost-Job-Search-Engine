# MVP Build Plan

## Phase 0: Foundation (`MVP`)

Goal: create the minimum structure that keeps the product honest and extensible.

Build:

- workspace repo with `apps/web`, `packages/domain`, and `packages/database`
- initial Prisma schema for raw listings, canonical jobs, snapshots, scores, and user save flows
- shared domain contracts for labels, filters, and canonical job shapes
- serious webapp shell that already reflects trust/freshness/official-source product language

Why this is `MVP`:

- it reduces rework later
- it preserves the core moat model from day one
- it does not add end-user feature bloat

## Phase 1: Structured Ingestion Baseline (`MVP`)

Goal: get high-quality public data into the raw layer safely.

Build:

- source registry
- Greenhouse adapter
- Lever adapter
- Ashby adapter
- source fetch logs and parse outcomes
- first-seen / last-seen handling
- activity checks

Why this is `MVP`:

- without trustworthy ingestion, the product has no edge

Legal/platform note:

- prefer public feeds and official job publication surfaces
- avoid brittle scraping as a foundation

## Phase 2: Canonicalization (`MVP`)

Goal: turn many noisy source rows into one defensible job entity.

Build:

- normalization helpers
- candidate-match generation
- hard-match rules for IDs and official URLs
- fuzzy merge rules with explicit thresholds
- canonical-source selection
- cluster confidence and merge rationale persistence

Why this is `MVP`:

- duplicate suppression and official-source selection are core product value, not polish

## Phase 3: Trust and Freshness Scoring (`MVP`)

Goal: help users decide what is real enough and current enough to apply to.

Build:

- heuristic-first trust scorer
- heuristic-first freshness scorer
- explainable reasons and flags
- user-facing labels
- score snapshots with model versioning

Why this is `MVP`:

- this is the product wedge

## Phase 4: Search Experience (`MVP`)

Goal: make the intelligence usable in a real job-search session.

Build:

- search endpoint or route handler
- keyword/company/location/remote filters
- trust/freshness/official-source filters
- result cards with reasons
- canonical detail page with source history and official apply link

Why this is `MVP`:

- scoring has no value if it is not easy to scan and act on

## Phase 5: Save and Review Workflows (`MVP`)

Goal: let users keep track of worthwhile opportunities and let the team inspect quality.

Build:

- authentication
- saved jobs
- lightweight saved searches
- lightweight internal review pages for raw listings and clusters

Why this is `MVP`:

- saved jobs are user value
- internal review keeps trust and dedupe quality from drifting

## Phase 6: Evaluation Loop (`Post-MVP` but prepare early)

Build:

- labeled review sets
- score calibration workflows
- dedupe error review
- ranking quality dashboards

Why this is `Post-MVP`:

- it strengthens the moat, but the product can launch before the full evaluation loop is polished

## Phase 7: Browser Extension (`Post-MVP`)

Build:

- page detection
- official-source resolution from third-party pages
- overlay badges and warnings
- save-to-dashboard shortcut

Why this is `Post-MVP`:

- valuable wedge expansion, but not the foundation

## Explicit Avoid List

- `Avoid` resume builder features in V1
- `Avoid` AI cover letter generation as a primary workflow
- `Avoid` mass-apply automation
- `Avoid` fragile scraping as the core dependency
- `Avoid` social/network feed features
