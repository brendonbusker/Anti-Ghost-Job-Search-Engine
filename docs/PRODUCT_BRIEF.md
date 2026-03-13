# Product Brief

## Project Name

Anti-Ghost Job Search Engine

## Positioning

This is not a generic LinkedIn clone or broad job board.

This product is an AI-powered anti-ghost-job search engine: a search and intelligence layer that helps users find trustworthy, fresh, actionable jobs while avoiding low-value applications.

## Core Problem

Job seekers lose time and energy on:

- fake listings
- stale listings
- reposted listings
- duplicate listings
- listings that may no longer be actively hiring
- listings that do not route to the true official application source
- scam-adjacent postings
- noisy, low-quality search results on broad job platforms

## Core User Questions

The product should help users answer:

1. Is this job real?
2. Is this job fresh?
3. Is this job likely still open?
4. Is this the official source?
5. Is this worth applying to right now?

## Product Vision

Users should be able to search jobs and quickly see:

- whether an official source was found
- a realness or trust score
- a freshness or staleness score
- signs of reposting
- whether the listing seems duplicated
- whether the job should be prioritized, deprioritized, or avoided

The long-term goal is not to show every job on earth.
The goal is to save users time by surfacing trustworthy jobs and filtering out low-value opportunities.

## Product Principles

### 1. Trust Over Quantity

We do not win by showing the most jobs.
We win by showing the most trustworthy and actionable jobs.

### 2. Explainability Over Black-Box AI

Every score must have reasons behind it.
Users should understand why a listing is marked high confidence, stale, suspicious, or worth prioritizing.

### 3. Official Source First

Whenever possible, the canonical destination should be the official company career page or trusted ATS posting.

### 4. Probability, Not Certainty

The product should not claim certainty without direct evidence.
Use labels such as:

- High confidence real
- Medium confidence
- Unverified
- Possibly stale
- Likely reposted
- Low-confidence listing
- Suspicious / avoid

### 5. Build a Wedge, Not a Giant Platform

MVP should focus on search, dedupe, scoring, and official-source resolution.
Avoid platform bloat.

## What This Product Is

- a job-search intelligence layer
- a public-job aggregation and normalization engine
- a scoring engine for job quality
- a prioritization tool for applicants
- eventually a browser extension plus web dashboard combination

## What This Product Is Not

- not a LinkedIn clone
- not a social network
- not a recruiter CRM
- not an ATS
- not a resume builder first
- not a mass application bot
- not a scrape-the-entire-internet product
- not a product that depends on fragile or prohibited scraping as its foundation

## Platform Focus

### MVP: Webapp

Reasons:

- job search is desktop-heavy
- dense filtering and information display work well on the web
- easier to ship and iterate quickly
- easier to support dashboards, saved jobs, and score explanations

### Post-MVP: Browser Extension

Possible later capabilities:

- detect job listing pages
- resolve official source
- show trust and freshness overlays
- save jobs to the dashboard

### Avoid for V1

- mobile-first strategy
- full native mobile app
- browser automation-heavy workflows

## MVP Scope

### MVP

- search jobs by title, keyword, company, location, remote type, and salary when available
- show canonical result cards with trust, freshness, and official-source context
- provide a job detail page with source history, explanations, and red flags
- support authenticated saved jobs
- support architecture for saved searches and alerts

### Post-MVP

- richer alerts
- browser extension
- deeper personalization
- broader source coverage
- premium history and monitoring workflows

### Avoid

- resume builder
- AI cover letter generator as a primary feature
- mass apply automation
- social feed
- recruiter-side tooling
- in-app messaging
- anything spammy or low-trust

## MVP Feature Requirements

### Search Jobs

- title
- keyword
- company
- location
- remote / hybrid / onsite
- salary filter if available

### Job Result Cards

Each result should show:

- job title
- company
- location
- salary if available
- source quality badge
- trust score badge
- freshness badge
- repost indicator if relevant
- official source found status
- quick reason summary

### Job Detail Page

Should show:

- canonical job information
- source list and where seen
- official application URL
- trust score
- freshness score
- priority score
- explanation section
- listing history if available
- red flags if applicable

### Saved Jobs

Allow authenticated users to bookmark jobs.

### Saved Searches and Alerts

Design the schema and architecture so they fit naturally, but keep V1 lightweight.

### Explainability

Store and display reasons such as:

- found on official company careers site
- found in public ATS feed
- posting first seen X days ago
- identical listing reposted N times
- official source missing
- application endpoint appears inactive
- inconsistent location or title data across sources

## V1 Source Strategy

### MVP

- Greenhouse public job board feeds
- Lever public postings
- Ashby public job postings
- company careers pages
- pages with structured job metadata
- public ATS-backed career pages

### Post-MVP

- carefully selected supplemental aggregators where legally and operationally safe

### Avoid

- brittle scraping dependencies as the foundation of the product
- policy-risky scraping as the main ingestion strategy

## Core Intelligence Layers

### Deduplication and Canonicalization

Goal:
one canonical job record mapped to many raw source records.

Use signals like:

- normalized company name
- normalized title
- normalized location
- requisition IDs
- salary range
- job body similarity
- ATS or official-source precedence
- URL normalization

### Trust and Realness Scoring

Positive signals:

- appears on official company domain
- appears in trusted public ATS feed
- working application endpoint exists
- recruiter or contact domain matches employer
- detailed and specific description
- consistency across sources

Negative signals:

- official source missing
- vague or generic description
- inconsistent company, title, or location data
- suspicious contact methods
- requests for money
- messaging-app communication requests
- scam phrasing

### Freshness and Staleness Scoring

Signals:

- first seen date
- last seen date
- days since discovery
- repost count
- recurrence pattern
- whether the official page is still live
- whether the official source disappeared
- whether the job exists only on mirrors
- whether changes are substantive or superficial

Use labels such as:

- New
- Fresh
- Aging
- Possibly stale
- Likely stale
- Reposted repeatedly

### Priority Score

Should combine:

- trust score
- freshness score
- source quality
- user relevance
- salary transparency
- remote preference match
- recency
- overall confidence

Use labels such as:

- Apply now
- Apply soon
- Low priority
- Avoid for now

## Architecture Requirements

Keep these concerns separate:

- ingestion
- normalization
- canonicalization
- scoring
- search
- user features
- admin and internal review tools

Design for historical tracking from day one.

Store:

- raw source listing
- canonical job
- score snapshots
- crawl and check history
- job-source relationships
- persisted reasons and evidence for scores

## Core Data Model Concepts

Likely core entities:

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

Important properties across the model:

- raw and canonical separation
- historical state over time
- explainability persistence
- source provenance
- official-source confidence

## Scoring System Guidance

### MVP

- heuristic-first
- deterministic rules
- weighted signals
- explainable reasons
- tunable thresholds

### Post-MVP

- LLM support for explanation summarization
- text normalization support
- internal analysis assistance
- scam-pattern interpretation support

### Avoid

- LLM-only scoring
- black-box scores without persisted evidence

## Search Requirements

Search should support:

- keyword
- company
- location
- remote type
- salary filters
- score filters
- freshness filters
- trust filters

## Internal Tooling

Plan for an admin or review view that can inspect:

- raw source jobs
- dedupe clusters
- canonical jobs
- score outputs
- reasons for scores
- false positives and false negatives

This does not need to be fully built in V1, but the architecture should support it cleanly.

## UX Philosophy

The UX should feel:

- fast
- serious
- utility-first
- trustworthy
- dense but readable
- modern

Avoid:

- playful gimmicks
- vague AI language
- badge clutter
- unexplained confidence

Every badge should carry meaning.

## Monetization Thesis

Potential model:

- freemium webapp
- premium subscription for deeper scoring, history, and alerts
- later premium browser extension features
- possible B2B offering for universities, career services, or coaches

Avoid ad-driven architecture decisions in the early product.

## Engineering Philosophy

- clean, production-minded code
- typed code
- modular services
- clear folder structure
- reusable utilities
- migrations
- reasonable tests
- environment variable hygiene
- no hardcoded secrets
- avoid unnecessary overengineering

## Working Preferences

These are active collaboration preferences for the project:

- Do not overcomplicate V1
- Be practical and startup-minded
- Prefer webapp-first decisions
- Keep architecture clean but not bloated
- Call out legal or platform-risky dependencies if they arise
- Prefer structured public sources and official sources over fragile scraping
- Build for explainability from day one
- Whenever proposing a feature, explicitly label it as `MVP`, `Post-MVP`, or `Avoid`

## Decision Filter

When making product or technical decisions, ask:

- Does this improve trust?
- Does this reduce wasted applications?
- Does this strengthen the scoring and history moat?
- Is this appropriate for MVP?
- Is this legally and operationally safer than a fragile shortcut?
- Is this explainable to users?

## Near-Term Build Order

Recommended sequence:

1. define repo structure
2. define initial schema
3. define ingestion connector contracts
4. design canonicalization pipeline
5. design trust and freshness scoring
6. build search API and filters
7. build results UI and detail page
8. add saved jobs
9. add internal review tooling

## Summary

The point of this product is not to maximize the number of jobs shown.

The point is to maximize the quality, trustworthiness, freshness, and usefulness of opportunities surfaced to the user.
