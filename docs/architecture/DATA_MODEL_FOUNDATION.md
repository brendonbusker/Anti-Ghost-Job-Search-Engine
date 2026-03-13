# Data Model Foundation

## Schema Recommendation

The schema should support the question:

How do we preserve raw source evidence, build canonical job entities, track listing history over time, and persist explainable trust/freshness outputs for search and saved-job workflows?

The recommended V1 model is:

- `companies`
- `sources`
- `raw_job_listings`
- `canonical_jobs`
- `canonical_job_sources`
- `job_snapshots`
- `job_scores`
- `users`
- `saved_jobs`
- `saved_searches`
- `alerts`

This keeps raw data, canonical entities, time-series history, and user-specific state separate.

## Migration Plan

1. Create the base enums and core tables in one initial migration.
2. Generate the Prisma client from the initial schema.
3. Ship ingestion adapters against the raw/source tables first.
4. Add canonicalization jobs against `canonical_jobs` and `canonical_job_sources`.
5. Add score production against `job_scores` and `job_snapshots`.
6. Backfill snapshots and scores as heuristics evolve instead of rewriting history in place.

## Rationale Tied To Product Behavior

- `raw_job_listings` preserves the evidence needed to explain where a job came from.
- `canonical_jobs` gives the user one record per job instead of a wall of duplicates.
- `canonical_job_sources` preserves lineage and supports official-source precedence.
- `job_snapshots` allows the product to say first seen, last seen, still active, disappeared, or reposted.
- `job_scores` stores labels plus reasons and flags, so every badge can be explained.
- `saved_jobs`, `saved_searches`, and `alerts` support the earliest user workflows without locking the app into a recruiter-style architecture.

## Important Indexes

Key indexes in the initial schema should support:

- source lookups by `(source_id, external_job_id)`
- canonical job filtering by company, remote type, status, and recency
- latest score lookup by `(canonical_job_id, scored_at)`
- snapshot lookup by `(canonical_job_id, snapshot_at)`
- saved job uniqueness by `(user_id, canonical_job_id)`

## Representative Query Path

Example search path:

1. query `canonical_jobs`
2. join latest `job_scores`
3. filter by title/company/location/remote type and labels
4. return the canonical job summary with labels and short explanation text
5. fetch `canonical_job_sources` and `job_snapshots` on the detail page for richer evidence

## Backfill And Compatibility Notes

- There is no historical backfill burden yet because this is the first schema.
- Future schema changes should prefer additive migrations and backfills over destructive rewrites.
- Do not remove raw fields just because canonical or scored fields exist.
- Do not treat score recalculation as a reason to mutate old score rows; append new score snapshots instead.
