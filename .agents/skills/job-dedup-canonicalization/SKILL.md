---
name: job-dedup-canonicalization
description: Use this skill when clustering duplicate or near-duplicate job listings into canonical job entities, designing matching rules, normalizing titles or locations, choosing a canonical source, or linking raw listings to one canonical record. Do not use for raw ingestion mechanics, score weighting, or frontend presentation unless dedupe or canonical identity is the main problem.
---

# job-dedup-canonicalization

The goal is not just to remove duplicate rows. The goal is to create one defensible canonical job entity from multiple noisy source records.

## Canonicalization goals

- Merge obvious duplicates.
- Avoid over-merging distinct jobs.
- Preserve all source relationships.
- Choose the best canonical source, ideally official.
- Produce a confidence signal for the cluster.

## Key matching signals

Use a layered approach. Stronger signals outrank fuzzy text similarity.

### High-signal fields
- source-provided requisition/job IDs
- official ATS identifiers
- exact official source URL matches
- exact company domain matches

### Medium-signal fields
- normalized company name
- normalized job title
- normalized location
- employment type
- remote type
- salary range overlap

### Fuzzy signals
- description similarity
- token overlap in title
- office/department similarity
- posting-date proximity

## Normalization rules

Normalize carefully, but keep raw values.

Normalize:
- company suffixes and punctuation
- title punctuation and common abbreviations
- location formatting
- remote/hybrid/on-site enums
- salary formats
- URL querystring noise where safe

Do not normalize so aggressively that unrelated roles collapse together.

## Canonical-source precedence

Prefer:
1. official company careers page
2. public ATS source tied to the employer
3. structured public job page with strong evidence
4. third-party mirror

If a lower-tier source contains richer text but a higher-tier source is more official, preserve both:
- official source for routing and confidence
- richer source body as supplemental evidence if needed

## Workflow

1. Normalize inputs.
2. Generate candidate matches.
3. Score candidate pairs or clusters.
4. Apply hard-match rules first.
5. Apply fuzzy merge rules with explicit thresholds.
6. Choose canonical source using source precedence plus content completeness.
7. Store link confidence and merge rationale.

## Output expectations

For each canonical cluster, produce:
- canonical_job_id
- member raw listing IDs
- canonical source URL
- canonical company/title/location
- cluster confidence
- notes on why the cluster was formed

## Guardrails

- Do not destroy source lineage.
- Do not merge jobs from different employers because titles look similar.
- Do not merge different locations blindly for companies with many openings.
- Do not assume reposts are duplicates if they represent genuinely different requisitions.
- Do not choose a third-party mirror as canonical when an official source exists.

## Deliverables

When using this skill, provide:
1. matching strategy
2. normalization rules
3. cluster-confidence logic
4. canonical-source selection rules
5. representative edge cases and expected outcomes
