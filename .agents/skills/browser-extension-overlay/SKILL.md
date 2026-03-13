---
name: browser-extension-overlay
description: Use this skill only when explicitly building or changing the browser extension that overlays job-quality intelligence on job listing pages, detects listing context, resolves official sources, or saves jobs from third-party pages into the dashboard. This is a post-MVP skill. Do not use for the main webapp, base ingestion, or core schema work unless the extension itself is the direct scope.
---

# browser-extension-overlay

This skill is intentionally post-MVP. Use it only when extension work is explicitly requested.

## Product role

The extension should meet users where they already browse jobs and add lightweight intelligence:
- official-source detection
- trust/freshness display
- quick red-flag warnings
- one-click save to dashboard

It is not the product foundation. The product foundation is still the webapp and data/scoring stack.

## Principles

- least privilege
- explainable overlays
- fast, lightweight UI
- minimal site-specific brittleness
- safe message passing between extension and backend

## Supported behaviors

Typical extension capabilities:
- detect job-listing pages
- extract page context
- resolve official-source candidates
- query backend for canonical match or create a provisional record
- display trust/freshness summary
- save listing to user dashboard
- open canonical detail page in webapp

## Engineering expectations

- Keep content scripts as small as practical.
- Centralize logic that can live in the backend rather than in fragile DOM code.
- Prefer semantic page detection and structured data when available.
- Make overlays dismissible and unobtrusive.
- Build for graceful failure when the page structure is unfamiliar.

## Guardrails

- Do not let the extension become a brittle scraping dependency for core ingestion.
- Do not request broad permissions without reason.
- Do not embed scoring logic entirely in the extension.
- Do not make extension-only workflows required for core product use.
- If site compatibility becomes fragile, recommend pushing logic back to the webapp/backend.

## Deliverables

When using this skill, provide:
1. extension architecture
2. permissions rationale
3. page-detection strategy
4. backend interaction design
5. overlay UX
6. risk notes and what remains post-MVP
