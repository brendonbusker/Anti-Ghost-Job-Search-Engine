---
name: job-trust-scoring
description: Use this skill when designing or changing the heuristic system that estimates whether a job listing is real, legitimate, official-source-backed, or suspicious. Trigger for scam signals, source-confidence logic, official-source confidence, trust labels, reasons_json, or user-facing trust badges. Do not use for age/staleness estimation, dedupe mechanics, or general search-page layout unless trust scoring is the main task.
---

# job-trust-scoring

Trust scoring should help users avoid bad applications without pretending to prove fraud with certainty.

## Product promise

The output is a probability-style assessment with explanation. It is not a legal or absolute fraud verdict.

Preferred user-facing labels:
- High confidence real
- Medium confidence
- Unverified source
- Suspicious / low confidence

## Scoring philosophy

- Heuristic-first for V1.
- Explainable by default.
- Tunable and calibratable.
- Conservative about high-confidence claims.
- Never equate "low confidence" with "definitely fake."

## Positive signals

Examples:
- official company careers page found
- public ATS-backed posting found
- working application flow exists
- company domain and listing data are consistent
- description is specific and role-appropriate
- location, title, and compensation are internally consistent
- multiple trustworthy sources agree on core job facts
- recruiter or contact identity aligns with employer

## Negative signals

Examples:
- no official source found
- company identity mismatch across sources
- vague, generic, or suspiciously broad description
- suspicious contact method
- personal email for a supposedly corporate role
- request for money, fees, deposits, or purchases
- request for cryptocurrency, gift cards, or payment to unlock work
- off-platform messaging requests through apps like WhatsApp or Telegram
- text-only or chat-only "interview" for a supposed normal corporate role
- unrealistic pay/title/location combination
- signs the page is a low-quality mirror or content farm

## Workflow

1. Gather source-confidence evidence.
2. Compute positive and negative signals.
3. Weight signals into a trust score.
4. Generate reasons_json:
   - strongest supporting reasons
   - strongest caution reasons
5. Generate flags_json:
   - scam-adjacent
   - official-source-missing
   - inconsistent-company-data
   - suspicious-contact-method
   - payment-request
   - etc.
6. Map score to a trust label.
7. Expose concise user-facing explanations.

## Explanation style

Good explanations are short, concrete, and evidence-based.

Examples:
- Found on official employer careers page.
- Matching ATS posting found.
- No official source could be verified.
- Listing asks the applicant to pay before starting work.
- Company name and application domain do not match.

## Guardrails

- Do not use an LLM as the only scorer.
- Do not create opaque badge logic.
- Do not label something "fake" unless the evidence is direct and strong.
- Do not let one weak signal dominate the score.
- Do not ignore official-source evidence just because a third-party page has more text.

## Deliverables

When using this skill, provide:
1. signal list
2. weighting or rules strategy
3. label thresholds
4. reasons_json and flags_json schema
5. examples of borderline cases
6. notes on expected false positives and how to reduce them
