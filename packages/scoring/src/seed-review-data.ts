import {
  CanonicalJobStatus,
  EmploymentType,
  prisma,
  Prisma,
  type PrismaClient,
  RemoteType,
  SourceTrustLevel,
  SourceType,
} from "@anti-ghost/database";

import {
  loadCanonicalJobsForScoring,
  persistScoredJob,
  scoreCanonicalJob,
} from "./scoring";

type SeedEndpointResult = {
  status: "ACTIVE" | "INACTIVE" | "UNKNOWN";
  statusCode: number | null;
};

type SeedScenario = {
  key: string;
  canonicalJobId: string;
  reviewGoal: string;
  endpoint: SeedEndpointResult;
};

type SeedCompanyInput = Prisma.CompanyUncheckedCreateInput & { id: string };
type SeedSourceInput = Prisma.SourceUncheckedCreateInput & { id: string };
type SeedRawJobListingInput = Prisma.RawJobListingUncheckedCreateInput & { id: string; sourceId: string };
type SeedCanonicalJobInput = Prisma.CanonicalJobUncheckedCreateInput & { id: string };
type SeedCanonicalJobSourceInput = Prisma.CanonicalJobSourceUncheckedCreateInput & {
  id: string;
  canonicalJobId: string;
  rawJobListingId: string;
};

type ReviewSeedDataset = {
  companies: SeedCompanyInput[];
  sources: SeedSourceInput[];
  rawJobListings: SeedRawJobListingInput[];
  canonicalJobs: SeedCanonicalJobInput[];
  canonicalJobSources: SeedCanonicalJobSourceInput[];
  scenarios: SeedScenario[];
};

export type ReviewSeedSummary = {
  seededCompanies: number;
  seededSources: number;
  seededRawJobListings: number;
  seededCanonicalJobs: number;
  seededCanonicalJobSources: number;
  scoredJobs: Array<{
    id: string;
    scenario: string;
    title: string;
    trustLabel: string;
    freshnessLabel: string;
    priorityLabel: string;
  }>;
};

export async function seedReviewData(options: {
  db?: PrismaClient;
  now?: Date;
} = {}): Promise<ReviewSeedSummary> {
  const db = options.db ?? prisma;
  const now = options.now ?? new Date();
  const dataset = buildReviewSeedDataset(now);

  await clearExistingSeedData(db, dataset);

  for (const company of dataset.companies) {
    await db.company.upsert({
      where: { id: company.id },
      update: company,
      create: company,
    });
  }

  for (const source of dataset.sources) {
    await db.source.upsert({
      where: { id: source.id },
      update: source,
      create: source,
    });
  }

  for (const rawJobListing of dataset.rawJobListings) {
    await db.rawJobListing.upsert({
      where: { id: rawJobListing.id },
      update: rawJobListing,
      create: rawJobListing,
    });
  }

  for (const canonicalJob of dataset.canonicalJobs) {
    await db.canonicalJob.upsert({
      where: { id: canonicalJob.id },
      update: canonicalJob,
      create: canonicalJob,
    });
  }

  for (const link of dataset.canonicalJobSources) {
    await db.canonicalJobSource.upsert({
      where: { id: link.id },
      update: link,
      create: link,
    });
  }

  const jobs = await loadCanonicalJobsForScoring(
    db,
    dataset.canonicalJobs.map((job) => job.id),
  );
  const scenarioByJobId = new Map(dataset.scenarios.map((scenario) => [scenario.canonicalJobId, scenario]));
  const scoredJobs: ReviewSeedSummary["scoredJobs"] = [];

  for (const job of jobs) {
    const scenario = scenarioByJobId.get(job.id);
    const scoredJob = await scoreCanonicalJob(job, {
      now,
      endpointChecker: async () => scenario?.endpoint ?? { status: "UNKNOWN", statusCode: null },
    });

    await persistScoredJob(db, scoredJob);

    scoredJobs.push({
      id: job.id,
      scenario: scenario?.key ?? "unknown",
      title: job.canonicalTitle,
      trustLabel: scoredJob.trustLabel,
      freshnessLabel: scoredJob.freshnessLabel,
      priorityLabel: scoredJob.priorityLabel,
    });
  }

  return {
    seededCompanies: dataset.companies.length,
    seededSources: dataset.sources.length,
    seededRawJobListings: dataset.rawJobListings.length,
    seededCanonicalJobs: dataset.canonicalJobs.length,
    seededCanonicalJobSources: dataset.canonicalJobSources.length,
    scoredJobs,
  };
}

function buildReviewSeedDataset(now: Date): ReviewSeedDataset {
  const timestamp = now.toISOString();
  const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const companies: SeedCompanyInput[] = [
    {
      id: "seed_company_northstar",
      displayName: "Northstar Labs",
      normalizedName: "northstar labs",
      primaryDomain: "northstarlabs.example",
      primaryDomainConfidence: 0.99,
      careersUrl: "https://careers.northstarlabs.example/jobs",
      careersUrlConfidence: 0.97,
      enrichmentEvidenceJson: {
        primaryDomain: "northstarlabs.example",
        careersUrl: "https://careers.northstarlabs.example/jobs",
        domainEvidence: {
          source: "company_careers_source",
        },
      },
      metadataJson: { seedScenario: "official_new" },
    },
    {
      id: "seed_company_beacon",
      displayName: "Beacon Analytics",
      normalizedName: "beacon analytics",
      primaryDomain: "beaconanalytics.example",
      primaryDomainConfidence: 0.97,
      careersUrl: "https://beaconanalytics.example/careers",
      careersUrlConfidence: 0.88,
      enrichmentEvidenceJson: {
        primaryDomain: "beaconanalytics.example",
        careersUrl: "https://beaconanalytics.example/careers",
        atsLinks: [
          "https://boards.greenhouse.io/beaconanalytics",
          "https://jobs.lever.co/beaconanalytics",
        ],
        domainEvidence: {
          source: "existing_primary_domain",
        },
      },
      metadataJson: { seedScenario: "ats_only_missing_official" },
    },
    {
      id: "seed_company_harbor",
      displayName: "Lattice Harbor",
      normalizedName: "lattice harbor",
      primaryDomain: "latticeharbor.example",
      primaryDomainConfidence: 0.99,
      careersUrl: "https://jobs.latticeharbor.example",
      careersUrlConfidence: 0.95,
      enrichmentEvidenceJson: {
        primaryDomain: "latticeharbor.example",
        careersUrl: "https://jobs.latticeharbor.example",
      },
      metadataJson: { seedScenario: "old_but_active" },
    },
    {
      id: "seed_company_summit",
      displayName: "Summit Talent Network",
      normalizedName: "summit talent network",
      primaryDomain: null,
      careersUrl: null,
      metadataJson: { seedScenario: "mirror_stale" },
    },
    {
      id: "seed_company_orbit",
      displayName: "Orbit Commerce",
      normalizedName: "orbit commerce",
      primaryDomain: "orbitcommerce.example",
      primaryDomainConfidence: 0.96,
      careersUrl: "https://careers.orbitcommerce.example",
      careersUrlConfidence: 0.9,
      enrichmentEvidenceJson: {
        primaryDomain: "orbitcommerce.example",
        careersUrl: "https://careers.orbitcommerce.example",
        atsLinks: [
          "https://boards.greenhouse.io/orbitcommerce",
        ],
      },
      metadataJson: { seedScenario: "fuzzy_conflict" },
    },
  ];

  const sources: SeedSourceInput[] = [
    {
      id: "seed_source_northstar_greenhouse",
      sourceType: SourceType.GREENHOUSE,
      sourceName: "seed:greenhouse:northstar",
      baseUrl: "https://boards.greenhouse.io/northstarlabs",
      trustLevel: SourceTrustLevel.HIGH,
      metadataJson: { seedScenario: "official_new" },
    },
    {
      id: "seed_source_northstar_careers",
      sourceType: SourceType.COMPANY_CAREERS,
      sourceName: "seed:careers:northstar",
      baseUrl: "https://careers.northstarlabs.example",
      trustLevel: SourceTrustLevel.HIGH,
      metadataJson: { seedScenario: "official_new" },
    },
    {
      id: "seed_source_beacon_greenhouse",
      sourceType: SourceType.GREENHOUSE,
      sourceName: "seed:greenhouse:beacon",
      baseUrl: "https://boards.greenhouse.io/beaconanalytics",
      trustLevel: SourceTrustLevel.HIGH,
      metadataJson: { seedScenario: "ats_only_missing_official" },
    },
    {
      id: "seed_source_beacon_lever",
      sourceType: SourceType.LEVER,
      sourceName: "seed:lever:beacon",
      baseUrl: "https://jobs.lever.co/beaconanalytics",
      trustLevel: SourceTrustLevel.HIGH,
      metadataJson: { seedScenario: "ats_only_missing_official" },
    },
    {
      id: "seed_source_harbor_careers",
      sourceType: SourceType.COMPANY_CAREERS,
      sourceName: "seed:careers:harbor",
      baseUrl: "https://jobs.latticeharbor.example",
      trustLevel: SourceTrustLevel.HIGH,
      metadataJson: { seedScenario: "old_but_active" },
    },
    {
      id: "seed_source_summit_mirror",
      sourceType: SourceType.SUPPLEMENTAL,
      sourceName: "seed:mirror:summit",
      baseUrl: "https://jobs.summittalent.example",
      trustLevel: SourceTrustLevel.LOW,
      metadataJson: { seedScenario: "mirror_stale" },
    },
    {
      id: "seed_source_orbit_greenhouse",
      sourceType: SourceType.GREENHOUSE,
      sourceName: "seed:greenhouse:orbit",
      baseUrl: "https://boards.greenhouse.io/orbitcommerce",
      trustLevel: SourceTrustLevel.HIGH,
      metadataJson: { seedScenario: "fuzzy_conflict" },
    },
    {
      id: "seed_source_orbit_structured",
      sourceType: SourceType.STRUCTURED_PAGE,
      sourceName: "seed:structured:orbit",
      baseUrl: "https://jobs.orbitcommerce.example",
      trustLevel: SourceTrustLevel.MEDIUM,
      metadataJson: { seedScenario: "fuzzy_conflict" },
    },
  ];

  const rawJobListings: SeedRawJobListingInput[] = [
    createRawJobListing({
      id: "seed_raw_northstar_greenhouse",
      sourceId: "seed_source_northstar_greenhouse",
      externalJobId: "northstar-101",
      url: "https://boards.greenhouse.io/northstarlabs/jobs/101",
      titleRaw: "Senior Platform Engineer",
      companyNameRaw: "Northstar Labs",
      locationRaw: "Chicago, IL",
      remoteTypeRaw: RemoteType.HYBRID,
      employmentTypeRaw: EmploymentType.FULL_TIME,
      salaryRaw: "$185,000 - $220,000",
      descriptionRaw: "Build reliable internal platforms for analytics, identity, and job quality systems. ".repeat(24),
      postedAtRaw: daysAgo(2).toISOString(),
      firstSeenAt: daysAgo(2),
      lastSeenAt: daysAgo(0),
      isActive: true,
      parseConfidence: 0.98,
      payloadJson: {
        seedScenario: "official_new",
        normalized: {
          canonicalHints: {
            officialSourceUrl: "https://boards.greenhouse.io/northstarlabs/jobs/101",
          },
        },
      },
      contentHash: "seed-hash-northstar-greenhouse",
    }),
    createRawJobListing({
      id: "seed_raw_northstar_careers",
      sourceId: "seed_source_northstar_careers",
      externalJobId: "northstar-careers-101",
      url: "https://careers.northstarlabs.example/jobs/senior-platform-engineer",
      titleRaw: "Senior Platform Engineer",
      companyNameRaw: "Northstar Labs",
      locationRaw: "Chicago, IL",
      remoteTypeRaw: RemoteType.HYBRID,
      employmentTypeRaw: EmploymentType.FULL_TIME,
      salaryRaw: "$185,000 - $220,000",
      descriptionRaw: "Northstar Labs is hiring a senior platform engineer to own internal reliability tooling. ".repeat(18),
      postedAtRaw: daysAgo(1).toISOString(),
      firstSeenAt: daysAgo(1),
      lastSeenAt: daysAgo(0),
      isActive: true,
      parseConfidence: 0.95,
      payloadJson: {
        seedScenario: "official_new",
        normalized: {
          canonicalHints: {
            officialSourceUrl: "https://careers.northstarlabs.example/jobs/senior-platform-engineer",
          },
        },
      },
      contentHash: "seed-hash-northstar-careers",
    }),
    createRawJobListing({
      id: "seed_raw_beacon_greenhouse",
      sourceId: "seed_source_beacon_greenhouse",
      externalJobId: "beacon-200",
      url: "https://boards.greenhouse.io/beaconanalytics/jobs/200",
      titleRaw: "Data Quality Analyst",
      companyNameRaw: "Beacon Analytics",
      locationRaw: "Remote - US",
      remoteTypeRaw: RemoteType.REMOTE,
      employmentTypeRaw: EmploymentType.FULL_TIME,
      salaryRaw: "$110,000 - $135,000",
      descriptionRaw: "Own data quality alerts, SQL validation, and job-data auditing workflows. ".repeat(16),
      postedAtRaw: daysAgo(5).toISOString(),
      firstSeenAt: daysAgo(5),
      lastSeenAt: daysAgo(0),
      isActive: true,
      parseConfidence: 0.94,
      payloadJson: {
        seedScenario: "ats_only_missing_official",
        normalized: {
          canonicalHints: {
            officialSourceUrl: null,
          },
        },
      },
      contentHash: "seed-hash-beacon-greenhouse",
    }),
    createRawJobListing({
      id: "seed_raw_beacon_lever",
      sourceId: "seed_source_beacon_lever",
      externalJobId: "beacon-201",
      url: "https://jobs.lever.co/beaconanalytics/201",
      titleRaw: "Data Quality Analyst",
      companyNameRaw: "Beacon Analytics",
      locationRaw: "Remote - US",
      remoteTypeRaw: RemoteType.REMOTE,
      employmentTypeRaw: EmploymentType.FULL_TIME,
      salaryRaw: "$112,000 - $135,000",
      descriptionRaw: "Monitor trust regressions, investigate duplicate clusters, and support scoring QA. ".repeat(15),
      postedAtRaw: daysAgo(4).toISOString(),
      firstSeenAt: daysAgo(4),
      lastSeenAt: daysAgo(0),
      isActive: true,
      parseConfidence: 0.9,
      payloadJson: {
        seedScenario: "ats_only_missing_official",
        normalized: {
          canonicalHints: {
            officialSourceUrl: null,
          },
        },
      },
      contentHash: "seed-hash-beacon-lever",
    }),
    createRawJobListing({
      id: "seed_raw_harbor_careers",
      sourceId: "seed_source_harbor_careers",
      externalJobId: "harbor-301",
      url: "https://jobs.latticeharbor.example/senior-analytics-engineer",
      titleRaw: "Senior Analytics Engineer",
      companyNameRaw: "Lattice Harbor",
      locationRaw: "New York, NY",
      remoteTypeRaw: RemoteType.HYBRID,
      employmentTypeRaw: EmploymentType.FULL_TIME,
      salaryRaw: "$165,000 - $195,000",
      descriptionRaw: "Work across metrics engineering, experimentation data, and warehouse performance. ".repeat(18),
      postedAtRaw: daysAgo(65).toISOString(),
      firstSeenAt: daysAgo(65),
      lastSeenAt: daysAgo(1),
      isActive: true,
      parseConfidence: 0.97,
      payloadJson: {
        seedScenario: "old_but_active",
        normalized: {
          canonicalHints: {
            officialSourceUrl: "https://jobs.latticeharbor.example/senior-analytics-engineer",
          },
        },
      },
      contentHash: "seed-hash-harbor-careers",
    }),
    createRawJobListing({
      id: "seed_raw_summit_mirror_primary",
      sourceId: "seed_source_summit_mirror",
      externalJobId: "summit-401",
      url: "https://jobs.summittalent.example/listings/remote-customer-success-director",
      titleRaw: "Remote Customer Success Director",
      companyNameRaw: "Summit Talent Network",
      locationRaw: "Remote",
      remoteTypeRaw: RemoteType.REMOTE,
      employmentTypeRaw: EmploymentType.FULL_TIME,
      salaryRaw: null,
      descriptionRaw: "Immediate opening. Great culture.",
      postedAtRaw: daysAgo(90).toISOString(),
      firstSeenAt: daysAgo(90),
      lastSeenAt: daysAgo(28),
      isActive: false,
      parseConfidence: 0.58,
      payloadJson: {
        seedScenario: "mirror_stale",
        normalized: {
          canonicalHints: {
            officialSourceUrl: null,
          },
        },
      },
      contentHash: "seed-hash-summit-mirror-primary",
    }),
    createRawJobListing({
      id: "seed_raw_summit_mirror_secondary",
      sourceId: "seed_source_summit_mirror",
      externalJobId: "summit-402",
      url: "https://jobs.summittalent.example/listings/customer-success-director-2",
      titleRaw: "Customer Success Director",
      companyNameRaw: "Summit Talent Network",
      locationRaw: "Remote - US",
      remoteTypeRaw: RemoteType.REMOTE,
      employmentTypeRaw: EmploymentType.FULL_TIME,
      salaryRaw: null,
      descriptionRaw: "Fast hiring process. Apply today.",
      postedAtRaw: daysAgo(83).toISOString(),
      firstSeenAt: daysAgo(83),
      lastSeenAt: daysAgo(26),
      isActive: false,
      parseConfidence: 0.54,
      payloadJson: {
        seedScenario: "mirror_stale",
        normalized: {
          canonicalHints: {
            officialSourceUrl: null,
          },
        },
      },
      contentHash: "seed-hash-summit-mirror-secondary",
    }),
    createRawJobListing({
      id: "seed_raw_orbit_greenhouse",
      sourceId: "seed_source_orbit_greenhouse",
      externalJobId: "orbit-501",
      url: "https://boards.greenhouse.io/orbitcommerce/jobs/501",
      titleRaw: "Product Analyst",
      companyNameRaw: "Orbit Commerce",
      locationRaw: "Austin, TX",
      remoteTypeRaw: RemoteType.HYBRID,
      employmentTypeRaw: EmploymentType.FULL_TIME,
      salaryRaw: null,
      descriptionRaw: "Support experimentation analysis, KPI reporting, and prioritization with product leaders. ".repeat(8),
      postedAtRaw: daysAgo(18).toISOString(),
      firstSeenAt: daysAgo(18),
      lastSeenAt: daysAgo(16),
      isActive: true,
      parseConfidence: 0.91,
      payloadJson: {
        seedScenario: "fuzzy_conflict",
        normalized: {
          canonicalHints: {
            officialSourceUrl: "https://boards.greenhouse.io/orbitcommerce/jobs/501",
          },
        },
      },
      contentHash: "seed-hash-orbit-greenhouse",
    }),
    createRawJobListing({
      id: "seed_raw_orbit_structured",
      sourceId: "seed_source_orbit_structured",
      externalJobId: "orbit-structured-1",
      url: "https://jobs.orbitcommerce.example/product-data-analyst",
      titleRaw: "Product Data Analyst",
      companyNameRaw: "Orbit Commerce",
      locationRaw: "Remote - US",
      remoteTypeRaw: RemoteType.REMOTE,
      employmentTypeRaw: EmploymentType.FULL_TIME,
      salaryRaw: null,
      descriptionRaw: "Analyze product and revenue trends for the commerce team. ".repeat(6),
      postedAtRaw: daysAgo(17).toISOString(),
      firstSeenAt: daysAgo(17),
      lastSeenAt: daysAgo(15),
      isActive: false,
      parseConfidence: 0.72,
      payloadJson: {
        seedScenario: "fuzzy_conflict",
        normalized: {
          canonicalHints: {
            officialSourceUrl: null,
          },
        },
      },
      contentHash: "seed-hash-orbit-structured",
    }),
  ];

  const canonicalJobs: SeedCanonicalJobInput[] = [
    {
      id: "seed_job_northstar_platform",
      canonicalTitle: "Senior Platform Engineer",
      canonicalCompanyId: "seed_company_northstar",
      canonicalLocation: "Chicago, IL",
      remoteType: RemoteType.HYBRID,
      employmentType: EmploymentType.FULL_TIME,
      salaryCurrency: "USD",
      salaryMin: 185000,
      salaryMax: 220000,
      descriptionText: "Build reliable internal platforms for analytics, identity, and job quality systems. ".repeat(22),
      searchSummary: "High-trust new official ATS-backed role for scoring calibration.",
      officialSourceUrl: "https://boards.greenhouse.io/northstarlabs/jobs/101",
      officialSourceConfidence: 0.97,
      officialSourceMethod: "company_linked_exact_job",
      officialSourceEvidenceJson: {
        matchedCompanyLink: "https://careers.northstarlabs.example/jobs/senior-platform-engineer",
      },
      firstSeenAt: daysAgo(2),
      lastSeenAt: daysAgo(0),
      repostCount: 0,
      currentStatus: CanonicalJobStatus.ACTIVE,
    },
    {
      id: "seed_job_beacon_quality",
      canonicalTitle: "Data Quality Analyst",
      canonicalCompanyId: "seed_company_beacon",
      canonicalLocation: "Remote - US",
      remoteType: RemoteType.REMOTE,
      employmentType: EmploymentType.FULL_TIME,
      salaryCurrency: "USD",
      salaryMin: 110000,
      salaryMax: 135000,
      descriptionText: "Own data quality alerts, SQL validation, and job-data auditing workflows. ".repeat(14),
      searchSummary: "Company-enriched ATS role whose board is now confirmed from the official domain.",
      officialSourceUrl: "https://boards.greenhouse.io/beaconanalytics/jobs/200",
      officialSourceConfidence: 0.91,
      officialSourceMethod: "company_linked_ats_board",
      officialSourceEvidenceJson: {
        matchedCompanyLink: "https://boards.greenhouse.io/beaconanalytics",
        careersUrl: "https://beaconanalytics.example/careers",
      },
      firstSeenAt: daysAgo(5),
      lastSeenAt: daysAgo(0),
      repostCount: 0,
      currentStatus: CanonicalJobStatus.ACTIVE,
    },
    {
      id: "seed_job_harbor_analytics",
      canonicalTitle: "Senior Analytics Engineer",
      canonicalCompanyId: "seed_company_harbor",
      canonicalLocation: "New York, NY",
      remoteType: RemoteType.HYBRID,
      employmentType: EmploymentType.FULL_TIME,
      salaryCurrency: "USD",
      salaryMin: 165000,
      salaryMax: 195000,
      descriptionText: "Work across metrics engineering, experimentation data, and warehouse performance. ".repeat(17),
      searchSummary: "Older but still-active official job used to guard against over-staleness.",
      officialSourceUrl: "https://jobs.latticeharbor.example/senior-analytics-engineer",
      officialSourceConfidence: 0.95,
      officialSourceMethod: "company_careers_source",
      officialSourceEvidenceJson: {
        careersUrl: "https://jobs.latticeharbor.example",
      },
      firstSeenAt: daysAgo(65),
      lastSeenAt: daysAgo(1),
      repostCount: 0,
      currentStatus: CanonicalJobStatus.ACTIVE,
    },
    {
      id: "seed_job_summit_mirror",
      canonicalTitle: "Remote Customer Success Director",
      canonicalCompanyId: "seed_company_summit",
      canonicalLocation: "Remote",
      remoteType: RemoteType.REMOTE,
      employmentType: EmploymentType.FULL_TIME,
      salaryCurrency: null,
      salaryMin: null,
      salaryMax: null,
      descriptionText: "Immediate opening.",
      searchSummary: "Mirror-only stale role intended to trigger suspicious and stale outcomes.",
      officialSourceUrl: null,
      officialSourceConfidence: null,
      officialSourceMethod: null,
      officialSourceEvidenceJson: Prisma.DbNull,
      firstSeenAt: daysAgo(90),
      lastSeenAt: daysAgo(28),
      repostCount: 4,
      currentStatus: CanonicalJobStatus.INACTIVE,
    },
    {
      id: "seed_job_orbit_product",
      canonicalTitle: "Product Analyst",
      canonicalCompanyId: "seed_company_orbit",
      canonicalLocation: "Austin, TX",
      remoteType: RemoteType.HYBRID,
      employmentType: EmploymentType.FULL_TIME,
      salaryCurrency: null,
      salaryMin: null,
      salaryMax: null,
      descriptionText: "Support experimentation analysis, KPI reporting, and prioritization with product leaders. ".repeat(7),
      searchSummary: "Fuzzy multi-source cluster with title and location disagreement for review testing.",
      officialSourceUrl: "https://boards.greenhouse.io/orbitcommerce/jobs/501",
      officialSourceConfidence: 0.92,
      officialSourceMethod: "company_linked_ats_board",
      officialSourceEvidenceJson: {
        matchedCompanyLink: "https://boards.greenhouse.io/orbitcommerce",
        careersUrl: "https://careers.orbitcommerce.example",
      },
      firstSeenAt: daysAgo(18),
      lastSeenAt: daysAgo(16),
      repostCount: 1,
      currentStatus: CanonicalJobStatus.ACTIVE,
    },
  ];

  const canonicalJobSources: SeedCanonicalJobSourceInput[] = [
    createCanonicalJobSource({
      id: "seed_link_northstar_greenhouse",
      canonicalJobId: "seed_job_northstar_platform",
      rawJobListingId: "seed_raw_northstar_greenhouse",
      linkConfidence: 0.99,
      precedenceRank: 1,
      isCanonicalSource: true,
      mergeRationaleJson: seedRationale("official_source_url", 0.99, ["official_source_url"], 0.99),
    }),
    createCanonicalJobSource({
      id: "seed_link_northstar_careers",
      canonicalJobId: "seed_job_northstar_platform",
      rawJobListingId: "seed_raw_northstar_careers",
      linkConfidence: 0.97,
      precedenceRank: 2,
      isCanonicalSource: false,
      mergeRationaleJson: seedRationale("requisition_id", 0.97, ["title", "company", "salary"], 0.98),
    }),
    createCanonicalJobSource({
      id: "seed_link_beacon_greenhouse",
      canonicalJobId: "seed_job_beacon_quality",
      rawJobListingId: "seed_raw_beacon_greenhouse",
      linkConfidence: 0.94,
      precedenceRank: 1,
      isCanonicalSource: true,
      mergeRationaleJson: seedRationale("internal_job_id", 0.94, ["external_job_id"], 0.94),
    }),
    createCanonicalJobSource({
      id: "seed_link_beacon_lever",
      canonicalJobId: "seed_job_beacon_quality",
      rawJobListingId: "seed_raw_beacon_lever",
      linkConfidence: 0.91,
      precedenceRank: 2,
      isCanonicalSource: false,
      mergeRationaleJson: seedRationale("requisition_id", 0.91, ["title", "company", "location"], 0.92),
    }),
    createCanonicalJobSource({
      id: "seed_link_harbor_careers",
      canonicalJobId: "seed_job_harbor_analytics",
      rawJobListingId: "seed_raw_harbor_careers",
      linkConfidence: 0.98,
      precedenceRank: 1,
      isCanonicalSource: true,
      mergeRationaleJson: seedRationale("official_source_url", 0.98, ["official_source_url"], 0.98),
    }),
    createCanonicalJobSource({
      id: "seed_link_summit_mirror_primary",
      canonicalJobId: "seed_job_summit_mirror",
      rawJobListingId: "seed_raw_summit_mirror_primary",
      linkConfidence: 0.62,
      precedenceRank: 1,
      isCanonicalSource: true,
      mergeRationaleJson: seedRationale("seed", 0.62, ["title"], 0.62),
    }),
    createCanonicalJobSource({
      id: "seed_link_summit_mirror_secondary",
      canonicalJobId: "seed_job_summit_mirror",
      rawJobListingId: "seed_raw_summit_mirror_secondary",
      linkConfidence: 0.58,
      precedenceRank: 2,
      isCanonicalSource: false,
      mergeRationaleJson: seedRationale("fuzzy_title_location", 0.58, ["title", "location"], 0.6),
    }),
    createCanonicalJobSource({
      id: "seed_link_orbit_greenhouse",
      canonicalJobId: "seed_job_orbit_product",
      rawJobListingId: "seed_raw_orbit_greenhouse",
      linkConfidence: 0.92,
      precedenceRank: 1,
      isCanonicalSource: true,
      mergeRationaleJson: seedRationale("internal_job_id", 0.92, ["external_job_id"], 0.92),
    }),
    createCanonicalJobSource({
      id: "seed_link_orbit_structured",
      canonicalJobId: "seed_job_orbit_product",
      rawJobListingId: "seed_raw_orbit_structured",
      linkConfidence: 0.86,
      precedenceRank: 2,
      isCanonicalSource: false,
      mergeRationaleJson: seedRationale("fuzzy_title_location", 0.86, ["title", "company", "location"], 0.84),
    }),
  ];

  return {
    companies,
    sources,
    rawJobListings,
    canonicalJobs,
    canonicalJobSources,
    scenarios: [
      {
        key: "official_new",
        canonicalJobId: "seed_job_northstar_platform",
        reviewGoal: "High-trust new official ATS-backed control example",
        endpoint: { status: "ACTIVE", statusCode: 200 },
      },
      {
        key: "ats_only_missing_official",
        canonicalJobId: "seed_job_beacon_quality",
        reviewGoal: "Missing-official ATS job should stay conservative, not suspicious",
        endpoint: { status: "ACTIVE", statusCode: 200 },
      },
      {
        key: "old_but_active",
        canonicalJobId: "seed_job_harbor_analytics",
        reviewGoal: "Older official job should not be auto-marked stale when still active",
        endpoint: { status: "ACTIVE", statusCode: 200 },
      },
      {
        key: "mirror_stale",
        canonicalJobId: "seed_job_summit_mirror",
        reviewGoal: "Mirror-only reposted role should look stale and low confidence",
        endpoint: { status: "INACTIVE", statusCode: 404 },
      },
      {
        key: "fuzzy_conflict",
        canonicalJobId: "seed_job_orbit_product",
        reviewGoal: "Fuzzy cluster with disagreements should surface review flags without collapsing into suspicious by default",
        endpoint: { status: "UNKNOWN", statusCode: null },
      },
    ],
  };

  function createRawJobListing(
    value: SeedRawJobListingInput,
  ): SeedRawJobListingInput {
    return {
      ...value,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

  function createCanonicalJobSource(
    value: SeedCanonicalJobSourceInput,
  ): SeedCanonicalJobSourceInput {
    return {
      ...value,
      createdAt: timestamp,
    };
  }
}

async function clearExistingSeedData(
  db: PrismaClient,
  dataset: ReviewSeedDataset,
): Promise<void> {
  const canonicalJobIds = dataset.canonicalJobs.map((job) => job.id);
  const rawJobListingIds = dataset.rawJobListings.map((listing) => listing.id);
  const sourceIds = dataset.sources.map((source) => source.id);
  const companyIds = dataset.companies.map((company) => company.id);

  await db.jobScore.deleteMany({
    where: {
      canonicalJobId: {
        in: canonicalJobIds,
      },
    },
  });

  await db.jobSnapshot.deleteMany({
    where: {
      canonicalJobId: {
        in: canonicalJobIds,
      },
    },
  });

  await db.savedJob.deleteMany({
    where: {
      canonicalJobId: {
        in: canonicalJobIds,
      },
    },
  });

  await db.canonicalJobSource.deleteMany({
    where: {
      OR: [
        {
          canonicalJobId: {
            in: canonicalJobIds,
          },
        },
        {
          rawJobListingId: {
            in: rawJobListingIds,
          },
        },
      ],
    },
  });

  await db.canonicalJob.deleteMany({
    where: {
      id: {
        in: canonicalJobIds,
      },
    },
  });

  await db.rawJobListing.deleteMany({
    where: {
      id: {
        in: rawJobListingIds,
      },
    },
  });

  await db.source.deleteMany({
    where: {
      id: {
        in: sourceIds,
      },
    },
  });

  await db.company.deleteMany({
    where: {
      id: {
        in: companyIds,
      },
    },
  });
}

function seedRationale(
  rule: string,
  confidence: number,
  matchedOn: string[],
  clusterConfidence: number,
): Prisma.InputJsonValue {
  return {
    rule,
    confidence,
    matchedOn,
    clusterConfidence,
  };
}
