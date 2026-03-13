---
name: job-ingestion-pipeline
description: Use this skill when building or changing source adapters, crawlers, fetchers, parsers, normalization pipelines, scheduling, retry logic, source precedence, official-source resolution, or activity checks for public job listings. Trigger for Greenhouse, Lever, Ashby, official company career pages, structured job pages, and similar public sources. Do not use for trust/freshness scoring logic, UI layout, or browser extension overlays unless ingestion behavior is the main work.
---

# job-ingestion-pipeline

Build a safe, auditable ingestion system that favors official and structured sources over brittle scraping.

## Product intent

This product does not need every job on the internet in V1. It needs high-quality, explainable, public job data that can later support trust and staleness scoring.

## V1 source priority

Prefer this order:

1. Public ATS/job board feeds
   - Greenhouse public job board data
   - Lever public postings
   - Ashby public job postings
2. Official company career pages
3. Structured job pages with machine-readable job metadata
4. Supplemental public references only if useful and safe

## Source-specific operating assumptions

- Prefer public and clearly intended job-publication surfaces.
- When a source offers a "published jobs" or "listed only" mode, use it.
- Preserve source-specific identifiers such as requisition IDs whenever available.
- Preserve the raw payload or parsed page body for audit and reprocessing.

## Required ingestion outputs

Each adapter should emit a normalized record with at least:
- source identity
- external job ID if available
- URL
- title
- company
- location
- remote type
- employment type
- salary if available
- posted date if available
- description body
- first seen timestamp
- last seen timestamp
- raw payload
- activity status
- parse confidence

## Workflow

1. Identify whether the source is:
   - API/feed
   - official careers page
   - structured job page
   - low-confidence supplemental page

2. Build a source adapter contract with:
   - fetch
   - parse
   - normalize
   - validate
   - persist
   - activity check

3. Preserve source metadata:
   - source type
   - fetch timestamp
   - status code or retrieval state
   - canonicalizable IDs
   - page/body hash

4. Prefer official-source resolution early:
   - if a listing originates from a third-party page, attempt to identify the official company/ATS source
   - if an official source is found, store that relationship explicitly

5. Update lifecycle fields carefully:
   - first_seen_at should be stable
   - last_seen_at should update when observed again
   - is_active should reflect current evidence, not guesses
   - do not mark "filled" unless there is direct evidence

6. Make reprocessing easy:
   - adapter output should be deterministic
   - normalization should be idempotent
   - raw payload should allow reparsing as logic improves

## Required engineering behaviors

- Use retry logic and rate limiting.
- Make parsers tolerant of incomplete fields.
- Log parse failures with enough detail to debug them.
- Separate source fetch errors from content-validation failures.
- Prefer idempotent upserts or staged writes.
- Build adapters so adding new ATS sources is straightforward.

## Guardrails

- Do not build V1 around prohibited or fragile scraping dependencies.
- Do not discard source-specific IDs.
- Do not map a third-party mirror directly to "official" without evidence.
- Do not assume disappearance means the job was filled; disappearance can also mean removed, expired, or changed.
- Do not collapse all source differences into one generic parser if source-specific adapters are cleaner.

## Deliverables

When using this skill, provide:
1. source adapter design
2. normalization contract
3. activity-check approach
4. persistence flow
5. any source-specific caveats
6. tests or validation cases for representative payloads
