import type {
  JobDetail,
  JobSearchFilters,
  JobSearchResult,
  JobSource,
  SavedJobState,
} from "@anti-ghost/domain";
import { prisma, type Prisma, SourceType } from "@anti-ghost/database";

import { getCurrentUser, type AuthViewer } from "@/lib/auth";
import { getJobBySlug as getMockJobBySlug, mockJobs } from "@/lib/mock-jobs";

type SearchParamsRecord = Record<string, string | string[] | undefined>;

export type SearchSummary = {
  visibleJobs: number;
  applyNowJobs: number;
  officialSourceJobs: number;
  savedJobsCount: number;
  savedSearchesCount: number;
};

type SearchJobsData = {
  jobs: JobSearchResult[];
  savedJobsCount: number;
};

type CanonicalJobWithRelations = Prisma.CanonicalJobGetPayload<{
  include: {
    canonicalCompany: true;
    sources: {
      include: {
        rawJobListing: {
          include: {
            source: true;
          };
        };
      };
      orderBy: [
        {
          precedenceRank: "asc";
        },
        {
          createdAt: "asc";
        },
      ];
    };
    scores: {
      orderBy: {
        scoredAt: "desc";
      };
      take: 1;
    };
    snapshots: {
      orderBy: {
        snapshotAt: "desc";
      };
      take: 5;
    };
  };
}>;

export async function getSearchJobs(searchParams: SearchParamsRecord = {}): Promise<{
  jobs: JobSearchResult[];
  filters: JobSearchFilters;
  usingFallbackData: boolean;
  summary: SearchSummary;
  viewer: AuthViewer | null;
}> {
  const filters = parseJobSearchFilters(searchParams);

  try {
    const viewer = await getCurrentUser();
    const savedSearchesCount = viewer
      ? await prisma.savedSearch.count({
          where: {
            userId: viewer.id,
          },
        })
      : 0;
    const { jobs: sortedJobs, savedJobsCount } = await getSearchResultsForFilters(filters, viewer?.id ?? null);

    return {
      jobs: sortedJobs,
      filters,
      usingFallbackData: false,
      summary: summarizeSearchResults(sortedJobs, savedJobsCount, savedSearchesCount),
      viewer,
    };
  } catch {
    const fallbackJobs = mockJobs.filter((job) => matchesFilters(job, filters));

    return {
      jobs: sortJobs(fallbackJobs, filters.sort),
      filters,
      usingFallbackData: true,
      summary: summarizeSearchResults(fallbackJobs, 0, 0),
      viewer: null,
    };
  }
}

export async function getSearchResultsForFilters(
  filters: JobSearchFilters,
  viewerId: string | null = null,
): Promise<SearchJobsData> {
  const { savedJobStateByCanonicalJobId, savedJobsCount } = await getSavedJobStateByCanonicalJobId(viewerId);
  const rows = await prisma.canonicalJob.findMany({
    include: {
      canonicalCompany: true,
      sources: {
        include: {
          rawJobListing: {
            include: {
              source: true,
            },
          },
        },
        orderBy: [
          {
            precedenceRank: "asc",
          },
          {
            createdAt: "asc",
          },
        ],
      },
      scores: {
        orderBy: {
          scoredAt: "desc",
        },
        take: 1,
      },
      snapshots: {
        orderBy: {
          snapshotAt: "desc",
        },
        take: 5,
      },
    },
    where: {
      currentStatus: "ACTIVE",
    },
    orderBy: [
      {
        lastSeenAt: "desc",
      },
      {
        updatedAt: "desc",
      },
    ],
    take: 200,
  });

  return {
    jobs: sortJobs(
      rows
        .map((job) =>
          mapCanonicalJobToSearchResult(job, savedJobStateByCanonicalJobId.get(job.id) ?? null),
        )
        .filter((job) => matchesFilters(job, filters)),
      filters.sort,
    ),
    savedJobsCount,
  };
}

export async function getSearchJobMapByIds(
  canonicalJobIds: string[],
  viewerId: string | null = null,
): Promise<Map<string, JobSearchResult>> {
  if (!canonicalJobIds.length) {
    return new Map();
  }

  const { savedJobStateByCanonicalJobId } = await getSavedJobStateByCanonicalJobId(viewerId);
  const rows = await prisma.canonicalJob.findMany({
    include: {
      canonicalCompany: true,
      sources: {
        include: {
          rawJobListing: {
            include: {
              source: true,
            },
          },
        },
        orderBy: [
          {
            precedenceRank: "asc",
          },
          {
            createdAt: "asc",
          },
        ],
      },
      scores: {
        orderBy: {
          scoredAt: "desc",
        },
        take: 1,
      },
      snapshots: {
        orderBy: {
          snapshotAt: "desc",
        },
        take: 5,
      },
    },
    where: {
      id: {
        in: canonicalJobIds,
      },
    },
  });

  return new Map(
    rows.map((job) => [
      job.id,
      mapCanonicalJobToSearchResult(job, savedJobStateByCanonicalJobId.get(job.id) ?? null),
    ]),
  );
}

export async function getSavedJobsPageData(): Promise<{
  viewer: AuthViewer | null;
  jobs: JobSearchResult[];
  usingFallbackData: boolean;
}> {
  const viewer = await getCurrentUser();

  if (!viewer) {
    return {
      viewer: null,
      jobs: [],
      usingFallbackData: false,
    };
  }

  try {
    const savedJobs = await prisma.savedJob.findMany({
      where: {
        userId: viewer.id,
      },
      include: {
        canonicalJob: {
          include: {
            canonicalCompany: true,
            sources: {
              include: {
                rawJobListing: {
                  include: {
                    source: true,
                  },
                },
              },
              orderBy: [
                {
                  precedenceRank: "asc",
                },
                {
                  createdAt: "asc",
                },
              ],
            },
            scores: {
              orderBy: {
                scoredAt: "desc",
              },
              take: 1,
            },
            snapshots: {
              orderBy: {
                snapshotAt: "desc",
              },
              take: 5,
            },
          },
        },
      },
      orderBy: {
        savedAt: "desc",
      },
    });

    return {
      viewer,
      jobs: savedJobs.map((savedJob) =>
        mapCanonicalJobToSearchResult(savedJob.canonicalJob, {
          savedAt: savedJob.savedAt.toISOString(),
          note: savedJob.notes,
        }),
      ),
      usingFallbackData: false,
    };
  } catch {
    return {
      viewer,
      jobs: [],
      usingFallbackData: true,
    };
  }
}

export async function getJobDetailBySlug(slug: string): Promise<{
  job: JobDetail | null;
  usingFallbackData: boolean;
}> {
  const canonicalId = extractCanonicalJobIdFromSlug(slug);

  if (!canonicalId) {
    const mockJob = getMockJobBySlug(slug);
    return {
      job: mockJob ?? null,
      usingFallbackData: Boolean(mockJob),
    };
  }

  try {
    const viewer = await getCurrentUser();
    const row = await prisma.canonicalJob.findUnique({
      where: {
        id: canonicalId,
      },
      include: {
        canonicalCompany: true,
        sources: {
          include: {
            rawJobListing: {
              include: {
                source: true,
              },
            },
          },
          orderBy: [
            {
              precedenceRank: "asc",
            },
            {
              createdAt: "asc",
            },
          ],
        },
        scores: {
          orderBy: {
            scoredAt: "desc",
          },
          take: 1,
        },
        snapshots: {
          orderBy: {
            snapshotAt: "desc",
          },
          take: 8,
        },
      },
    });

    if (!row) {
      return {
        job: getMockJobBySlug(slug) ?? null,
        usingFallbackData: true,
      };
    }

    const savedJob = viewer
      ? await prisma.savedJob.findUnique({
          where: {
            userId_canonicalJobId: {
              userId: viewer.id,
              canonicalJobId: row.id,
            },
          },
        })
      : null;

    return {
      job: mapCanonicalJobToDetail(
        row,
        savedJob
          ? {
              savedAt: savedJob.savedAt.toISOString(),
              note: savedJob.notes,
            }
          : null,
      ),
      usingFallbackData: false,
    };
  } catch {
    return {
      job: getMockJobBySlug(slug) ?? null,
      usingFallbackData: true,
    };
  }
}

export function parseJobSearchFilters(searchParams: SearchParamsRecord = {}): JobSearchFilters {
  const salaryMinValue = readSingle(searchParams.salaryMin);
  const salaryMin = salaryMinValue ? Number(salaryMinValue) : undefined;

  return {
    q: readSingle(searchParams.q)?.trim() ?? "",
    company: readSingle(searchParams.company)?.trim() ?? "",
    location: readSingle(searchParams.location)?.trim() ?? "",
    remoteType: readEnumValue(readSingle(searchParams.remoteType), [
      "REMOTE",
      "HYBRID",
      "ONSITE",
      "UNKNOWN",
    ]),
    trustLabel: readEnumValue(readSingle(searchParams.trustLabel), [
      "HIGH_CONFIDENCE_REAL",
      "MEDIUM_CONFIDENCE",
      "UNVERIFIED_SOURCE",
      "SUSPICIOUS_LOW_CONFIDENCE",
    ]),
    freshnessLabel: readEnumValue(readSingle(searchParams.freshnessLabel), [
      "NEW",
      "FRESH",
      "AGING",
      "POSSIBLY_STALE",
      "LIKELY_STALE",
      "REPOSTED_REPEATEDLY",
    ]),
    priorityLabel: readEnumValue(readSingle(searchParams.priorityLabel), [
      "APPLY_NOW",
      "APPLY_SOON",
      "LOW_PRIORITY",
      "AVOID_FOR_NOW",
    ]),
    officialSourceStatus: readEnumValue(readSingle(searchParams.officialSourceStatus), [
      "FOUND",
      "ATS_ONLY",
      "MISSING",
    ]),
    officialSourceOnly: readSingle(searchParams.officialSourceOnly) === "true",
    salaryMin: Number.isFinite(salaryMin) ? salaryMin : undefined,
    sort: readEnumValue(readSingle(searchParams.sort), ["priority", "freshness", "recent"]) ?? "priority",
  };
}

function mapCanonicalJobToSearchResult(
  job: CanonicalJobWithRelations,
  savedJob: SavedJobState | null,
): JobSearchResult {
  const latestScore = job.scores[0];
  const company = job.canonicalCompany?.displayName ?? "Unknown company";
  const title = job.canonicalTitle;
  const slug = buildJobSlug(company, title, job.id);
  const sources = job.sources.map(mapSourceToViewModel);
  const reasons = parseReasons(latestScore?.reasonsJson);
  const flags = parseFlags(latestScore?.flagsJson);
  const reasonSummary =
    reasons.priorityReasons[0] ??
    reasons.trustReasons[0] ??
    reasons.freshnessReasons[0] ??
    "Scoring evidence is available for this canonical job.";

  return {
    id: job.id,
    slug,
    title,
    company,
    location: job.canonicalLocation ?? "Location unknown",
    remoteType: job.remoteType,
    salary:
      job.salaryCurrency && (job.salaryMin !== null || job.salaryMax !== null)
        ? {
            currency: job.salaryCurrency,
            min: job.salaryMin,
            max: job.salaryMax,
            interval: "YEAR",
          }
        : null,
    officialSourceStatus: getOfficialSourceStatus(job),
    officialSourceUrl: job.officialSourceUrl,
    trustLabel: latestScore?.trustLabel ?? "UNVERIFIED_SOURCE",
    freshnessLabel: latestScore?.freshnessLabel ?? "POSSIBLY_STALE",
    priorityLabel: latestScore?.priorityLabel ?? "LOW_PRIORITY",
    reasonSummary,
    trustReasons: reasons.trustReasons,
    freshnessReasons: reasons.freshnessReasons,
    priorityReasons: reasons.priorityReasons,
    redFlags: flags,
    sources,
    firstSeenAt: job.firstSeenAt.toISOString(),
    lastSeenAt: job.lastSeenAt.toISOString(),
    repostCount: job.repostCount,
    savedJob,
  };
}

function mapCanonicalJobToDetail(
  job: CanonicalJobWithRelations,
  savedJob: SavedJobState | null,
): JobDetail {
  const searchResult = mapCanonicalJobToSearchResult(job, savedJob);
  const latestSnapshot = job.snapshots[0];
  const snapshotStatus = latestSnapshot?.applicationEndpointStatus?.toLowerCase().replaceAll("_", " ");

  const listingHistory = [
    `First seen on ${formatAbsoluteDate(job.firstSeenAt)}.`,
    `Last confirmed on ${formatAbsoluteDate(job.lastSeenAt)}.`,
    `${job.sources.length} linked sources, ${job.sources.filter((source) => source.rawJobListing.isActive).length} still active.`,
    latestSnapshot
      ? `Latest application endpoint status: ${snapshotStatus ?? "unknown"}.`
      : "No job snapshot has been recorded yet.",
  ];

  return {
    ...searchResult,
    overview:
      job.searchSummary ??
      job.descriptionText?.slice(0, 220) ??
      "This canonical job has scoring evidence and linked source history.",
    listingHistory,
  };
}

function summarizeSearchResults(
  jobs: JobSearchResult[],
  savedJobsCount: number,
  savedSearchesCount: number,
): SearchSummary {
  return {
    visibleJobs: jobs.length,
    applyNowJobs: jobs.filter((job) => job.priorityLabel === "APPLY_NOW").length,
    officialSourceJobs: jobs.filter((job) => job.officialSourceStatus !== "MISSING").length,
    savedJobsCount,
    savedSearchesCount,
  };
}

async function getSavedJobStateByCanonicalJobId(viewerId: string | null): Promise<{
  savedJobStateByCanonicalJobId: Map<string, SavedJobState>;
  savedJobsCount: number;
}> {
  if (!viewerId) {
    return {
      savedJobStateByCanonicalJobId: new Map(),
      savedJobsCount: 0,
    };
  }

  const savedJobs = await prisma.savedJob.findMany({
    where: {
      userId: viewerId,
    },
    select: {
      canonicalJobId: true,
      savedAt: true,
      notes: true,
    },
  });

  return {
    savedJobStateByCanonicalJobId: new Map(
      savedJobs.map((savedJob) => [
        savedJob.canonicalJobId,
        {
          savedAt: savedJob.savedAt.toISOString(),
          note: savedJob.notes,
        } satisfies SavedJobState,
      ]),
    ),
    savedJobsCount: savedJobs.length,
  };
}

function mapSourceToViewModel(source: CanonicalJobWithRelations["sources"][number]): JobSource {
  return {
    name: source.rawJobListing.source.sourceName,
    kind: formatSourceKind(source.rawJobListing.source.sourceType, source.isCanonicalSource),
    url: source.rawJobListing.url,
  };
}

function getOfficialSourceStatus(job: CanonicalJobWithRelations): JobSearchResult["officialSourceStatus"] {
  if (!job.officialSourceUrl) {
    return "MISSING";
  }

  if (
    job.officialSourceMethod === "company_linked_exact_job" ||
    job.officialSourceMethod === "company_careers_source" ||
    job.officialSourceMethod === "company_linked_ats_board" ||
    job.officialSourceMethod === "trusted_ats_board_root"
  ) {
    return job.officialSourceMethod === "trusted_ats_board_root" ? "ATS_ONLY" : "FOUND";
  }

  if (job.officialSourceMethod === "company_careers_page") {
    return "FOUND";
  }

  const canonicalSource = job.sources.find((source) => source.isCanonicalSource) ?? job.sources[0] ?? null;

  if (canonicalSource && isAtsSourceType(canonicalSource.rawJobListing.source.sourceType)) {
    return "ATS_ONLY";
  }

  return "FOUND";
}

function isAtsSourceType(sourceType: SourceType): boolean {
  return (
    sourceType === SourceType.GREENHOUSE ||
    sourceType === SourceType.LEVER ||
    sourceType === SourceType.ASHBY
  );
}

function formatSourceKind(sourceType: SourceType, isCanonicalSource: boolean): string {
  const label = (() => {
    switch (sourceType) {
      case SourceType.COMPANY_CAREERS:
        return "Official careers page";
      case SourceType.GREENHOUSE:
      case SourceType.LEVER:
      case SourceType.ASHBY:
        return "Public ATS";
      case SourceType.STRUCTURED_PAGE:
        return "Structured job page";
      case SourceType.SUPPLEMENTAL:
        return "Supplemental mirror";
    }
  })();

  return isCanonicalSource ? `${label} (canonical)` : label;
}

function parseReasons(value: Prisma.JsonValue | null | undefined): {
  trustReasons: string[];
  freshnessReasons: string[];
  priorityReasons: string[];
} {
  if (!isRecord(value)) {
    return {
      trustReasons: [],
      freshnessReasons: [],
      priorityReasons: [],
    };
  }

  return {
    trustReasons: readStringArray(value.trustReasons),
    freshnessReasons: readStringArray(value.freshnessReasons),
    priorityReasons: readStringArray(value.priorityReasons),
  };
}

function parseFlags(value: Prisma.JsonValue | null | undefined): string[] {
  if (!isRecord(value)) {
    return [];
  }

  return Object.entries(value)
    .filter(([, flagValue]) => flagValue === true)
    .map(([key]) => humanizeFlag(key));
}

function humanizeFlag(key: string): string {
  switch (key) {
    case "officialSourceMissing":
      return "Official source missing.";
    case "officialSourceFallback":
      return "Official source falls back to a company careers page.";
    case "endpointInactive":
      return "Application endpoint appears inactive.";
    case "mirrorOnly":
      return "Only mirror or supplemental sources remain.";
    case "fuzzyCluster":
      return "Cluster relies partly on fuzzy matching.";
    case "inconsistentTitle":
      return "Linked sources disagree on the title.";
    case "inconsistentLocation":
      return "Linked sources disagree on the location.";
    case "sparseDescription":
      return "Description is sparse.";
    default:
      return `${key.replace(/([A-Z])/g, " $1").toLowerCase().replace(/^\w/, (char) => char.toUpperCase())}.`;
  }
}

function matchesFilters(job: JobSearchResult, filters: JobSearchFilters): boolean {
  if (filters.q) {
    const q = filters.q.toLowerCase();
    const haystack = [
      job.title,
      job.company,
      job.location,
      job.reasonSummary,
      ...job.trustReasons,
      ...job.freshnessReasons,
      ...job.priorityReasons,
      ...job.redFlags,
      ...job.sources.map((source) => `${source.name} ${source.kind}`),
    ]
      .join(" ")
      .toLowerCase();

    if (!haystack.includes(q)) {
      return false;
    }
  }

  if (filters.company && !job.company.toLowerCase().includes(filters.company.toLowerCase())) {
    return false;
  }

  if (filters.location && !job.location.toLowerCase().includes(filters.location.toLowerCase())) {
    return false;
  }

  if (filters.remoteType && job.remoteType !== filters.remoteType) {
    return false;
  }

  if (filters.trustLabel && job.trustLabel !== filters.trustLabel) {
    return false;
  }

  if (filters.freshnessLabel && job.freshnessLabel !== filters.freshnessLabel) {
    return false;
  }

  if (filters.priorityLabel && job.priorityLabel !== filters.priorityLabel) {
    return false;
  }

  if (filters.officialSourceStatus && job.officialSourceStatus !== filters.officialSourceStatus) {
    return false;
  }

  if (filters.officialSourceOnly && job.officialSourceStatus === "MISSING") {
    return false;
  }

  if (filters.salaryMin !== undefined) {
    const visibleCompensationCeiling = job.salary?.max ?? job.salary?.min ?? null;

    if (visibleCompensationCeiling === null || visibleCompensationCeiling < filters.salaryMin) {
      return false;
    }
  }

  return true;
}

function sortJobs(jobs: JobSearchResult[], sort: JobSearchFilters["sort"]): JobSearchResult[] {
  const ordered = [...jobs];

  switch (sort) {
    case "freshness":
      ordered.sort(
        (left, right) =>
          freshnessRank(right.freshnessLabel) - freshnessRank(left.freshnessLabel) ||
          priorityRank(right.priorityLabel) - priorityRank(left.priorityLabel) ||
          new Date(right.lastSeenAt).getTime() - new Date(left.lastSeenAt).getTime(),
      );
      return ordered;
    case "recent":
      ordered.sort(
        (left, right) =>
          new Date(right.lastSeenAt).getTime() - new Date(left.lastSeenAt).getTime() ||
          priorityRank(right.priorityLabel) - priorityRank(left.priorityLabel),
      );
      return ordered;
    case "priority":
    default:
      ordered.sort(
        (left, right) =>
          priorityRank(right.priorityLabel) - priorityRank(left.priorityLabel) ||
          freshnessRank(right.freshnessLabel) - freshnessRank(left.freshnessLabel) ||
          new Date(right.lastSeenAt).getTime() - new Date(left.lastSeenAt).getTime(),
      );
      return ordered;
  }
}

function priorityRank(label: JobSearchResult["priorityLabel"]): number {
  switch (label) {
    case "APPLY_NOW":
      return 4;
    case "APPLY_SOON":
      return 3;
    case "LOW_PRIORITY":
      return 2;
    case "AVOID_FOR_NOW":
      return 1;
  }
}

function freshnessRank(label: JobSearchResult["freshnessLabel"]): number {
  switch (label) {
    case "NEW":
      return 6;
    case "FRESH":
      return 5;
    case "AGING":
      return 4;
    case "POSSIBLY_STALE":
      return 3;
    case "LIKELY_STALE":
      return 2;
    case "REPOSTED_REPEATEDLY":
      return 1;
  }
}

function buildJobSlug(company: string, title: string, id: string): string {
  return `${slugify(company)}-${slugify(title)}-${id}`;
}

function extractCanonicalJobIdFromSlug(slug: string): string | null {
  const parts = slug.split("-");
  const candidateId = parts.at(-1);
  return candidateId && candidateId.startsWith("c") ? candidateId : null;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatAbsoluteDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function readSingle(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function readEnumValue<TValue extends string>(
  value: string | undefined,
  allowedValues: readonly TValue[],
): TValue | undefined {
  return value && allowedValues.includes(value as TValue) ? (value as TValue) : undefined;
}

function isRecord(value: Prisma.JsonValue | null | undefined): value is Record<string, Prisma.JsonValue> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readStringArray(value: Prisma.JsonValue | undefined): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
