---
name: job-staleness-scoring
description: Use this skill when designing or changing freshness, aging, repost, or likely-stale logic for job listings. Trigger for first-seen/last-seen logic, repost detection, application-endpoint checks, freshness labels, or user-facing urgency decisions. Do not use for trust/scam logic, raw ingestion design, or general search UX unless staleness estimation is the main task.
---

# job-staleness-scoring

Freshness scoring estimates how likely a job is still worth applying to now. It does not claim certainty that a role is filled.

## Product promise

The goal is to help users prioritize time, not to pretend we can know internal hiring status perfectly.

Preferred user-facing labels:
- New
- Fresh
- Aging
- Possibly stale
- Likely stale
- Reposted repeatedly

## Primary signals

- first_seen_at
- last_seen_at
- posting age
- number of times observed
- number of repost cycles
- whether official source is still active
- whether only mirrors remain
- whether the application endpoint still accepts submissions
- whether the description has substantively changed or just been refreshed
- whether similar roles at the same company cycle repeatedly

## Recommended logic style

Use a layered heuristic:

1. **Base freshness**
   Derived from age, last-seen recency, and official-source presence.

2. **Repost behavior**
   Penalize listings that repeatedly reappear with minimal meaningful change.

3. **Endpoint evidence**
   Strongly downgrade freshness if the official application endpoint appears closed, archived, or gone.

4. **Mirror-only evidence**
   If a job persists only on mirrors after disappearing from official sources, treat that as a strong stale signal.

5. **Role-aware caution**
   Avoid rigid global age rules. Some roles stay open longer than others.

## Workflow

1. Build listing-history features.
2. Detect repost patterns.
3. Check official application status where possible.
4. Compute freshness score with reasons.
5. Map to a label.
6. Produce concise urgency guidance.

## Example reasons

- First seen 3 days ago and still active on official source.
- Listing has reappeared 4 times with near-identical text.
- Official application page is no longer active.
- Job remains visible only on third-party mirrors.
- Description changed meaningfully during the past week.

## Guardrails

- Do not interpret "older than X days" as automatically filled.
- Do not use staleness labels to imply fraud.
- Do not mark a job as "filled" unless direct evidence exists.
- Do not ignore role/company context when tuning thresholds.
- Do not confuse low freshness with low trust; they are related but distinct.

## Deliverables

When using this skill, provide:
1. freshness signal definitions
2. repost-detection logic
3. label thresholds
4. reasons_json shape for freshness
5. representative edge cases
6. notes on uncertainty and user-facing wording
