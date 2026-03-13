import assert from "node:assert/strict";
import test from "node:test";

import {
  EmploymentType,
  RemoteType,
  SourceTrustLevel,
  SourceType,
} from "@anti-ghost/database";

import {
  buildCanonicalClusters,
  createCanonicalizationBatches,
  filterReusableCanonicalJobIds,
  normalizeCompanyName,
  normalizeJobTitle,
  normalizeLocation,
  shouldBatchLocalSingleConnectionCanonicalize,
  type CanonicalizationListing,
} from "./canonicalization";

test("normalization helpers collapse common company, title, and location variants", () => {
  assert.equal(normalizeCompanyName("Acme, Inc."), "acme");
  assert.equal(normalizeJobTitle("Sr. Data Platform Engineer"), "senior data platform engineer");
  assert.equal(normalizeLocation("Remote (United States)"), "remote us");
});

test("buildCanonicalClusters hard-matches listings that share an official source url", () => {
  const careersListing = createListing({
    rawJobListingId: "raw_company",
    sourceType: SourceType.COMPANY_CAREERS,
    sourceName: "company:acme",
    officialSourceUrl: "https://careers.acme.com/jobs/platform-engineer",
    url: "https://careers.acme.com/jobs/platform-engineer?utm_source=test",
    parseConfidence: 0.82,
  });
  const greenhouseListing = createListing({
    rawJobListingId: "raw_greenhouse",
    sourceType: SourceType.GREENHOUSE,
    sourceName: "greenhouse:acme",
    officialSourceUrl: "https://careers.acme.com/jobs/platform-engineer",
    url: "https://boards.greenhouse.io/acme/jobs/123",
    parseConfidence: 0.96,
  });

  const clusters = buildCanonicalClusters([greenhouseListing, careersListing]);

  assert.equal(clusters.length, 1);
  assert.equal(clusters[0]?.canonicalSourceListingId, "raw_company");
  assert.equal(clusters[0]?.members.length, 2);
  assert.equal(clusters[0]?.members[1]?.rationale.rule, "official_source_url");
});

test("buildCanonicalClusters fuzzy-matches close role variants for the same company", () => {
  const one = createListing({
    rawJobListingId: "raw_one",
    title: "Senior Product Analyst",
    location: "Remote (US)",
    remoteType: RemoteType.REMOTE,
  });
  const two = createListing({
    rawJobListingId: "raw_two",
    title: "Sr Product Analyst",
    location: "Remote - US",
    remoteType: RemoteType.REMOTE,
  });

  const clusters = buildCanonicalClusters([one, two]);

  assert.equal(clusters.length, 1);
  assert.equal(clusters[0]?.members.length, 2);
  assert.equal(clusters[0]?.members[1]?.rationale.rule, "fuzzy_title_location");
  assert.ok((clusters[0]?.clusterConfidence ?? 0) >= 0.9);
});

test("buildCanonicalClusters does not merge different jobs at the same company", () => {
  const analyst = createListing({
    rawJobListingId: "raw_analyst",
    title: "Senior Product Analyst",
  });
  const engineer = createListing({
    rawJobListingId: "raw_engineer",
    title: "Platform Engineer",
  });

  const clusters = buildCanonicalClusters([analyst, engineer]);

  assert.equal(clusters.length, 2);
});

test("buildCanonicalClusters does not fuzzy-merge exact-title jobs across clearly different locations without a hard id", () => {
  const europe = createListing({
    rawJobListingId: "raw_europe",
    sourceType: SourceType.ASHBY,
    sourceName: "ashby:linear",
    title: "Product Manager",
    location: "Europe",
    remoteType: RemoteType.REMOTE,
  });
  const northAmerica = createListing({
    rawJobListingId: "raw_north_america",
    sourceType: SourceType.ASHBY,
    sourceName: "ashby:linear",
    title: "Product Manager",
    location: "North America",
    remoteType: RemoteType.REMOTE,
  });

  const clusters = buildCanonicalClusters([europe, northAmerica]);

  assert.equal(clusters.length, 2);
});

test("buildCanonicalClusters ignores generic requisition labels that are not real identifiers", () => {
  const accountExecutive = createListing({
    rawJobListingId: "raw_account_exec",
    title: "Account Executive, Commercial",
    location: "Austin, TX",
    requisitionId: "Pipeline",
  });
  const engineeringManager = createListing({
    rawJobListingId: "raw_engineering_manager",
    title: "Engineering Manager, AI Product",
    location: "San Francisco, CA",
    requisitionId: "Pipeline",
  });

  const clusters = buildCanonicalClusters([accountExecutive, engineeringManager]);

  assert.equal(clusters.length, 2);
});

test("filterReusableCanonicalJobIds prevents one prior canonical id from being reused across split clusters", () => {
  const reusable = filterReusableCanonicalJobIds(["canonical_old", "canonical_other"], new Set(["canonical_old"]));

  assert.deepEqual(reusable, ["canonical_other"]);
});

test("buildCanonicalClusters does not hard-match same internal job id when titles differ", () => {
  const infrastructure = createListing({
    rawJobListingId: "raw_infrastructure",
    sourceType: SourceType.GREENHOUSE,
    sourceName: "greenhouse:airtable",
    title: "Software Engineer, Infrastructure (2-8 YOE)",
    location: "San Francisco, CA; New York, NY; Remote - US (Seattle, WA only)",
    internalJobId: 6353650002,
  });
  const observability = createListing({
    rawJobListingId: "raw_observability",
    sourceType: SourceType.GREENHOUSE,
    sourceName: "greenhouse:airtable",
    title: "Software Engineer, Observability",
    location: "San Francisco, CA; New York, NY; Remote (Seattle, WA only)",
    internalJobId: 6353650002,
  });

  const clusters = buildCanonicalClusters([infrastructure, observability]);

  assert.equal(clusters.length, 2);
});

test("buildCanonicalClusters does not fuzzy-merge internship and non-internship titles", () => {
  const generalApplication = createListing({
    rawJobListingId: "raw_general_application",
    sourceType: SourceType.GREENHOUSE,
    sourceName: "greenhouse:chainguard",
    title: "Submitting for a General Application",
    location: "United States - Remote",
    remoteType: RemoteType.REMOTE,
  });
  const generalInternship = createListing({
    rawJobListingId: "raw_general_internship",
    sourceType: SourceType.GREENHOUSE,
    sourceName: "greenhouse:chainguard",
    title: "Submitting for a General Internship Application",
    location: "United States - Remote",
    remoteType: RemoteType.REMOTE,
  });

  const clusters = buildCanonicalClusters([generalApplication, generalInternship]);

  assert.equal(clusters.length, 2);
});

test("buildCanonicalClusters does not fuzzy-merge protected title qualifiers like AI or experience bands", () => {
  const productEngineer = createListing({
    rawJobListingId: "raw_product_engineer",
    sourceType: SourceType.ASHBY,
    sourceName: "ashby:linear",
    title: "Senior / Staff Product Engineer",
    location: "North America",
    remoteType: RemoteType.REMOTE,
  });
  const productEngineerAi = createListing({
    rawJobListingId: "raw_product_engineer_ai",
    sourceType: SourceType.ASHBY,
    sourceName: "ashby:linear",
    title: "Senior / Staff Product Engineer, AI",
    location: "North America",
    remoteType: RemoteType.REMOTE,
  });
  const infrastructureTwoToEight = createListing({
    rawJobListingId: "raw_infra_two_to_eight",
    sourceType: SourceType.GREENHOUSE,
    sourceName: "greenhouse:airtable",
    title: "Software Engineer, Infrastructure (2-8 YOE)",
    location: "San Francisco, CA; New York, NY; Remote - US (Seattle, WA only)",
    remoteType: RemoteType.REMOTE,
  });
  const infrastructureEightPlus = createListing({
    rawJobListingId: "raw_infra_eight_plus",
    sourceType: SourceType.GREENHOUSE,
    sourceName: "greenhouse:airtable",
    title: "Software Engineer, Infrastructure (8+ YOE)",
    location: "San Francisco, CA; New York, NY; Remote - US (Seattle, WA only)",
    remoteType: RemoteType.REMOTE,
  });

  assert.equal(buildCanonicalClusters([productEngineer, productEngineerAi]).length, 2);
  assert.equal(buildCanonicalClusters([infrastructureTwoToEight, infrastructureEightPlus]).length, 2);
});

test("buildCanonicalClusters does not fuzzy-merge seniority or title-segment variants", () => {
  const insideSales = createListing({
    rawJobListingId: "raw_inside_sales",
    sourceType: SourceType.GREENHOUSE,
    sourceName: "greenhouse:figma",
    title: "Inside Sales Representative (Tokyo, Japan)",
    location: "Tokyo, Japan",
  });
  const seniorInsideSales = createListing({
    rawJobListingId: "raw_senior_inside_sales",
    sourceType: SourceType.GREENHOUSE,
    sourceName: "greenhouse:figma",
    title: "Senior Inside Sales Representative (Tokyo, Japan)",
    location: "Tokyo, Japan",
  });
  const customerSuccessCommercial = createListing({
    rawJobListingId: "raw_csm_commercial",
    sourceType: SourceType.ASHBY,
    sourceName: "ashby:vanta",
    title: "Customer Success Manager (Commercial) - EMEA",
    location: "London, UK",
    remoteType: RemoteType.HYBRID,
  });
  const customerSuccessManager = createListing({
    rawJobListingId: "raw_manager_customer_success",
    sourceType: SourceType.ASHBY,
    sourceName: "ashby:vanta",
    title: "Manager, Customer Success - EMEA",
    location: "London, UK",
    remoteType: RemoteType.HYBRID,
  });

  assert.equal(buildCanonicalClusters([insideSales, seniorInsideSales]).length, 2);
  assert.equal(buildCanonicalClusters([customerSuccessCommercial, customerSuccessManager]).length, 2);
});

test("buildCanonicalClusters does not fuzzy-merge acronym-qualified title variants", () => {
  const peopleBusinessPartnerGtm = createListing({
    rawJobListingId: "raw_people_partner_gtm",
    sourceType: SourceType.ASHBY,
    sourceName: "ashby:vanta",
    title: "Senior People Business Partner, GTM",
    location: "Remote U.S.",
    remoteType: RemoteType.REMOTE,
  });
  const peopleBusinessPartnerGa = createListing({
    rawJobListingId: "raw_people_partner_ga",
    sourceType: SourceType.ASHBY,
    sourceName: "ashby:vanta",
    title: "Senior People Business Partner, G&A",
    location: "Remote U.S.",
    remoteType: RemoteType.REMOTE,
  });
  const itAvOperations = createListing({
    rawJobListingId: "raw_it_av",
    sourceType: SourceType.ASHBY,
    sourceName: "ashby:vanta",
    title: "IT/AV Operations Engineer, Corporate Engineering",
    location: "San Francisco, CA",
  });
  const itOperations = createListing({
    rawJobListingId: "raw_it",
    sourceType: SourceType.ASHBY,
    sourceName: "ashby:vanta",
    title: "IT Operations Engineer, Corporate Engineering",
    location: "San Francisco, CA",
  });

  assert.equal(buildCanonicalClusters([peopleBusinessPartnerGtm, peopleBusinessPartnerGa]).length, 2);
  assert.equal(buildCanonicalClusters([itAvOperations, itOperations]).length, 2);
});

test("createCanonicalizationBatches keeps companies together while splitting larger local runs into smaller batches", () => {
  const listings = [
    createListing({ rawJobListingId: "cursor-1", companyName: "Cursor" }),
    createListing({ rawJobListingId: "cursor-2", companyName: "Cursor" }),
    createListing({ rawJobListingId: "linear-1", companyName: "Linear" }),
    createListing({ rawJobListingId: "linear-2", companyName: "Linear" }),
    createListing({ rawJobListingId: "airtable-1", companyName: "Airtable" }),
  ];

  const batches = createCanonicalizationBatches(listings, 3);

  assert.equal(batches.length, 2);
  assert.deepEqual(
    batches.map((batch) => batch.map((listing) => listing.normalized.companyName)),
    [
      ["cursor", "cursor"],
      ["linear", "linear", "airtable"],
    ],
  );
});

test("shouldBatchLocalSingleConnectionCanonicalize only batches larger local single-connection runs", () => {
  assert.equal(
    shouldBatchLocalSingleConnectionCanonicalize(
      "postgresql://postgres:postgres@127.0.0.1:5433/anti_ghost_jobs_eval?schema=public&connection_limit=1",
      501,
    ),
    true,
  );
  assert.equal(
    shouldBatchLocalSingleConnectionCanonicalize(
      "postgresql://postgres:postgres@127.0.0.1:5433/anti_ghost_jobs_eval?schema=public&connection_limit=1",
      500,
    ),
    false,
  );
  assert.equal(
    shouldBatchLocalSingleConnectionCanonicalize(
      "postgresql://postgres:postgres@127.0.0.1:5432/anti_ghost_jobs?schema=public",
      800,
    ),
    false,
  );
});

function createListing(overrides: Partial<CanonicalizationListing> = {}): CanonicalizationListing {
  const companyName = overrides.companyName ?? "Acme";
  const title = overrides.title ?? "Platform Engineer";
  const location = overrides.location ?? "Chicago, IL";
  const officialSourceUrl = overrides.officialSourceUrl ?? null;

  return {
    rawJobListingId: overrides.rawJobListingId ?? "raw_default",
    sourceId: overrides.sourceId ?? "src_default",
    sourceType: overrides.sourceType ?? SourceType.GREENHOUSE,
    sourceName: overrides.sourceName ?? "greenhouse:acme",
    sourceTrustLevel: overrides.sourceTrustLevel ?? SourceTrustLevel.HIGH,
    sourceBaseUrl: overrides.sourceBaseUrl ?? "https://boards.greenhouse.io/acme",
    externalJobId: overrides.externalJobId ?? "123",
    url: overrides.url ?? "https://boards.greenhouse.io/acme/jobs/123",
    title,
    companyName,
    location,
    remoteType: overrides.remoteType ?? RemoteType.HYBRID,
    employmentType: overrides.employmentType ?? EmploymentType.FULL_TIME,
    salary: overrides.salary ?? null,
    descriptionRaw: overrides.descriptionRaw ?? "Build trusted job search infrastructure.",
    firstSeenAt: overrides.firstSeenAt ?? new Date("2026-03-10T00:00:00.000Z"),
    lastSeenAt: overrides.lastSeenAt ?? new Date("2026-03-12T00:00:00.000Z"),
    isActive: overrides.isActive ?? true,
    parseConfidence: overrides.parseConfidence ?? 0.9,
    contentHash: overrides.contentHash ?? "hash_1",
    officialSourceUrl,
    requisitionId: overrides.requisitionId ?? null,
    internalJobId: overrides.internalJobId ?? null,
    departmentNames: overrides.departmentNames ?? [],
    officeNames: overrides.officeNames ?? [],
    existingCanonicalJobIds: overrides.existingCanonicalJobIds ?? [],
    normalized: overrides.normalized ?? {
      companyName: normalizeCompanyName(companyName),
      title: normalizeJobTitle(title),
      location: normalizeLocation(location),
      officialSourceUrl: officialSourceUrl,
    },
  };
}
