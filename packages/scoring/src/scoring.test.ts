import assert from "node:assert/strict";
import test from "node:test";

import {
  ApplicationEndpointStatus,
  CanonicalJobStatus,
  EmploymentType,
  RemoteType,
  SourceTrustLevel,
  SourceType,
  TrustLabel,
  FreshnessLabel,
  PriorityLabel,
  type Prisma,
} from "@anti-ghost/database";

import { scoreCanonicalJob, type CanonicalJobRecord } from "./scoring";

test("scoreCanonicalJob rates a trusted official ATS job highly", async () => {
  const job = createCanonicalJobRecord({
    officialSourceUrl: "https://jobs.lever.co/acme/platform-engineer",
    officialSourceConfidence: 0.94,
    descriptionText: "A".repeat(900),
    sources: [
      createSource({
        isCanonicalSource: true,
        sourceType: SourceType.LEVER,
        titleRaw: "Platform Engineer",
        isActive: true,
      }),
      createSource({
        sourceType: SourceType.COMPANY_CAREERS,
        titleRaw: "Platform Engineer",
        isActive: true,
      }),
    ],
  });

  const scored = await scoreCanonicalJob(job, {
    endpointChecker: async () => ({ status: "ACTIVE", statusCode: 200 }),
    now: new Date("2026-03-12T12:00:00.000Z"),
  });

  assert.equal(scored.trustLabel, TrustLabel.HIGH_CONFIDENCE_REAL);
  assert.equal(scored.freshnessLabel, FreshnessLabel.NEW);
  assert.equal(scored.priorityLabel, PriorityLabel.APPLY_NOW);
  assert.equal(scored.snapshot.applicationEndpointStatus, ApplicationEndpointStatus.ACTIVE);
  assert.ok(scored.reasons.trustReasons.includes("Official source was resolved for this canonical job."));
});

test("scoreCanonicalJob downranks missing-official and inactive-endpoint jobs", async () => {
  const job = createCanonicalJobRecord({
    officialSourceUrl: null,
    officialSourceConfidence: null,
    firstSeenAt: new Date("2026-01-01T12:00:00.000Z"),
    lastSeenAt: new Date("2026-02-01T12:00:00.000Z"),
    currentStatus: CanonicalJobStatus.INACTIVE,
    descriptionText: "Short",
    repostCount: 4,
    sources: [
      createSource({
        isCanonicalSource: true,
        sourceType: SourceType.SUPPLEMENTAL,
        sourceTrustLevel: SourceTrustLevel.LOW,
        titleRaw: "Remote Customer Success Director",
        isActive: false,
      }),
    ],
  });

  const scored = await scoreCanonicalJob(job, {
    endpointChecker: async () => ({ status: "INACTIVE", statusCode: 404 }),
    now: new Date("2026-03-12T12:00:00.000Z"),
  });

  assert.equal(scored.trustLabel, TrustLabel.SUSPICIOUS_LOW_CONFIDENCE);
  assert.equal(scored.freshnessLabel, FreshnessLabel.REPOSTED_REPEATEDLY);
  assert.equal(scored.priorityLabel, PriorityLabel.AVOID_FOR_NOW);
  assert.equal(scored.flags.officialSourceMissing, true);
  assert.equal(scored.flags.endpointInactive, true);
});

test("scoreCanonicalJob stays conservative when official source is missing but other trust signals are strong", async () => {
  const job = createCanonicalJobRecord({
    officialSourceUrl: null,
    officialSourceConfidence: null,
    descriptionText: "A".repeat(850),
    sources: [
      createSource({
        isCanonicalSource: true,
        sourceType: SourceType.GREENHOUSE,
        titleRaw: "Data Platform Engineer",
        isActive: true,
      }),
      createSource({
        id: "link_2",
        rawJobListingId: "raw_2",
        sourceType: SourceType.LEVER,
        titleRaw: "Data Platform Engineer",
        isActive: true,
      }),
    ],
  });

  const scored = await scoreCanonicalJob(job, {
    endpointChecker: async () => ({ status: "ACTIVE", statusCode: 200 }),
    now: new Date("2026-03-12T12:00:00.000Z"),
  });

  assert.equal(scored.trustLabel, TrustLabel.MEDIUM_CONFIDENCE);
  assert.equal(scored.freshnessLabel, FreshnessLabel.FRESH);
  assert.equal(scored.priorityLabel, PriorityLabel.APPLY_SOON);
  assert.notEqual(scored.trustLabel, TrustLabel.SUSPICIOUS_LOW_CONFIDENCE);
  assert.ok(scored.reasons.trustReasons.includes("No official source could be verified."));
  assert.ok(scored.reasons.trustReasons.includes("Canonical source is a trusted public ATS posting."));
  assert.ok(
    scored.reasons.priorityReasons.includes("Missing official source keeps this below top application priority."),
  );
  assert.notEqual(scored.priorityLabel, PriorityLabel.APPLY_NOW);
});

test("scoreCanonicalJob keeps a typical ATS-only missing-official job at low priority", async () => {
  const job = createCanonicalJobRecord({
    canonicalTitle: "Data Quality Analyst",
    canonicalLocation: "Remote - US",
    remoteType: RemoteType.REMOTE,
    salaryMin: 110000,
    salaryMax: 135000,
    officialSourceUrl: null,
    officialSourceConfidence: null,
    descriptionText: "Own data quality alerts, SQL validation, and job-data auditing workflows. ".repeat(14),
    firstSeenAt: new Date("2026-03-07T12:00:00.000Z"),
    lastSeenAt: new Date("2026-03-12T12:00:00.000Z"),
    sources: [
      createSource({
        isCanonicalSource: true,
        sourceType: SourceType.GREENHOUSE,
        titleRaw: "Data Quality Analyst",
        locationRaw: "Remote - US",
        isActive: true,
      }),
      createSource({
        id: "link_4",
        rawJobListingId: "raw_4",
        sourceType: SourceType.LEVER,
        titleRaw: "Data Quality Analyst",
        locationRaw: "Remote - US",
        isActive: true,
        precedenceRank: 2,
        isCanonicalSource: false,
        url: "https://jobs.lever.co/acme/data-quality-analyst",
      }),
    ],
  });

  const scored = await scoreCanonicalJob(job, {
    endpointChecker: async () => ({ status: "ACTIVE", statusCode: 200 }),
    now: new Date("2026-03-12T12:00:00.000Z"),
  });

  assert.equal(scored.trustLabel, TrustLabel.MEDIUM_CONFIDENCE);
  assert.equal(scored.freshnessLabel, FreshnessLabel.FRESH);
  assert.equal(scored.priorityLabel, PriorityLabel.LOW_PRIORITY);
  assert.ok(
    scored.reasons.priorityReasons.includes("Missing official source keeps this below top application priority."),
  );
});

test("scoreCanonicalJob keeps company-linked ATS-board verification below apply-now urgency", async () => {
  const job = createCanonicalJobRecord({
    canonicalTitle: "Data Quality Analyst",
    canonicalLocation: "Remote - US",
    remoteType: RemoteType.REMOTE,
    salaryMin: 110000,
    salaryMax: 135000,
    officialSourceUrl: "https://boards.greenhouse.io/acme/jobs/200",
    officialSourceConfidence: 0.91,
    officialSourceMethod: "company_linked_ats_board",
    descriptionText: "Own data quality alerts, SQL validation, and job-data auditing workflows. ".repeat(14),
    firstSeenAt: new Date("2026-03-07T12:00:00.000Z"),
    lastSeenAt: new Date("2026-03-12T12:00:00.000Z"),
    sources: [
      createSource({
        isCanonicalSource: true,
        sourceType: SourceType.GREENHOUSE,
        titleRaw: "Data Quality Analyst",
        locationRaw: "Remote - US",
        isActive: true,
        url: "https://boards.greenhouse.io/acme/jobs/200",
      }),
      createSource({
        id: "link_6",
        rawJobListingId: "raw_6",
        sourceType: SourceType.LEVER,
        titleRaw: "Data Quality Analyst",
        locationRaw: "Remote - US",
        isActive: true,
        precedenceRank: 2,
        isCanonicalSource: false,
        url: "https://jobs.lever.co/acme/201",
      }),
    ],
  });

  const scored = await scoreCanonicalJob(job, {
    endpointChecker: async () => ({ status: "ACTIVE", statusCode: 200 }),
    now: new Date("2026-03-12T12:00:00.000Z"),
  });

  assert.equal(scored.trustLabel, TrustLabel.HIGH_CONFIDENCE_REAL);
  assert.equal(scored.freshnessLabel, FreshnessLabel.FRESH);
  assert.equal(scored.priorityLabel, PriorityLabel.APPLY_SOON);
  assert.ok(
    scored.reasons.trustReasons.includes(
      "Official source is verified from a company-linked ATS board, not an exact job page.",
    ),
  );
  assert.ok(
    scored.reasons.priorityReasons.includes(
      "Board-level official verification is useful, but it stays below fully confirmed apply-now priority.",
    ),
  );
});

test("scoreCanonicalJob treats trusted ATS-board-root verification as conservative board-level evidence", async () => {
  const job = createCanonicalJobRecord({
    canonicalTitle: "Data Quality Analyst",
    canonicalLocation: "Remote - US",
    remoteType: RemoteType.REMOTE,
    officialSourceUrl: "https://jobs.lever.co/dnb/0402a2b9-1b05-4179-a4a9-758c68b80b55",
    officialSourceConfidence: 0.92,
    officialSourceMethod: "trusted_ats_board_root",
    descriptionText: "Own data quality alerts, SQL validation, and job-data auditing workflows. ".repeat(14),
    firstSeenAt: new Date("2026-03-07T12:00:00.000Z"),
    lastSeenAt: new Date("2026-03-12T12:00:00.000Z"),
    sources: [
      createSource({
        isCanonicalSource: true,
        sourceType: SourceType.LEVER,
        titleRaw: "Data Quality Analyst",
        locationRaw: "Remote - US",
        isActive: true,
        url: "https://jobs.lever.co/dnb/0402a2b9-1b05-4179-a4a9-758c68b80b55",
      }),
    ],
  });

  const scored = await scoreCanonicalJob(job, {
    endpointChecker: async () => ({ status: "ACTIVE", statusCode: 200 }),
    now: new Date("2026-03-12T12:00:00.000Z"),
  });

  assert.equal(scored.trustLabel, TrustLabel.HIGH_CONFIDENCE_REAL);
  assert.equal(scored.freshnessLabel, FreshnessLabel.FRESH);
  assert.notEqual(scored.priorityLabel, PriorityLabel.APPLY_NOW);
  assert.ok(
    scored.reasons.trustReasons.includes(
      "Official source is confirmed from a trusted ATS board root inferred from repeated source evidence, not a company-page link.",
    ),
  );
  assert.ok(
    scored.reasons.priorityReasons.includes(
      "ATS-board-root confirmation is useful, but it stays below fully confirmed apply-now priority.",
    ),
  );
});

test("scoreCanonicalJob treats a company careers-page fallback as safer than missing, but still conservative", async () => {
  const job = createCanonicalJobRecord({
    officialSourceUrl: "https://acme.example/careers",
    officialSourceConfidence: 0.78,
    officialSourceMethod: "company_careers_page",
    sources: [
      createSource({
        isCanonicalSource: true,
        sourceType: SourceType.GREENHOUSE,
        titleRaw: "Support Analyst",
        isActive: true,
        url: "https://boards.greenhouse.io/acme/jobs/300",
      }),
    ],
  });

  const scored = await scoreCanonicalJob(job, {
    endpointChecker: async () => ({ status: "ACTIVE", statusCode: 200 }),
    now: new Date("2026-03-12T12:00:00.000Z"),
  });

  assert.equal(scored.flags.officialSourceFallback, true);
  assert.notEqual(scored.freshnessLabel, FreshnessLabel.NEW);
  assert.notEqual(scored.priorityLabel, PriorityLabel.APPLY_NOW);
  assert.ok(
    scored.reasons.trustReasons.includes(
      "Official source falls back to a company careers page rather than a job-specific posting.",
    ),
  );
});

test("scoreCanonicalJob does not mark an older but still-active official job as stale automatically", async () => {
  const job = createCanonicalJobRecord({
    firstSeenAt: new Date("2026-01-01T12:00:00.000Z"),
    lastSeenAt: new Date("2026-03-11T12:00:00.000Z"),
    repostCount: 0,
    officialSourceUrl: "https://boards.greenhouse.io/acme/jobs/123",
    officialSourceConfidence: 0.95,
    sources: [
      createSource({
        isCanonicalSource: true,
        sourceType: SourceType.GREENHOUSE,
        titleRaw: "Senior Analytics Engineer",
        isActive: true,
      }),
    ],
  });

  const scored = await scoreCanonicalJob(job, {
    endpointChecker: async () => ({ status: "ACTIVE", statusCode: 200 }),
    now: new Date("2026-03-12T12:00:00.000Z"),
  });

  assert.equal(scored.freshnessLabel, FreshnessLabel.AGING);
  assert.equal(scored.priorityLabel, PriorityLabel.APPLY_SOON);
  assert.notEqual(scored.freshnessLabel, FreshnessLabel.LIKELY_STALE);
  assert.ok(
    scored.reasons.freshnessReasons.includes(
      "Source evidence suggests the listing has been around for more than 45 days.",
    ),
  );
  assert.ok(scored.reasons.freshnessReasons.includes("Application endpoint is still active."));
  assert.ok(
    scored.reasons.priorityReasons.includes("Older listings stay actionable, but they drop below true apply-now urgency."),
  );
});

test("scoreCanonicalJob uses source-reported age to avoid over-labeling first-import jobs as new", async () => {
  const job = createCanonicalJobRecord({
    firstSeenAt: new Date("2026-03-12T00:00:00.000Z"),
    lastSeenAt: new Date("2026-03-12T00:00:00.000Z"),
    sources: [
      createSource({
        isCanonicalSource: true,
        sourceType: SourceType.GREENHOUSE,
        titleRaw: "Staff Data Engineer",
        postedAtRaw: "2026-01-15T00:00:00.000Z",
        isActive: true,
        url: "https://boards.greenhouse.io/acme/jobs/999",
      }),
    ],
  });

  const scored = await scoreCanonicalJob(job, {
    endpointChecker: async () => ({ status: "ACTIVE", statusCode: 200 }),
    now: new Date("2026-03-12T12:00:00.000Z"),
  });

  assert.equal(scored.freshnessLabel, FreshnessLabel.AGING);
  assert.equal(scored.priorityLabel, PriorityLabel.APPLY_SOON);
  assert.equal(scored.evidence.sourceReportedDaysAgo, 56);
  assert.equal(scored.evidence.effectiveListingAgeDays, 56);
  assert.ok(
    scored.reasons.freshnessReasons.includes("Source-reported job age is older than our local observation history."),
  );
});

test("scoreCanonicalJob lowers priority for fuzzy clusters with title or location disagreement", async () => {
  const job = createCanonicalJobRecord({
    officialSourceUrl: "https://boards.greenhouse.io/acme/jobs/456",
    officialSourceConfidence: 0.7,
    firstSeenAt: new Date("2026-02-22T12:00:00.000Z"),
    lastSeenAt: new Date("2026-02-24T12:00:00.000Z"),
    salaryMin: null,
    salaryMax: null,
    sources: [
      createSource({
        isCanonicalSource: true,
        sourceType: SourceType.GREENHOUSE,
        titleRaw: "Product Analyst",
        locationRaw: "Austin, TX",
        isActive: true,
      }),
      createSource({
        id: "link_3",
        rawJobListingId: "raw_3",
        sourceType: SourceType.STRUCTURED_PAGE,
        titleRaw: "Product Data Analyst",
        locationRaw: "Remote - US",
        isActive: false,
        precedenceRank: 2,
        isCanonicalSource: false,
        linkConfidence: 0.86,
        mergeRationaleJson: {
          rule: "fuzzy_title_location",
          confidence: 0.86,
          matchedOn: ["title", "company", "location"],
          clusterConfidence: 0.84,
        },
      }),
    ],
  });

  const scored = await scoreCanonicalJob(job, {
    endpointChecker: async () => ({ status: "UNKNOWN", statusCode: null }),
    now: new Date("2026-03-12T12:00:00.000Z"),
  });

  assert.equal(scored.trustLabel, TrustLabel.MEDIUM_CONFIDENCE);
  assert.equal(scored.freshnessLabel, FreshnessLabel.AGING);
  assert.equal(scored.priorityLabel, PriorityLabel.LOW_PRIORITY);
  assert.ok(scored.flags.fuzzyCluster);
  assert.ok(scored.flags.inconsistentTitle);
  assert.ok(scored.flags.inconsistentLocation);
  assert.ok(
    scored.reasons.priorityReasons.includes("Cluster disagreement lowers priority until the listing is reviewed."),
  );
  assert.ok(
    scored.reasons.freshnessReasons.includes(
      "Cluster disagreement lowers freshness confidence until the official posting is confirmed active.",
    ),
  );
});

test("scoreCanonicalJob does not treat a recent ambiguous cluster with unknown endpoint as new", async () => {
  const job = createCanonicalJobRecord({
    officialSourceUrl: "https://boards.greenhouse.io/acme/jobs/789",
    officialSourceConfidence: 0.72,
    firstSeenAt: new Date("2026-03-08T12:00:00.000Z"),
    lastSeenAt: new Date("2026-03-11T12:00:00.000Z"),
    salaryMin: null,
    salaryMax: null,
    sources: [
      createSource({
        isCanonicalSource: true,
        sourceType: SourceType.GREENHOUSE,
        titleRaw: "Growth Analyst",
        locationRaw: "Chicago, IL",
        isActive: true,
      }),
      createSource({
        id: "link_5",
        rawJobListingId: "raw_5",
        sourceType: SourceType.STRUCTURED_PAGE,
        titleRaw: "Revenue Growth Analyst",
        locationRaw: "Remote - US",
        isActive: true,
        precedenceRank: 2,
        isCanonicalSource: false,
        linkConfidence: 0.85,
        mergeRationaleJson: {
          rule: "fuzzy_title_location",
          confidence: 0.85,
          matchedOn: ["title", "company", "location"],
          clusterConfidence: 0.82,
        },
      }),
    ],
  });

  const scored = await scoreCanonicalJob(job, {
    endpointChecker: async () => ({ status: "UNKNOWN", statusCode: null }),
    now: new Date("2026-03-12T12:00:00.000Z"),
  });

  assert.equal(scored.trustLabel, TrustLabel.MEDIUM_CONFIDENCE);
  assert.equal(scored.freshnessLabel, FreshnessLabel.FRESH);
  assert.notEqual(scored.freshnessLabel, FreshnessLabel.NEW);
  assert.equal(scored.priorityLabel, PriorityLabel.APPLY_SOON);
  assert.notEqual(scored.priorityLabel, PriorityLabel.APPLY_NOW);
  assert.ok(scored.flags.fuzzyCluster);
  assert.ok(
    scored.reasons.freshnessReasons.includes(
      "Cluster disagreement lowers freshness confidence until the official posting is confirmed active.",
    ),
  );
});

test("scoreCanonicalJob does not penalize multi-location clusters when all sources share one requisition id", async () => {
  const job = createCanonicalJobRecord({
    officialSourceUrl: "https://jobs.lever.co/dnb/420d8697-74f1-4157-9b3a-a9362e6baf4c",
    officialSourceConfidence: 0.97,
    firstSeenAt: new Date("2026-03-10T12:00:00.000Z"),
    lastSeenAt: new Date("2026-03-12T12:00:00.000Z"),
    sources: [
      createSource({
        isCanonicalSource: true,
        sourceType: SourceType.LEVER,
        titleRaw: "Agent Management Analyst (R-18876)",
        locationRaw: "Center Valley - Pennsylvania - United States",
        isActive: true,
        url: "https://jobs.lever.co/dnb/420d8697-74f1-4157-9b3a-a9362e6baf4c",
        payloadJson: {
          normalized: {
            canonicalHints: {
              officialSourceUrl: "https://jobs.lever.co/dnb/420d8697-74f1-4157-9b3a-a9362e6baf4c",
              requisitionId: "R-18876",
            },
          },
        },
      }),
      createSource({
        id: "link_7",
        rawJobListingId: "raw_7",
        sourceType: SourceType.LEVER,
        titleRaw: "Agent Management Analyst (R-18876)",
        locationRaw: "Florham Park - New Jersey - United States",
        isActive: true,
        precedenceRank: 2,
        isCanonicalSource: false,
        url: "https://jobs.lever.co/dnb/6e2a56c1-df8f-456e-8328-02ba2bba8836",
        mergeRationaleJson: {
          rule: "requisition_id",
          confidence: 0.97,
          matchedOn: ["requisition_id"],
          clusterConfidence: 0.97,
        },
        payloadJson: {
          normalized: {
            canonicalHints: {
              officialSourceUrl: "https://jobs.lever.co/dnb/6e2a56c1-df8f-456e-8328-02ba2bba8836",
              requisitionId: "R-18876",
            },
          },
        },
      }),
    ],
  });

  const scored = await scoreCanonicalJob(job, {
    endpointChecker: async () => ({ status: "ACTIVE", statusCode: 200 }),
    now: new Date("2026-03-12T12:00:00.000Z"),
  });

  assert.equal(scored.flags.fuzzyCluster, false);
  assert.equal(scored.flags.inconsistentLocation, false);
  assert.equal(scored.priorityLabel, PriorityLabel.APPLY_NOW);
  assert.ok(
    !scored.reasons.priorityReasons.includes("Cluster disagreement lowers priority until the listing is reviewed."),
  );
});

test("scoreCanonicalJob does not flag same-requisition title drift as ambiguous", async () => {
  const job = createCanonicalJobRecord({
    officialSourceUrl: "https://job-boards.greenhouse.io/airtable/jobs/8455195002",
    officialSourceConfidence: 0.97,
    sources: [
      createSource({
        isCanonicalSource: true,
        sourceType: SourceType.GREENHOUSE,
        titleRaw: "Commercial Renewals Manager EMEA",
        locationRaw: "London, United Kingdom",
        url: "https://job-boards.greenhouse.io/airtable/jobs/8455195002",
        payloadJson: {
          normalized: {
            canonicalHints: {
              officialSourceUrl: "https://job-boards.greenhouse.io/airtable/jobs/8455195002",
              requisitionId: "P-000716-20240909",
            },
          },
        },
      }),
      createSource({
        id: "link_8",
        rawJobListingId: "raw_8",
        sourceType: SourceType.GREENHOUSE,
        titleRaw: "Enterprise Renewals Manager EMEA",
        locationRaw: "London, United Kingdom",
        precedenceRank: 2,
        isCanonicalSource: false,
        url: "https://job-boards.greenhouse.io/airtable/jobs/8452938002",
        mergeRationaleJson: {
          rule: "requisition_id",
          confidence: 0.97,
          matchedOn: ["requisition_id"],
          clusterConfidence: 0.97,
        },
        payloadJson: {
          normalized: {
            canonicalHints: {
              officialSourceUrl: "https://job-boards.greenhouse.io/airtable/jobs/8452938002",
              requisitionId: "P-000716-20240909",
            },
          },
        },
      }),
    ],
  });

  const scored = await scoreCanonicalJob(job, {
    endpointChecker: async () => ({ status: "ACTIVE", statusCode: 200 }),
    now: new Date("2026-03-12T12:00:00.000Z"),
  });

  assert.equal(scored.flags.inconsistentTitle, false);
  assert.ok(
    !scored.reasons.priorityReasons.includes("Cluster disagreement lowers priority until the listing is reviewed."),
  );
});

test("scoreCanonicalJob does not flag exact duplicate fuzzy clusters as ambiguous", async () => {
  const job = createCanonicalJobRecord({
    officialSourceUrl: "https://jobs.lever.co/dnb/78ed309b-291a-4218-9382-38343020fb99",
    officialSourceConfidence: 0.9,
    sources: [
      createSource({
        isCanonicalSource: true,
        sourceType: SourceType.LEVER,
        titleRaw: "Executive - Operations (Partner's Payroll)",
        locationRaw: "Mumbai - India",
        url: "https://jobs.lever.co/dnb/78ed309b-291a-4218-9382-38343020fb99",
      }),
      createSource({
        id: "link_9",
        rawJobListingId: "raw_9",
        sourceType: SourceType.LEVER,
        titleRaw: "Executive - Operations (Partner's Payroll)",
        locationRaw: "Mumbai - India",
        precedenceRank: 2,
        isCanonicalSource: false,
        url: "https://jobs.lever.co/dnb/a651ad2a-855f-42b8-a0bf-c6b3c0d76f7d",
        mergeRationaleJson: {
          rule: "fuzzy_title_location",
          confidence: 1,
          matchedOn: ["normalized_company_name", "title_similarity", "location_or_remote_compatibility"],
          clusterConfidence: 1,
        },
      }),
    ],
  });

  const scored = await scoreCanonicalJob(job, {
    endpointChecker: async () => ({ status: "ACTIVE", statusCode: 200 }),
    now: new Date("2026-03-12T12:00:00.000Z"),
  });

  assert.equal(scored.flags.fuzzyCluster, false);
  assert.ok(
    !scored.reasons.priorityReasons.includes("Cluster disagreement lowers priority until the listing is reviewed."),
  );
});

test("scoreCanonicalJob does not flag token-reordered duplicate titles as ambiguous", async () => {
  const job = createCanonicalJobRecord({
    officialSourceUrl: "https://jobs.ashbyhq.com/vanta/50d231e8-8b16-4733-8d09-ec7d3c117e4e",
    officialSourceConfidence: 0.9,
    sources: [
      createSource({
        isCanonicalSource: true,
        sourceType: SourceType.ASHBY,
        titleRaw: "Manager, Partner Customer Success",
        locationRaw: "Remote U.S.",
        url: "https://jobs.ashbyhq.com/vanta/50d231e8-8b16-4733-8d09-ec7d3c117e4e",
      }),
      createSource({
        id: "link_10",
        rawJobListingId: "raw_10",
        sourceType: SourceType.ASHBY,
        titleRaw: "Partner Customer Success Manager",
        locationRaw: "Remote U.S.",
        precedenceRank: 2,
        isCanonicalSource: false,
        url: "https://jobs.ashbyhq.com/vanta/aec48784-9d51-417a-a700-c0eec2460597",
        mergeRationaleJson: {
          rule: "fuzzy_title_location",
          confidence: 1,
          matchedOn: ["normalized_company_name", "title_similarity", "location_or_remote_compatibility"],
          clusterConfidence: 1,
        },
      }),
    ],
  });

  const scored = await scoreCanonicalJob(job, {
    endpointChecker: async () => ({ status: "ACTIVE", statusCode: 200 }),
    now: new Date("2026-03-12T12:00:00.000Z"),
  });

  assert.equal(scored.flags.fuzzyCluster, false);
  assert.equal(scored.flags.inconsistentTitle, false);
  assert.ok(
    !scored.reasons.priorityReasons.includes("Cluster disagreement lowers priority until the listing is reviewed."),
  );
});

function createCanonicalJobRecord(
  overrides: Partial<Record<string, unknown>> = {},
): CanonicalJobRecord {
  return {
    id: "job_1",
    canonicalTitle: "Platform Engineer",
    canonicalCompanyId: "company_1",
    canonicalCompany: {
      id: "company_1",
      displayName: "Acme",
      normalizedName: "acme",
      primaryDomain: null,
      primaryDomainConfidence: null,
      careersUrl: null,
      careersUrlConfidence: null,
      enrichmentEvidenceJson: null,
      metadataJson: null,
      createdAt: new Date("2026-03-10T00:00:00.000Z"),
      updatedAt: new Date("2026-03-10T00:00:00.000Z"),
    },
    canonicalLocation: "Chicago, IL",
    remoteType: RemoteType.HYBRID,
    employmentType: EmploymentType.FULL_TIME,
    salaryCurrency: "USD",
    salaryMin: 180000,
    salaryMax: 220000,
    descriptionText: "Build trusted systems.".repeat(30),
    searchSummary: "Build trusted systems.",
    officialSourceUrl: "https://jobs.lever.co/acme/platform-engineer",
    officialSourceConfidence: 0.9,
    officialSourceMethod: "source_canonical_hint",
    officialSourceEvidenceJson: null,
    firstSeenAt: new Date("2026-03-10T00:00:00.000Z"),
    lastSeenAt: new Date("2026-03-12T00:00:00.000Z"),
    repostCount: 0,
    currentStatus: CanonicalJobStatus.ACTIVE,
    sources: [createSource()],
    snapshots: [],
    scores: [],
    savedJobs: [],
    createdAt: new Date("2026-03-10T00:00:00.000Z"),
    updatedAt: new Date("2026-03-12T00:00:00.000Z"),
    ...overrides,
  } as CanonicalJobRecord;
}

function createSource(
  overrides: Partial<Record<string, unknown>> = {},
): CanonicalJobRecord["sources"][number] {
  const sourceId = typeof overrides.id === "string" ? overrides.id : "link_1";
  const rawJobListingId = typeof overrides.rawJobListingId === "string" ? overrides.rawJobListingId : "raw_1";
  const sourceType = (overrides.sourceType as SourceType | undefined) ?? SourceType.LEVER;
  const sourceTrustLevel = (overrides.sourceTrustLevel as SourceTrustLevel | undefined) ?? SourceTrustLevel.HIGH;
  const titleRaw = (overrides.titleRaw as string | undefined) ?? "Platform Engineer";
  const companyNameRaw = (overrides.companyNameRaw as string | undefined) ?? "Acme";
  const locationRaw = (overrides.locationRaw as string | undefined) ?? "Chicago, IL";
  const isActive = (overrides.isActive as boolean | undefined) ?? true;
  const sourceUrl = (overrides.url as string | undefined) ?? "https://jobs.lever.co/acme/platform-engineer";
  const postedAtRaw = (overrides.postedAtRaw as string | undefined) ?? "2026-03-10T00:00:00.000Z";
  const linkConfidence = (overrides.linkConfidence as number | undefined) ?? 0.98;
  const precedenceRank = (overrides.precedenceRank as number | undefined) ?? 1;
  const isCanonicalSource = (overrides.isCanonicalSource as boolean | undefined) ?? true;
  const mergeRationaleJson: Prisma.JsonValue =
    (overrides.mergeRationaleJson as Prisma.JsonValue | undefined) ?? {
      rule: "official_source_url",
      confidence: 0.98,
      matchedOn: ["official_source_url"],
      clusterConfidence: 0.98,
    };
  const payloadJson: Prisma.JsonValue =
    (overrides.payloadJson as Prisma.JsonValue | undefined) ?? {
      normalized: {
        canonicalHints: {
          officialSourceUrl: sourceUrl,
        },
      },
    };

  return {
    id: sourceId,
    canonicalJobId: "job_1",
    rawJobListingId,
    linkConfidence,
    precedenceRank,
    isCanonicalSource,
    mergeRationaleJson,
    createdAt: new Date("2026-03-10T00:00:00.000Z"),
    rawJobListing: {
      id: rawJobListingId,
      sourceId: "src_1",
      externalJobId: "123",
      url: sourceUrl,
      titleRaw,
      companyNameRaw,
      locationRaw,
      remoteTypeRaw: RemoteType.HYBRID,
      employmentTypeRaw: EmploymentType.FULL_TIME,
      salaryRaw: "$180,000 - $220,000",
      descriptionRaw: "Build trusted systems.".repeat(10),
      postedAtRaw,
      firstSeenAt: new Date("2026-03-10T00:00:00.000Z"),
      lastSeenAt: new Date("2026-03-12T00:00:00.000Z"),
      isActive,
      parseConfidence: 0.95,
      payloadJson,
      contentHash: "hash_1",
      createdAt: new Date("2026-03-10T00:00:00.000Z"),
      updatedAt: new Date("2026-03-12T00:00:00.000Z"),
      source: {
        id: "src_1",
        sourceType,
        sourceName: "lever:acme",
        baseUrl: "https://jobs.lever.co/acme",
        trustLevel: sourceTrustLevel,
        metadataJson: null,
        createdAt: new Date("2026-03-10T00:00:00.000Z"),
        updatedAt: new Date("2026-03-12T00:00:00.000Z"),
      },
    },
    ...overrides,
  } as CanonicalJobRecord["sources"][number];
}
