import assert from "node:assert/strict";
import test from "node:test";

import {
  CanonicalJobStatus,
  EmploymentType,
  RemoteType,
  SourceTrustLevel,
  SourceType,
} from "@anti-ghost/database";

import {
  deriveCompanySignals,
  loadCompaniesForEnrichment,
  officialSourceMethods,
  parseCompanyEnrichmentSeedMap,
  resolveOfficialSourceForJob,
  type PageFetchResult,
} from "./company-enrichment";

type CompanyRecord = Awaited<ReturnType<typeof loadCompaniesForEnrichment>>[number];

test("deriveCompanySignals discovers careers urls and ATS links from official company pages", async () => {
  const company = createCompanyRecord();
  const pages = new Map<string, PageFetchResult>([
    [
      "https://beaconanalytics.example/",
      {
        url: "https://beaconanalytics.example/",
        finalUrl: "https://beaconanalytics.example/",
        status: 200,
        html: `
          <html>
            <body>
              <a href="/careers">Careers</a>
              <a href="https://boards.greenhouse.io/beaconanalytics">Open roles</a>
            </body>
          </html>
        `,
      },
    ],
    [
      "https://beaconanalytics.example/careers",
      {
        url: "https://beaconanalytics.example/careers",
        finalUrl: "https://beaconanalytics.example/careers",
        status: 200,
        html: `
          <html>
            <body>
              <a href="https://boards.greenhouse.io/beaconanalytics">Engineering roles</a>
            </body>
          </html>
        `,
      },
    ],
  ]);

  const signals = await deriveCompanySignals(company, async (url) => {
    return pages.get(url) ?? {
      url,
      finalUrl: url,
      status: 404,
      html: null,
    };
  });

  assert.equal(signals.primaryDomain, "beaconanalytics.example");
  assert.equal(signals.careersUrl, "https://beaconanalytics.example/careers");
  assert.equal(signals.careersUrlSource, "company_page_link");
  assert.ok(signals.atsLinks.includes("https://boards.greenhouse.io/beaconanalytics"));
  assert.equal(signals.atsBoardRoot, null);
});

test("resolveOfficialSourceForJob backfills an ATS posting only when the company page confirms the board", () => {
  const company = createCompanyRecord();
  const job = company.canonicalJobs[0] as CompanyRecord["canonicalJobs"][number];

  const resolution = resolveOfficialSourceForJob(job, company, {
    primaryDomain: "beaconanalytics.example",
    primaryDomainConfidence: 0.97,
    careersUrl: "https://beaconanalytics.example/careers",
    careersUrlConfidence: 0.88,
    careersUrlSource: "company_page_link",
    careersKeywordLink: "https://beaconanalytics.example/careers",
    atsLinks: ["https://boards.greenhouse.io/beaconanalytics"],
    atsBoardRoot: "https://boards.greenhouse.io/beaconanalytics",
    atsBoardRootConfidence: 0.83,
    atsBoardRootEvidence: {
      rootUrl: "https://boards.greenhouse.io/beaconanalytics",
      supportCount: 1,
      sourceTypes: [SourceType.GREENHOUSE],
    },
    pageEvidence: [],
    domainEvidence: {
      source: "existing_primary_domain",
      value: "beaconanalytics.example",
    },
  });

  assert.equal(resolution?.url, "https://boards.greenhouse.io/beaconanalytics/jobs/200");
  assert.equal(resolution?.method, officialSourceMethods.companyLinkedAtsBoard);
  assert.ok((resolution?.confidence ?? 0) >= 0.9);
});

test("resolveOfficialSourceForJob falls back to a company careers page when board verification is unavailable", () => {
  const company = createCompanyRecord();
  const job = company.canonicalJobs[0] as CompanyRecord["canonicalJobs"][number];

  const resolution = resolveOfficialSourceForJob(job, company, {
    primaryDomain: "beaconanalytics.example",
    primaryDomainConfidence: 0.97,
    careersUrl: "https://beaconanalytics.example/careers",
    careersUrlConfidence: 0.84,
    careersUrlSource: "company_page_link",
    careersKeywordLink: "https://beaconanalytics.example/careers",
    atsLinks: [],
    atsBoardRoot: null,
    atsBoardRootConfidence: null,
    atsBoardRootEvidence: null,
    pageEvidence: [],
    domainEvidence: {
      source: "existing_primary_domain",
      value: "beaconanalytics.example",
    },
  });

  assert.equal(resolution?.url, "https://beaconanalytics.example/careers");
  assert.equal(resolution?.method, officialSourceMethods.companyCareersPage);
});

test("resolveOfficialSourceForJob does not treat an inferred ATS board root as a generic careers-page fallback", () => {
  const company = createCompanyRecord({
    displayName: "Dnb",
    normalizedName: "dnb",
    primaryDomain: "dnb.com",
    careersUrl: null,
    careersUrlConfidence: null,
    sources: [
      createSource({
        url: "https://jobs.lever.co/dnb/0402a2b9-1b05-4179-a4a9-758c68b80b55",
        sourceType: SourceType.LEVER,
        sourceName: "lever:dnb",
      }),
    ],
  });
  const job = company.canonicalJobs[0] as CompanyRecord["canonicalJobs"][number];

  const resolution = resolveOfficialSourceForJob(job, company, {
    primaryDomain: "dnb.com",
    primaryDomainConfidence: 0.99,
    careersUrl: "https://jobs.lever.co/dnb",
    careersUrlConfidence: 0.83,
    careersUrlSource: "trusted_ats_board_root",
    careersKeywordLink: null,
    atsLinks: [],
    atsBoardRoot: "https://jobs.lever.co/dnb",
    atsBoardRootConfidence: 0.83,
    atsBoardRootEvidence: {
      rootUrl: "https://jobs.lever.co/dnb",
      supportCount: 2,
      sourceTypes: [SourceType.LEVER],
    },
    pageEvidence: [],
    domainEvidence: {
      source: "existing_primary_domain",
      value: "dnb.com",
    },
  });

  assert.equal(resolution, null);
});

test("resolveOfficialSourceForJob records a distinct method when verification comes from a trusted ATS board root", () => {
  const company = createCompanyRecord({
    displayName: "Dnb",
    normalizedName: "dnb",
    primaryDomain: "dnb.com",
    careersUrl: null,
    careersUrlConfidence: null,
    sources: [
      createSource({
        url: "https://jobs.lever.co/dnb/0402a2b9-1b05-4179-a4a9-758c68b80b55",
        sourceType: SourceType.LEVER,
        sourceName: "lever:dnb",
      }),
    ],
  });
  const job = company.canonicalJobs[0] as CompanyRecord["canonicalJobs"][number];

  const resolution = resolveOfficialSourceForJob(job, company, {
    primaryDomain: "dnb.com",
    primaryDomainConfidence: 0.99,
    careersUrl: "https://jobs.lever.co/dnb",
    careersUrlConfidence: 0.83,
    careersUrlSource: "trusted_ats_board_root",
    careersKeywordLink: null,
    atsLinks: ["https://jobs.lever.co/dnb/0402a2b9-1b05-4179-a4a9-758c68b80b55"],
    atsBoardRoot: "https://jobs.lever.co/dnb",
    atsBoardRootConfidence: 0.83,
    atsBoardRootEvidence: {
      rootUrl: "https://jobs.lever.co/dnb",
      supportCount: 2,
      sourceTypes: [SourceType.LEVER],
    },
    pageEvidence: [],
    domainEvidence: {
      source: "existing_primary_domain",
      value: "dnb.com",
    },
  });

  assert.equal(resolution?.method, officialSourceMethods.trustedAtsBoardRoot);
  assert.equal(resolution?.confidence, 0.92);
});

test("deriveCompanySignals uses curated seeds for unresolved companies", async () => {
  const company = createCompanyRecord({
    primaryDomain: null,
    primaryDomainConfidence: null,
    careersUrl: null,
    careersUrlConfidence: null,
    sources: [
      createSource({
        url: "https://jobs.ashbyhq.com/cursor/123",
        sourceType: SourceType.ASHBY,
        sourceName: "ashby:cursor",
      }),
    ],
  });
  const pages = new Map<string, PageFetchResult>([
    [
      "https://cursor.com/",
      {
        url: "https://cursor.com/",
        finalUrl: "https://cursor.com/",
        status: 200,
        html: `<html><body><a href="/careers">Careers</a></body></html>`,
      },
    ],
    [
      "https://cursor.com/careers",
      {
        url: "https://cursor.com/careers",
        finalUrl: "https://cursor.com/careers",
        status: 200,
        html: `<html><body><a href="https://jobs.ashbyhq.com/cursor">Open roles</a></body></html>`,
      },
    ],
  ]);
  const seeds = parseCompanyEnrichmentSeedMap({
    companies: [
      {
        normalizedName: "beacon analytics",
        primaryDomain: "cursor.com",
        careersUrl: "https://cursor.com/careers",
      },
    ],
  });

  const signals = await deriveCompanySignals(
    company,
    async (url) =>
      pages.get(url) ?? {
        url,
        finalUrl: url,
        status: 404,
        html: null,
      },
    seeds.get(company.normalizedName) ?? null,
  );

  assert.equal(signals.primaryDomain, "cursor.com");
  assert.equal(signals.primaryDomainConfidence, 0.99);
  assert.equal(signals.careersUrl, "https://cursor.com/careers");
  assert.equal(signals.careersUrlSource, "curated_company_seed");
  assert.ok(signals.atsLinks.includes("https://jobs.ashbyhq.com/cursor"));
  assert.deepEqual(signals.domainEvidence, {
    source: "curated_company_seed",
    value: "cursor.com",
  });
});

test("deriveCompanySignals falls back to a trusted ATS board root when company-page discovery is unavailable", async () => {
  const company = createCompanyRecord({
    displayName: "Dnb",
    normalizedName: "dnb",
    primaryDomain: "dnb.com",
    careersUrl: null,
    careersUrlConfidence: null,
    sources: [
      createSource({
        url: "https://jobs.lever.co/dnb/0402a2b9-1b05-4179-a4a9-758c68b80b55",
        sourceType: SourceType.LEVER,
        sourceName: "lever:dnb",
      }),
      createSource({
        url: "https://jobs.lever.co/dnb/050c43b7-e726-4edd-a903-fd559648bfd9",
        sourceType: SourceType.LEVER,
        sourceName: "lever:dnb",
        isCanonicalSource: false,
        id: "link_2",
        rawJobListingId: "raw_2",
      }),
    ],
  });

  const signals = await deriveCompanySignals(company, async (url) => ({
    url,
    finalUrl: url,
    status: null,
    html: null,
  }));

  assert.equal(signals.careersUrl, "https://jobs.lever.co/dnb");
  assert.equal(signals.careersUrlSource, "trusted_ats_board_root");
  assert.equal(signals.careersUrlConfidence, 0.83);
  assert.equal(signals.atsBoardRoot, "https://jobs.lever.co/dnb");
  assert.deepEqual(signals.atsBoardRootEvidence, {
    rootUrl: "https://jobs.lever.co/dnb",
    supportCount: 2,
    sourceTypes: [SourceType.LEVER],
  });
});

test("deriveCompanySignals preserves a previously stored trusted ATS board-root careers source", async () => {
  const company = createCompanyRecord({
    displayName: "Dnb",
    normalizedName: "dnb",
    primaryDomain: "dnb.com",
    careersUrl: "https://jobs.lever.co/dnb",
    careersUrlConfidence: 0.83,
    sources: [
      createSource({
        url: "https://jobs.lever.co/dnb/0402a2b9-1b05-4179-a4a9-758c68b80b55",
        sourceType: SourceType.LEVER,
        sourceName: "lever:dnb",
      }),
      createSource({
        url: "https://jobs.lever.co/dnb/050c43b7-e726-4edd-a903-fd559648bfd9",
        sourceType: SourceType.LEVER,
        sourceName: "lever:dnb",
        isCanonicalSource: false,
        id: "link_3",
        rawJobListingId: "raw_3",
      }),
    ],
  });
  company.enrichmentEvidenceJson = {
    careersUrl: "https://jobs.lever.co/dnb",
    careersUrlSource: "trusted_ats_board_root",
  };

  const signals = await deriveCompanySignals(company, async (url) => ({
    url,
    finalUrl: url,
    status: null,
    html: null,
  }));

  assert.equal(signals.careersUrlSource, "trusted_ats_board_root");
  assert.equal(signals.careersUrlConfidence, 0.83);
});

function createCompanyRecord(
  overrides: Partial<{
    primaryDomain: string | null;
    primaryDomainConfidence: number | null;
    careersUrl: string | null;
    careersUrlConfidence: number | null;
    displayName: string;
    normalizedName: string;
    sources: CompanyRecord["canonicalJobs"][number]["sources"];
  }> = {},
): CompanyRecord {
  const hasOverride = <TKey extends keyof typeof overrides>(key: TKey) =>
    Object.prototype.hasOwnProperty.call(overrides, key);

  return {
    id: "company_1",
    displayName: overrides.displayName ?? "Beacon Analytics",
    normalizedName: overrides.normalizedName ?? "beacon analytics",
    primaryDomain: hasOverride("primaryDomain") ? overrides.primaryDomain ?? null : "beaconanalytics.example",
    primaryDomainConfidence: hasOverride("primaryDomainConfidence") ? overrides.primaryDomainConfidence ?? null : 0.97,
    careersUrl: hasOverride("careersUrl") ? overrides.careersUrl ?? null : null,
    careersUrlConfidence: hasOverride("careersUrlConfidence") ? overrides.careersUrlConfidence ?? null : null,
    enrichmentEvidenceJson: null,
    metadataJson: null,
    createdAt: new Date("2026-03-10T00:00:00.000Z"),
    updatedAt: new Date("2026-03-12T00:00:00.000Z"),
    canonicalJobs: [
      {
        id: "job_1",
        canonicalTitle: "Data Quality Analyst",
        canonicalCompanyId: "company_1",
        canonicalLocation: "Remote - US",
        remoteType: RemoteType.REMOTE,
        employmentType: EmploymentType.FULL_TIME,
        salaryCurrency: "USD",
        salaryMin: 110000,
        salaryMax: 135000,
        descriptionText: "Own data quality workflows.".repeat(15),
        searchSummary: "Seed ATS job.",
        officialSourceUrl: null,
        officialSourceConfidence: null,
        officialSourceMethod: null,
        officialSourceEvidenceJson: null,
        firstSeenAt: new Date("2026-03-07T00:00:00.000Z"),
        lastSeenAt: new Date("2026-03-12T00:00:00.000Z"),
        repostCount: 0,
        currentStatus: CanonicalJobStatus.ACTIVE,
        createdAt: new Date("2026-03-10T00:00:00.000Z"),
        updatedAt: new Date("2026-03-12T00:00:00.000Z"),
        snapshots: [],
        scores: [],
        savedJobs: [],
        sources: overrides.sources ?? [createSource()],
      },
    ],
  } as unknown as CompanyRecord;
}

function createSource(
  overrides: Partial<{
    id: string;
    rawJobListingId: string;
    url: string;
    sourceType: SourceType;
    sourceName: string;
    isCanonicalSource: boolean;
  }> = {},
): CompanyRecord["canonicalJobs"][number]["sources"][number] {
  return {
    id: "link_1",
    canonicalJobId: "job_1",
    rawJobListingId: "raw_1",
    linkConfidence: 0.94,
    precedenceRank: 1,
    isCanonicalSource: true,
    mergeRationaleJson: {
      rule: "internal_job_id",
      confidence: 0.94,
      matchedOn: ["external_job_id"],
      clusterConfidence: 0.94,
    },
    createdAt: new Date("2026-03-10T00:00:00.000Z"),
    rawJobListing: {
      id: "raw_1",
      sourceId: "source_1",
      externalJobId: "200",
      url: overrides.url ?? "https://boards.greenhouse.io/beaconanalytics/jobs/200",
      titleRaw: "Data Quality Analyst",
      companyNameRaw: "Beacon Analytics",
      locationRaw: "Remote - US",
      remoteTypeRaw: RemoteType.REMOTE,
      employmentTypeRaw: EmploymentType.FULL_TIME,
      salaryRaw: "$110,000 - $135,000",
      descriptionRaw: "Own data quality workflows.".repeat(15),
      postedAtRaw: "2026-03-07T00:00:00.000Z",
      firstSeenAt: new Date("2026-03-07T00:00:00.000Z"),
      lastSeenAt: new Date("2026-03-12T00:00:00.000Z"),
      isActive: true,
      parseConfidence: 0.94,
      payloadJson: {
        normalized: {
          canonicalHints: {
            officialSourceUrl: null,
          },
        },
      },
      contentHash: "hash_1",
      createdAt: new Date("2026-03-10T00:00:00.000Z"),
      updatedAt: new Date("2026-03-12T00:00:00.000Z"),
      source: {
        id: "source_1",
        sourceType: overrides.sourceType ?? SourceType.GREENHOUSE,
        sourceName: overrides.sourceName ?? "greenhouse:beaconanalytics",
        baseUrl: "https://boards.greenhouse.io/beaconanalytics",
        trustLevel: SourceTrustLevel.HIGH,
        metadataJson: null,
        createdAt: new Date("2026-03-10T00:00:00.000Z"),
        updatedAt: new Date("2026-03-12T00:00:00.000Z"),
      },
      canonicalLinks: [],
    },
  } as unknown as CompanyRecord["canonicalJobs"][number]["sources"][number];
}
