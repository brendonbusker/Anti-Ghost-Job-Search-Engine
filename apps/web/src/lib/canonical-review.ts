import type { FreshnessLabel, PriorityLabel, TrustLabel } from "@anti-ghost/domain";
import { prisma, type Prisma } from "@anti-ghost/database";

export type CanonicalReviewFilters = {
  q: string;
  company: string;
  officialSourceMethod: string;
  backlogOnly: boolean;
  firstPassOnly: boolean;
  reviewedOnly: boolean;
  needsFollowUpOnly: boolean;
  calibrationCandidatesOnly: boolean;
  enrichmentBackfilledOnly: boolean;
  missingOfficialOnly: boolean;
  missingOfficialActionableOnly: boolean;
  ambiguousClustersOnly: boolean;
  ambiguousReviewCandidatesOnly: boolean;
  ambiguousRejectedOnly: boolean;
  lowConfidenceOnly: boolean;
  multiSourceOnly: boolean;
  scoreReviewOnly: boolean;
  unscoredOnly: boolean;
  trustLabel?: TrustLabel;
  freshnessLabel?: FreshnessLabel;
  priorityLabel?: PriorityLabel;
  limit: number;
};

export type CanonicalReviewRationale = {
  rule: string;
  confidence: number | null;
  matchedOn: string[];
  clusterConfidence: number | null;
};

export type CanonicalReviewSource = {
  id: string;
  sourceName: string;
  sourceType: string;
  title: string;
  companyName: string;
  location: string | null;
  isActive: boolean;
  isCanonicalSource: boolean;
  precedenceRank: number | null;
  linkConfidence: number | null;
  url: string;
  officialSourceUrl: string | null;
  mergeRationale: CanonicalReviewRationale;
};

export type CanonicalReviewScore = {
  scoredAt: string;
  modelVersion: string;
  trustScore: number;
  freshnessScore: number;
  priorityScore: number;
  trustLabel: TrustLabel;
  freshnessLabel: FreshnessLabel;
  priorityLabel: PriorityLabel;
  reasons: {
    trustReasons: string[];
    freshnessReasons: string[];
    priorityReasons: string[];
  };
  flags: string[];
  evidence: {
    endpointStatus: string | null;
    canonicalSourceType: string | null;
    officialSourceMethod: string | null;
    fuzzyMatchSourceCount: number | null;
    sourceTypes: string[];
  };
};

export type CanonicalReviewAnnotation = {
  id: string;
  reviewType: "MERGE_QUALITY" | "OFFICIAL_SOURCE" | "SCORE_CALIBRATION" | "GENERAL_NOTE";
  disposition: "CONFIRMED" | "INCORRECT" | "NEEDS_FOLLOW_UP";
  summary: string;
  details: string | null;
  reviewerName: string | null;
  createdAt: string;
};

export type CanonicalReviewJob = {
  id: string;
  title: string;
  company: string;
  location: string | null;
  remoteType: string;
  status: string;
  companyPrimaryDomain: string | null;
  companyCareersUrl: string | null;
  officialSourceUrl: string | null;
  officialSourceConfidence: number | null;
  officialSourceMethod: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  sourceCount: number;
  activeSourceCount: number;
  missingOfficialSource: boolean;
  enrichmentBackfilled: boolean;
  careersPageFallback: boolean;
  calibrationCandidate: boolean;
  missingOfficialActionable: boolean;
  ambiguousCluster: boolean;
  ambiguousReviewCandidate: boolean;
  ambiguousRejected: boolean;
  lowConfidence: boolean;
  hasReviewAnnotations: boolean;
  needsFirstPassReview: boolean;
  needsFollowUpReview: boolean;
  reviewBacklog: boolean;
  reviewStatus: "FOLLOW_UP" | "NEEDS_FIRST_PASS" | "REVIEWED_RESOLVED" | "UNREVIEWED_STABLE";
  reviewPriorityScore: number;
  reviewPriorityReasons: string[];
  latestReview: CanonicalReviewAnnotation | null;
  needsScoreReview: boolean;
  needsReview: boolean;
  reviewReasons: string[];
  scoreReviewReasons: string[];
  reviews: CanonicalReviewAnnotation[];
  score: CanonicalReviewScore | null;
  sources: CanonicalReviewSource[];
};

export type CanonicalReviewCompanySummary = {
  company: string;
  activeCanonicalJobs: number;
  backlogJobs: number;
  firstPassJobs: number;
  flaggedJobs: number;
  reviewedJobs: number;
  reviewedResolvedJobs: number;
  followUpJobs: number;
  scoreReviewJobs: number;
  officialSourceMethods: string[];
  companyPrimaryDomain: string | null;
  companyCareersUrl: string | null;
  latestReviewSummary: string | null;
  latestReviewDisposition: CanonicalReviewAnnotation["disposition"] | null;
  latestReviewType: CanonicalReviewAnnotation["reviewType"] | null;
  latestReviewAt: string | null;
  highestReviewPriorityScore: number;
};

export async function getCanonicalReviewData(filters: CanonicalReviewFilters): Promise<{
  jobs: CanonicalReviewJob[];
  filteredJobsCount: number;
  totalJobs: number;
  flaggedJobs: number;
  reviewBacklogJobs: number;
  firstPassReviewJobs: number;
  reviewedJobs: number;
  followUpReviewJobs: number;
  reviewedResolvedJobs: number;
  scoreFlaggedJobs: number;
  unscoredJobs: number;
  enrichmentBackfilledJobs: number;
  calibrationCandidateJobs: number;
  missingOfficialActionableJobs: number;
  ambiguousClusterJobs: number;
  ambiguousReviewCandidateJobs: number;
  ambiguousRejectedJobs: number;
  topCompanies: CanonicalReviewCompanySummary[];
  availableCompanies: string[];
  officialSourceMethodCounts: Record<string, number>;
}> {
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
      reviews: {
        orderBy: {
          createdAt: "desc",
        },
        take: 5,
      },
      scores: {
        orderBy: {
          scoredAt: "desc",
        },
        take: 1,
      },
    },
    orderBy: [
      {
        updatedAt: "desc",
      },
      {
        lastSeenAt: "desc",
      },
    ],
  });

  const mappedJobs = rows.map(mapCanonicalReviewJob);
  const filteredJobs = mappedJobs
    .filter((job) => matchesFilters(job, filters))
    .sort(
      (left, right) =>
        right.reviewPriorityScore - left.reviewPriorityScore ||
        new Date(right.lastSeenAt).getTime() - new Date(left.lastSeenAt).getTime() ||
        left.company.localeCompare(right.company) ||
        left.title.localeCompare(right.title),
    );
  const jobs = filteredJobs.slice(0, filters.limit);

  return {
    jobs,
    filteredJobsCount: filteredJobs.length,
    totalJobs: rows.length,
    flaggedJobs: mappedJobs.filter((job) => job.needsReview).length,
    reviewBacklogJobs: mappedJobs.filter((job) => job.reviewBacklog).length,
    firstPassReviewJobs: mappedJobs.filter((job) => job.needsFirstPassReview).length,
    reviewedJobs: mappedJobs.filter((job) => job.hasReviewAnnotations).length,
    followUpReviewJobs: mappedJobs.filter((job) => job.needsFollowUpReview).length,
    reviewedResolvedJobs: mappedJobs.filter((job) => job.reviewStatus === "REVIEWED_RESOLVED").length,
    scoreFlaggedJobs: mappedJobs.filter((job) => job.needsScoreReview).length,
    unscoredJobs: mappedJobs.filter((job) => job.score === null).length,
    enrichmentBackfilledJobs: mappedJobs.filter((job) => job.enrichmentBackfilled).length,
    calibrationCandidateJobs: mappedJobs.filter((job) => job.calibrationCandidate).length,
    missingOfficialActionableJobs: mappedJobs.filter((job) => job.missingOfficialActionable).length,
    ambiguousClusterJobs: mappedJobs.filter((job) => job.ambiguousCluster).length,
    ambiguousReviewCandidateJobs: mappedJobs.filter((job) => job.ambiguousReviewCandidate).length,
    ambiguousRejectedJobs: mappedJobs.filter((job) => job.ambiguousRejected).length,
    topCompanies: summarizeCompanies(mappedJobs).slice(0, 10),
    availableCompanies: uniqueValues(mappedJobs.map((job) => job.company)).sort((left, right) =>
      left.localeCompare(right),
    ),
    officialSourceMethodCounts: countByLabel(mappedJobs, (job) => job.officialSourceMethod ?? "UNSET"),
  };
}

export function parseCanonicalReviewFilters(
  searchParams: Record<string, string | string[] | undefined>,
): CanonicalReviewFilters {
  const limitValue = readSingle(searchParams.limit);
  const parsedLimit = limitValue ? Number(limitValue) : 24;

  return {
    q: readSingle(searchParams.q)?.trim() ?? "",
    company: readSingle(searchParams.company)?.trim() ?? "",
    officialSourceMethod: readSingle(searchParams.officialSourceMethod)?.trim() ?? "",
    backlogOnly: readBoolean(searchParams.backlogOnly),
    firstPassOnly: readBoolean(searchParams.firstPassOnly),
    reviewedOnly: readBoolean(searchParams.reviewedOnly),
    needsFollowUpOnly: readBoolean(searchParams.needsFollowUpOnly),
    calibrationCandidatesOnly: readBoolean(searchParams.calibrationCandidatesOnly),
    enrichmentBackfilledOnly: readBoolean(searchParams.enrichmentBackfilledOnly),
    missingOfficialOnly: readBoolean(searchParams.missingOfficialOnly),
    missingOfficialActionableOnly: readBoolean(searchParams.missingOfficialActionableOnly),
    ambiguousClustersOnly: readBoolean(searchParams.ambiguousClustersOnly),
    ambiguousReviewCandidatesOnly: readBoolean(searchParams.ambiguousReviewCandidatesOnly),
    ambiguousRejectedOnly: readBoolean(searchParams.ambiguousRejectedOnly),
    lowConfidenceOnly: readBoolean(searchParams.lowConfidenceOnly),
    multiSourceOnly: readBoolean(searchParams.multiSourceOnly),
    scoreReviewOnly: readBoolean(searchParams.scoreReviewOnly),
    unscoredOnly: readBoolean(searchParams.unscoredOnly),
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
    limit: Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 50) : 24,
  };
}

function mapCanonicalReviewJob(
  row: Prisma.CanonicalJobGetPayload<{
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
      };
      scores: {
        orderBy: {
          scoredAt: "desc";
        };
        take: 1;
      };
      reviews: {
        orderBy: {
          createdAt: "desc";
        };
        take: 5;
      };
    };
  }>,
): CanonicalReviewJob {
  const sources = row.sources.map((source) => {
    const rationale = parseMergeRationale(source.mergeRationaleJson);
    const payloadOfficialUrl = readOfficialSourceUrl(source.rawJobListing.payloadJson);

    return {
      id: source.id,
      sourceName: source.rawJobListing.source.sourceName,
      sourceType: source.rawJobListing.source.sourceType,
      title: source.rawJobListing.titleRaw,
      companyName: source.rawJobListing.companyNameRaw,
      location: source.rawJobListing.locationRaw,
      isActive: source.rawJobListing.isActive,
      isCanonicalSource: source.isCanonicalSource,
      precedenceRank: source.precedenceRank,
      linkConfidence: source.linkConfidence,
      url: source.rawJobListing.url,
      officialSourceUrl: payloadOfficialUrl,
      mergeRationale: rationale,
    };
  });
  const reviews = row.reviews.map((review) => ({
    id: review.id,
    reviewType: review.reviewType,
    disposition: review.disposition,
    summary: review.summary,
    details: review.details,
    reviewerName: review.reviewerName,
    createdAt: review.createdAt.toISOString(),
  }));

  const missingOfficialSource = !row.officialSourceUrl;
  const officialSourceMethod = readString(row.officialSourceMethod);
  const enrichmentBackfilled =
    officialSourceMethod === "company_linked_exact_job" ||
    officialSourceMethod === "company_linked_ats_board" ||
    officialSourceMethod === "company_careers_page";
  const careersPageFallback = officialSourceMethod === "company_careers_page";
  const lowConfidence =
    (row.officialSourceConfidence ?? 0) < 0.85 ||
    sources.some((source) => (source.linkConfidence ?? 0) < 0.9);
  const fuzzyOnlyLinks = sources.filter((source) => source.mergeRationale.rule === "fuzzy_title_location").length;
  const activeSourceCount = sources.filter((source) => source.isActive).length;
  const inconsistentTitle = uniqueNormalizedCount(sources.map((source) => source.title)) > 1;
  const inconsistentLocation =
    uniqueNormalizedCount(sources.map((source) => source.location ?? "")) > 1;
  const reviewReasons: string[] = [];
  const score = row.scores[0] ? parseLatestScore(row.scores[0]) : null;
  const scoreReviewReasons: string[] = [];
  const hasReviewAnnotations = reviews.length > 0;
  const latestReview = reviews[0] ?? null;
  const needsFollowUpReview = reviews.some((review) => review.disposition === "NEEDS_FOLLOW_UP");
  const ambiguousCluster = fuzzyOnlyLinks > 0 || inconsistentTitle || inconsistentLocation;
  const missingOfficialActionable =
    missingOfficialSource && score !== null && score.priorityLabel !== "AVOID_FOR_NOW";
  const ambiguousRejected =
    ambiguousCluster &&
    score !== null &&
    (score.trustLabel === "SUSPICIOUS_LOW_CONFIDENCE" ||
      score.freshnessLabel === "LIKELY_STALE" ||
      score.freshnessLabel === "REPOSTED_REPEATEDLY" ||
      score.priorityLabel === "AVOID_FOR_NOW");
  const ambiguousReviewCandidate = ambiguousCluster && score !== null && !ambiguousRejected;
  const calibrationCandidate = missingOfficialActionable || ambiguousReviewCandidate;
  const reviewPriorityReasons: string[] = [];

  if (missingOfficialSource) {
    reviewReasons.push("Official source missing");
  }

  if (enrichmentBackfilled) {
    reviewReasons.push("Official source was backfilled from company enrichment");
  }

  if (careersPageFallback) {
    reviewReasons.push("Official source falls back to a company careers page");
  }

  if (lowConfidence) {
    reviewReasons.push("Low-confidence link or canonical source confidence");
  }

  if (ambiguousCluster) {
    reviewReasons.push("Cluster depends partly on fuzzy matches or disagrees internally");
  }

  if (sources.some((source) => !source.isActive)) {
    reviewReasons.push("Cluster includes inactive source rows");
  }

  if (hasReviewAnnotations) {
    reviewReasons.push("Reviewer annotations are present");
  }

  if (needsFollowUpReview) {
    reviewReasons.push("Reviewer marked this cluster for follow-up");
  }

  if (!score) {
    scoreReviewReasons.push("No score has been generated for this canonical job yet");
  } else {
    if (
      missingOfficialSource &&
      score.priorityLabel !== "AVOID_FOR_NOW"
    ) {
      scoreReviewReasons.push("Missing official source still needs resolution before higher-confidence prioritization");
    }

    if (
      score.trustLabel === "UNVERIFIED_SOURCE" ||
      score.trustLabel === "SUSPICIOUS_LOW_CONFIDENCE"
    ) {
      scoreReviewReasons.push(`Trust label is ${formatLabel(score.trustLabel)}`);
    }

    if (
      score.freshnessLabel === "LIKELY_STALE" ||
      score.freshnessLabel === "REPOSTED_REPEATEDLY"
    ) {
      scoreReviewReasons.push(`Freshness label is ${formatLabel(score.freshnessLabel)}`);
    }

    if (score.priorityLabel === "AVOID_FOR_NOW") {
      scoreReviewReasons.push("Priority currently says avoid for now");
    }

    if (score.flags.length > 0) {
      scoreReviewReasons.push("Score flags are present");
    }
  }

  const combinedReviewReasons = uniqueValues([...reviewReasons, ...scoreReviewReasons]);
  const needsScoreReview = scoreReviewReasons.length > 0;
  const needsFirstPassReview =
    !hasReviewAnnotations && (missingOfficialActionable || ambiguousReviewCandidate || lowConfidence || needsScoreReview);
  const reviewBacklog = needsFollowUpReview || needsFirstPassReview;

  if (needsFollowUpReview) {
    reviewPriorityReasons.push("Reviewer already asked for a follow-up pass");
  }

  if (needsFirstPassReview) {
    reviewPriorityReasons.push("Cluster still needs an initial human pass");
  }

  if (missingOfficialActionable) {
    reviewPriorityReasons.push("Missing official source is still actionable");
  }

  if (ambiguousReviewCandidate) {
    reviewPriorityReasons.push("Ambiguous cluster still looks plausible");
  }

  if (needsScoreReview) {
    reviewPriorityReasons.push("Scoring output still needs inspection");
  }

  const reviewStatus = needsFollowUpReview
    ? "FOLLOW_UP"
    : needsFirstPassReview
      ? "NEEDS_FIRST_PASS"
      : hasReviewAnnotations
        ? "REVIEWED_RESOLVED"
        : "UNREVIEWED_STABLE";
  const reviewPriorityScore =
    (needsFollowUpReview ? 100 : 0) +
    (needsFirstPassReview ? 70 : 0) +
    (missingOfficialActionable ? 16 : 0) +
    (ambiguousReviewCandidate ? 14 : 0) +
    (needsScoreReview ? 10 : 0) +
    (calibrationCandidate ? 8 : 0) +
    (lowConfidence ? 4 : 0) -
    (reviewStatus === "REVIEWED_RESOLVED" ? 25 : 0);

  return {
    id: row.id,
    title: row.canonicalTitle,
    company: row.canonicalCompany?.displayName ?? "Unknown company",
    location: row.canonicalLocation,
    remoteType: row.remoteType,
    status: row.currentStatus,
    companyPrimaryDomain: row.canonicalCompany?.primaryDomain ?? null,
    companyCareersUrl: row.canonicalCompany?.careersUrl ?? null,
    officialSourceUrl: row.officialSourceUrl,
    officialSourceConfidence: row.officialSourceConfidence,
    officialSourceMethod,
    firstSeenAt: row.firstSeenAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    sourceCount: sources.length,
    activeSourceCount,
    missingOfficialSource,
    enrichmentBackfilled,
    careersPageFallback,
    calibrationCandidate,
    missingOfficialActionable,
    ambiguousCluster,
    ambiguousReviewCandidate,
    ambiguousRejected,
    lowConfidence,
    hasReviewAnnotations,
    needsFirstPassReview,
    needsFollowUpReview,
    reviewBacklog,
    reviewStatus,
    reviewPriorityScore,
    reviewPriorityReasons: uniqueValues(reviewPriorityReasons),
    latestReview,
    needsScoreReview,
    needsReview: combinedReviewReasons.length > 0,
    reviewReasons: combinedReviewReasons,
    scoreReviewReasons,
    reviews,
    score,
    sources,
  };
}

function matchesFilters(job: CanonicalReviewJob, filters: CanonicalReviewFilters): boolean {
  if (filters.company && job.company !== filters.company) {
    return false;
  }

  if (filters.officialSourceMethod && (job.officialSourceMethod ?? "UNSET") !== filters.officialSourceMethod) {
    return false;
  }

  if (filters.backlogOnly && !job.reviewBacklog) {
    return false;
  }

  if (filters.firstPassOnly && !job.needsFirstPassReview) {
    return false;
  }

  if (filters.reviewedOnly && !job.hasReviewAnnotations) {
    return false;
  }

  if (filters.needsFollowUpOnly && !job.needsFollowUpReview) {
    return false;
  }

  if (filters.calibrationCandidatesOnly && !job.calibrationCandidate) {
    return false;
  }

  if (filters.enrichmentBackfilledOnly && !job.enrichmentBackfilled) {
    return false;
  }

  if (filters.missingOfficialOnly && !job.missingOfficialSource) {
    return false;
  }

  if (filters.missingOfficialActionableOnly && !job.missingOfficialActionable) {
    return false;
  }

  if (filters.ambiguousClustersOnly && !job.ambiguousCluster) {
    return false;
  }

  if (filters.ambiguousReviewCandidatesOnly && !job.ambiguousReviewCandidate) {
    return false;
  }

  if (filters.ambiguousRejectedOnly && !job.ambiguousRejected) {
    return false;
  }

  if (filters.lowConfidenceOnly && !job.lowConfidence) {
    return false;
  }

  if (filters.multiSourceOnly && job.sourceCount < 2) {
    return false;
  }

  if (filters.scoreReviewOnly && !job.needsScoreReview) {
    return false;
  }

  if (filters.unscoredOnly && job.score !== null) {
    return false;
  }

  if (filters.trustLabel && job.score?.trustLabel !== filters.trustLabel) {
    return false;
  }

  if (filters.freshnessLabel && job.score?.freshnessLabel !== filters.freshnessLabel) {
    return false;
  }

  if (filters.priorityLabel && job.score?.priorityLabel !== filters.priorityLabel) {
    return false;
  }

  if (!filters.q) {
    return true;
  }

  const haystack = [
    job.title,
    job.company,
    job.location ?? "",
    ...job.reviewReasons,
    ...job.scoreReviewReasons,
    ...(job.score?.flags ?? []),
    ...job.sources.map((source) => `${source.sourceName} ${source.title} ${source.companyName}`),
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(filters.q.toLowerCase());
}

function parseLatestScore(
  row: Prisma.JobScoreGetPayload<Record<string, never>>,
): CanonicalReviewScore {
  return {
    scoredAt: row.scoredAt.toISOString(),
    modelVersion: row.modelVersion,
    trustScore: row.trustScore,
    freshnessScore: row.freshnessScore,
    priorityScore: row.priorityScore,
    trustLabel: row.trustLabel,
    freshnessLabel: row.freshnessLabel,
    priorityLabel: row.priorityLabel,
    reasons: parseReasons(row.reasonsJson),
    flags: parseFlags(row.flagsJson),
    evidence: parseEvidence(row.evidenceJson),
  };
}

function parseMergeRationale(value: Prisma.JsonValue | null): CanonicalReviewRationale {
  if (!isRecord(value)) {
    return {
      rule: "unknown",
      confidence: null,
      matchedOn: [],
      clusterConfidence: null,
    };
  }

  return {
    rule: readString(value.rule) ?? "unknown",
    confidence: readNumber(value.confidence),
    matchedOn: readStringArray(value.matchedOn),
    clusterConfidence: readNumber(value.clusterConfidence),
  };
}

function parseReasons(value: Prisma.JsonValue | null): CanonicalReviewScore["reasons"] {
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

function parseFlags(value: Prisma.JsonValue | null): string[] {
  if (!isRecord(value)) {
    return [];
  }

  return Object.entries(value)
    .filter(([, flagValue]) => flagValue === true)
    .map(([key]) => humanizeFlag(key));
}

function parseEvidence(value: Prisma.JsonValue | null): CanonicalReviewScore["evidence"] {
  if (!isRecord(value)) {
    return {
      endpointStatus: null,
      canonicalSourceType: null,
      officialSourceMethod: null,
      fuzzyMatchSourceCount: null,
      sourceTypes: [],
    };
  }

  return {
    endpointStatus: readString(value.endpointStatus),
    canonicalSourceType: readString(value.canonicalSourceType),
    officialSourceMethod: readString(value.officialSourceMethod),
    fuzzyMatchSourceCount: readNumber(value.fuzzyMatchSourceCount),
    sourceTypes: readStringArray(value.sourceTypes),
  };
}

function readOfficialSourceUrl(value: Prisma.JsonValue): string | null {
  if (!isRecord(value) || !isRecord(value.normalized) || !isRecord(value.normalized.canonicalHints)) {
    return null;
  }

  return readString(value.normalized.canonicalHints.officialSourceUrl);
}

function readBoolean(value: string | string[] | undefined): boolean {
  return readSingle(value) === "true";
}

function readEnumValue<TValue extends string>(
  value: string | undefined,
  allowedValues: readonly TValue[],
): TValue | undefined {
  return value && allowedValues.includes(value as TValue) ? (value as TValue) : undefined;
}

function readSingle(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isRecord(value: unknown): value is Record<string, Prisma.JsonValue> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: Prisma.JsonValue | undefined): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readNumber(value: Prisma.JsonValue | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readStringArray(value: Prisma.JsonValue | undefined): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function humanizeFlag(key: string): string {
  switch (key) {
    case "officialSourceMissing":
      return "Official source missing";
    case "officialSourceFallback":
      return "Official source fallback";
    case "endpointInactive":
      return "Endpoint inactive";
    case "mirrorOnly":
      return "Mirror only";
    case "fuzzyCluster":
      return "Fuzzy cluster";
    case "inconsistentTitle":
      return "Inconsistent title";
    case "inconsistentLocation":
      return "Inconsistent location";
    case "sparseDescription":
      return "Sparse description";
    default:
      return key.replace(/([A-Z])/g, " $1").replace(/^\w/, (char) => char.toUpperCase()).trim();
  }
}

function formatLabel(value: string): string {
  return value.toLowerCase().replaceAll("_", " ");
}

function uniqueValues<TValue>(values: TValue[]): TValue[] {
  return [...new Set(values)];
}

function uniqueNormalizedCount(values: string[]): number {
  return uniqueValues(
    values
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.length > 0),
  ).length;
}

function summarizeCompanies(jobs: CanonicalReviewJob[]): CanonicalReviewCompanySummary[] {
  const summaries = new Map<string, CanonicalReviewCompanySummary>();

  for (const job of jobs) {
    const existing = summaries.get(job.company);

    if (existing) {
      existing.activeCanonicalJobs += 1;
      existing.backlogJobs += job.reviewBacklog ? 1 : 0;
      existing.firstPassJobs += job.needsFirstPassReview ? 1 : 0;
      existing.flaggedJobs += job.needsReview ? 1 : 0;
      existing.reviewedJobs += job.hasReviewAnnotations ? 1 : 0;
      existing.reviewedResolvedJobs += job.reviewStatus === "REVIEWED_RESOLVED" ? 1 : 0;
      existing.followUpJobs += job.needsFollowUpReview ? 1 : 0;
      existing.scoreReviewJobs += job.needsScoreReview ? 1 : 0;
      existing.highestReviewPriorityScore = Math.max(existing.highestReviewPriorityScore, job.reviewPriorityScore);

      if (
        job.latestReview &&
        (!existing.latestReviewAt || new Date(job.latestReview.createdAt).getTime() > new Date(existing.latestReviewAt).getTime())
      ) {
        existing.latestReviewSummary = job.latestReview.summary;
        existing.latestReviewDisposition = job.latestReview.disposition;
        existing.latestReviewType = job.latestReview.reviewType;
        existing.latestReviewAt = job.latestReview.createdAt;
      }

      if (job.officialSourceMethod && !existing.officialSourceMethods.includes(job.officialSourceMethod)) {
        existing.officialSourceMethods.push(job.officialSourceMethod);
        existing.officialSourceMethods.sort();
      }

      continue;
    }

    summaries.set(job.company, {
      company: job.company,
      activeCanonicalJobs: 1,
      backlogJobs: job.reviewBacklog ? 1 : 0,
      firstPassJobs: job.needsFirstPassReview ? 1 : 0,
      flaggedJobs: job.needsReview ? 1 : 0,
      reviewedJobs: job.hasReviewAnnotations ? 1 : 0,
      reviewedResolvedJobs: job.reviewStatus === "REVIEWED_RESOLVED" ? 1 : 0,
      followUpJobs: job.needsFollowUpReview ? 1 : 0,
      scoreReviewJobs: job.needsScoreReview ? 1 : 0,
      officialSourceMethods: job.officialSourceMethod ? [job.officialSourceMethod] : [],
      companyPrimaryDomain: job.companyPrimaryDomain,
      companyCareersUrl: job.companyCareersUrl,
      latestReviewSummary: job.latestReview?.summary ?? null,
      latestReviewDisposition: job.latestReview?.disposition ?? null,
      latestReviewType: job.latestReview?.reviewType ?? null,
      latestReviewAt: job.latestReview?.createdAt ?? null,
      highestReviewPriorityScore: job.reviewPriorityScore,
    });
  }

  return [...summaries.values()].sort(
    (left, right) =>
      right.backlogJobs - left.backlogJobs ||
      right.followUpJobs - left.followUpJobs ||
      right.firstPassJobs - left.firstPassJobs ||
      right.highestReviewPriorityScore - left.highestReviewPriorityScore ||
      right.activeCanonicalJobs - left.activeCanonicalJobs ||
      left.company.localeCompare(right.company),
  );
}

function countByLabel<TItem>(items: TItem[], getLabel: (item: TItem) => string): Record<string, number> {
  return items.reduce<Record<string, number>>((accumulator, item) => {
    const label = getLabel(item);
    accumulator[label] = (accumulator[label] ?? 0) + 1;
    return accumulator;
  }, {});
}
