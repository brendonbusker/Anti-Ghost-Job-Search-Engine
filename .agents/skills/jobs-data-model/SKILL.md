---
name: jobs-data-model
description: Use this skill when designing or changing the schema, persistence model, migrations, indexes, or query patterns for the anti-ghost-job product. Trigger for raw source storage, canonical job entities, score persistence, snapshot history, saved jobs, saved searches, alerts, and search-oriented schema changes. Do not use for frontend-only layout work, ranking logic details, or browser extension code unless they directly require schema changes.
---

# jobs-data-model

Design the data model so the product can explain itself later. This repository depends on strong historical evidence, not just current-state rows.

## Goals

- Preserve raw source evidence.
- Preserve normalized and canonical entities separately.
- Preserve time-series history and score snapshots.
- Preserve explainability artifacts, not just final numbers.
- Support search, filtering, saved jobs, alerts, and future model improvement.
- Make schema changes safe, reversible, and audit-friendly.

## Core principles

1. **Raw is sacred.**
   Never collapse source truth into only normalized fields. Keep the original payload or original parse result whenever practical.

2. **Canonical is derived.**
   A canonical job is a cluster-level view over one or more raw source listings.

3. **History matters.**
   Use snapshots or append-friendly audit records for things that can change over time:
   - first seen
   - last seen
   - active/inactive state
   - description hash
   - official source presence
   - application endpoint status
   - score outputs

4. **Explainability must persist.**
   Store reasons, flags, and evidence that justify a score.

5. **Schema should mirror product questions.**
   If the user can filter, inspect, or compare it, the schema should support it cleanly.

## Default entity set

Prefer these core concepts unless the task clearly needs otherwise:

- companies
- sources
- raw_job_listings
- canonical_jobs
- canonical_job_sources
- job_snapshots
- job_scores
- users
- saved_jobs
- saved_searches
- alerts

## Expected important fields

### companies
- id
- display_name
- normalized_name
- primary_domain
- careers_url
- metadata_json

### sources
- id
- source_type
- source_name
- base_url
- trust_level
- metadata_json

### raw_job_listings
- id
- source_id
- external_job_id
- url
- title_raw
- company_name_raw
- location_raw
- remote_type_raw
- employment_type_raw
- salary_raw
- description_raw
- posted_at_raw
- first_seen_at
- last_seen_at
- is_active
- payload_json
- content_hash

### canonical_jobs
- id
- canonical_title
- canonical_company_id
- canonical_location
- remote_type
- salary_min
- salary_max
- official_source_url
- official_source_confidence
- first_seen_at
- last_seen_at
- repost_count
- current_status

### canonical_job_sources
- id
- canonical_job_id
- raw_job_listing_id
- link_confidence
- precedence_rank

### job_snapshots
- id
- canonical_job_id
- snapshot_at
- source_count
- active_source_count
- official_source_present
- application_endpoint_status
- description_hash
- metadata_json

### job_scores
- id
- canonical_job_id
- scored_at
- trust_score
- freshness_score
- priority_score
- trust_label
- freshness_label
- priority_label
- reasons_json
- flags_json
- model_version

## Preferred workflow

1. Restate what question the schema must support.
2. Decide which data is raw, normalized, canonical, snapshot, or user-specific.
3. Keep raw and canonical layers separate.
4. Add indexes for expected filters and joins.
5. Produce migration-safe changes.
6. Document any backfill or data-repair implications.
7. Show at least one representative query path if the change affects search or scoring.

## Guardrails

- Do not overwrite raw evidence with LLM-generated summaries.
- Do not merge raw and canonical tables into one convenience table.
- Do not store only scores without reasons.
- Do not design away history just to simplify code.
- Do not hardcode role-specific assumptions into the schema when they belong in scoring logic.

## Deliverables

When using this skill, output:
1. the schema recommendation
2. migration plan
3. rationale tied to product behavior
4. important indexes
5. any backfill or compatibility notes
