---
name: ranking-evaluation
description: Use this skill when evaluating the quality of trust scoring, staleness scoring, priority ranking, dedupe quality, or user-facing thresholds. Trigger for test sets, labeling strategy, calibration, false-positive analysis, experiment design, or quality dashboards. Do not use for base UI implementation or source ingestion unless the work is specifically about measuring those systems.
---

# ranking-evaluation

A scoring product only becomes defensible if the team can measure whether the scores are actually useful.

## Goals

- Measure whether trust labels are directionally right.
- Measure whether freshness labels help users prioritize applications.
- Measure whether dedupe is collapsing the right things.
- Improve thresholds using evidence instead of intuition.
- Create a repeatable review loop.

## What to evaluate

1. **Trust scoring**
   - precision of suspicious flags
   - precision of high-confidence-real labels
   - false positives on legitimate listings

2. **Staleness scoring**
   - whether likely-stale labels correlate with dead or low-value applications
   - whether fresh labels overprioritize old reposts

3. **Priority ranking**
   - whether top-ranked jobs are genuinely more actionable

4. **Dedupe/canonicalization**
   - over-merge rate
   - under-merge rate

## Recommended evaluation design

### Labeled review sets
Build a gold or silver dataset from representative jobs:
- clear official listings
- mirror-only listings
- clearly suspicious listings
- old reposts
- active new listings
- ambiguous borderline cases

### Human review queues
Create reviewer workflows for:
- suspicious trust outputs
- stale-but-still-active outputs
- bad merges
- missing official-source detection

### Calibration checks
Look for label drift:
- Are too many listings being labeled suspicious?
- Are too many old jobs still labeled fresh?
- Are "apply now" recommendations actually worth clicking?

## Output expectations

For any evaluation task, aim to produce:
- the metric definitions
- the labeled sample strategy
- threshold proposals
- error analysis
- next iteration recommendations

## Guardrails

- Do not optimize only for aggregate accuracy if the user pain is false confidence.
- Do not assume internal score quality from nice-looking UI.
- Do not evaluate on a narrow slice of jobs only.
- Do not skip borderline examples.
- Do not treat model or heuristic changes as done without regression checks.

## Deliverables

When using this skill, provide:
1. evaluation plan
2. metrics
3. sampling approach
4. threshold-tuning plan
5. error-analysis framework
6. recommended next adjustments
