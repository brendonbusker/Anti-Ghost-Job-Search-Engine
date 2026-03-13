import { createHash } from "node:crypto";

import {
  ApplicationEndpointStatus,
  FreshnessLabel,
  type Prisma,
  prisma,
  PriorityLabel,
  type PrismaClient,
  SourceType,
  TrustLabel,
} from "@anti-ghost/database";
import {
  checkAshbyJobActivity,
  checkGreenhouseJobActivity,
  checkLeverJobActivity,
  officialSourceMethods,
} from "@anti-ghost/ingestion";
import { scoringConfig } from "./config";

const MODEL_VERSION = scoringConfig.modelVersion;
const SCORING_ENDPOINT_CONCURRENCY = 12;

export type ScoringReasons = {
  trustReasons: string[];
  freshnessReasons: string[];
  priorityReasons: string[];
};

export type ScoringFlags = {
  officialSourceMissing: boolean;
  officialSourceFallback: boolean;
  endpointInactive: boolean;
  mirrorOnly: boolean;
  fuzzyCluster: boolean;
  inconsistentTitle: boolean;
  inconsistentLocation: boolean;
  sparseDescription: boolean;
};

export type ScoringEvidence = {
  sourceCount: number;
  activeSourceCount: number;
  officialSourcePresent: boolean;
  officialSourceConfidence: number | null;
  officialSourceMethod: string | null;
  endpointStatus: ApplicationEndpointStatus;
  canonicalSourceType: SourceType | "UNKNOWN";
  descriptionLength: number;
  firstSeenDaysAgo: number;
  sourceReportedDaysAgo: number | null;
  effectiveListingAgeDays: number;
  lastSeenDaysAgo: number;
  fuzzyMatchSourceCount: number;
  salaryPresent: boolean;
  sourceTypes: string[];
};

export type ScoredJob = {
  canonicalJobId: string;
  scoredAt: Date;
  trustScore: number;
  freshnessScore: number;
  priorityScore: number;
  trustLabel: TrustLabel;
  freshnessLabel: FreshnessLabel;
  priorityLabel: PriorityLabel;
  reasons: ScoringReasons;
  flags: ScoringFlags;
  evidence: ScoringEvidence;
  snapshot: {
    sourceCount: number;
    activeSourceCount: number;
    officialSourcePresent: boolean;
    applicationEndpointStatus: ApplicationEndpointStatus;
    descriptionHash: string | null;
    metadata: Prisma.InputJsonObject;
  };
};

export type ScoreRunSummary = {
  scoredCount: number;
  snapshotCount: number;
  modelVersion: string;
};

type EndpointCheckResult = {
  status: "ACTIVE" | "INACTIVE" | "UNKNOWN";
  statusCode: number | null;
};

export type CanonicalJobRecord = Prisma.CanonicalJobGetPayload<{
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
  };
}>;

type ScoreOptions = {
  db?: PrismaClient;
  endpointChecker?: (job: CanonicalJobRecord) => Promise<EndpointCheckResult>;
  now?: Date;
};

export async function scoreCanonicalJobs(options: ScoreOptions = {}): Promise<ScoreRunSummary> {
  const db = options.db ?? prisma;
  const now = options.now ?? new Date();
  const jobs = await loadCanonicalJobsForScoring(db);
  const endpointChecker = createCachedEndpointChecker(options.endpointChecker ?? defaultEndpointChecker);
  const scoredJobs = await mapWithConcurrency(
    jobs,
    SCORING_ENDPOINT_CONCURRENCY,
    (job) =>
      scoreCanonicalJob(job, {
        endpointChecker,
        now,
      }),
  );

  let scoredCount = 0;
  let snapshotCount = 0;

  for (const scoredJob of scoredJobs) {
    await persistScoredJob(db, scoredJob);

    scoredCount += 1;
    snapshotCount += 1;
  }

  return {
    scoredCount,
    snapshotCount,
    modelVersion: MODEL_VERSION,
  };
}

export async function loadCanonicalJobsForScoring(
  db: PrismaClient,
  jobIds?: string[],
): Promise<CanonicalJobRecord[]> {
  return db.canonicalJob.findMany({
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
    },
    orderBy: [
      {
        updatedAt: "desc",
      },
      {
        lastSeenAt: "desc",
      },
    ],
    ...(jobIds && jobIds.length > 0
      ? {
          where: {
            id: {
              in: jobIds,
            },
          },
        }
      : {}),
  });
}

export async function persistScoredJob(db: PrismaClient, scoredJob: ScoredJob): Promise<void> {
  await db.jobSnapshot.create({
    data: {
      canonicalJobId: scoredJob.canonicalJobId,
      snapshotAt: scoredJob.scoredAt,
      sourceCount: scoredJob.snapshot.sourceCount,
      activeSourceCount: scoredJob.snapshot.activeSourceCount,
      officialSourcePresent: scoredJob.snapshot.officialSourcePresent,
      applicationEndpointStatus: scoredJob.snapshot.applicationEndpointStatus,
      descriptionHash: scoredJob.snapshot.descriptionHash,
      metadataJson: scoredJob.snapshot.metadata as Prisma.InputJsonValue,
    },
  });

  await db.jobScore.create({
    data: {
      canonicalJobId: scoredJob.canonicalJobId,
      scoredAt: scoredJob.scoredAt,
      trustScore: scoredJob.trustScore,
      freshnessScore: scoredJob.freshnessScore,
      priorityScore: scoredJob.priorityScore,
      trustLabel: scoredJob.trustLabel,
      freshnessLabel: scoredJob.freshnessLabel,
      priorityLabel: scoredJob.priorityLabel,
      reasonsJson: scoredJob.reasons as Prisma.InputJsonValue,
      flagsJson: scoredJob.flags as Prisma.InputJsonValue,
      evidenceJson: scoredJob.evidence as Prisma.InputJsonValue,
      modelVersion: MODEL_VERSION,
    },
  });
}

export async function scoreCanonicalJob(
  job: CanonicalJobRecord,
  options: {
    endpointChecker?: (job: CanonicalJobRecord) => Promise<EndpointCheckResult>;
    now?: Date;
  } = {},
): Promise<ScoredJob> {
  const now = options.now ?? new Date();
  const endpointResult = await (options.endpointChecker ?? defaultEndpointChecker)(job);
  const endpointStatus = mapEndpointStatus(endpointResult.status);
  const canonicalSource = job.sources.find((source) => source.isCanonicalSource) ?? job.sources[0] ?? null;
  const sourceTypes = uniqueValues(job.sources.map((source) => source.rawJobListing.source.sourceType));
  const descriptionLength = (job.descriptionText ?? "").trim().length;
  const activeSourceCount = job.sources.filter((source) => source.rawJobListing.isActive).length;
  const normalizedTitles = uniqueValues(job.sources.map((source) => normalizeText(source.rawJobListing.titleRaw)).filter(Boolean));
  const titleAgreementKeys = uniqueValues(
    job.sources.map((source) => buildTitleAgreementKey(source.rawJobListing.titleRaw)).filter(Boolean),
  );
  const normalizedLocations = uniqueValues(
    job.sources.map((source) => normalizeText(source.rawJobListing.locationRaw ?? "")).filter(Boolean),
  );
  const exactTitleAgreement = titleAgreementKeys.length <= 1;
  const exactLocationAgreement = normalizedLocations.length <= 1;
  const exactDuplicateCluster = exactTitleAgreement && exactLocationAgreement;
  const fuzzySourceCount = job.sources.filter((source) => readMergeRule(source.mergeRationaleJson) === "fuzzy_title_location").length;
  const sharedRequisitionAcrossSources = hasSharedRequisitionAcrossSources(job.sources);
  const inconsistentTitle = titleAgreementKeys.length > 1 && !sharedRequisitionAcrossSources;
  const inconsistentLocation = normalizedLocations.length > 1 && !sharedRequisitionAcrossSources;
  const ambiguousFuzzyCluster = fuzzySourceCount > 0 && !exactDuplicateCluster;
  const mirrorOnly = !job.officialSourceUrl && sourceTypes.every((sourceType) => sourceType === SourceType.SUPPLEMENTAL);
  const officialSourceMethod = job.officialSourceMethod ?? null;
  const companyLinkedBoard =
    officialSourceMethod === officialSourceMethods.companyLinkedAtsBoard ||
    officialSourceMethod === officialSourceMethods.trustedAtsBoardRoot;
  const trustedAtsBoardRoot = officialSourceMethod === officialSourceMethods.trustedAtsBoardRoot;
  const careersPageFallback = officialSourceMethod === officialSourceMethods.companyCareersPage;
  const firstSeenDaysAgo = daysAgo(job.firstSeenAt, now);
  const sourceReportedDaysAgo = readSourceReportedDaysAgo(job, canonicalSource, now);
  const effectiveListingAgeDays = Math.max(firstSeenDaysAgo, sourceReportedDaysAgo ?? 0);

  const evidence: ScoringEvidence = {
    sourceCount: job.sources.length,
    activeSourceCount,
    officialSourcePresent: Boolean(job.officialSourceUrl),
    officialSourceConfidence: job.officialSourceConfidence,
    officialSourceMethod,
    endpointStatus,
    canonicalSourceType: canonicalSource?.rawJobListing.source.sourceType ?? "UNKNOWN",
    descriptionLength,
    firstSeenDaysAgo,
    sourceReportedDaysAgo,
    effectiveListingAgeDays,
    lastSeenDaysAgo: daysAgo(job.lastSeenAt, now),
    fuzzyMatchSourceCount: fuzzySourceCount,
    salaryPresent: job.salaryMin !== null || job.salaryMax !== null,
    sourceTypes: sourceTypes.map((sourceType) => sourceType),
  };

  const trustReasons: string[] = [];
  const freshnessReasons: string[] = [];
  const priorityReasons: string[] = [];

  let trustScore: number = scoringConfig.trust.baseScore;

  if (job.officialSourceUrl) {
    trustScore += scoringConfig.trust.officialSourceResolvedBonus;
    trustReasons.push("Official source was resolved for this canonical job.");
  } else {
    trustScore -= scoringConfig.trust.missingOfficialPenalty;
    trustReasons.push("No official source could be verified.");
  }

  if ((job.officialSourceConfidence ?? 0) >= scoringConfig.trust.officialConfidence.strongThreshold) {
    trustScore += scoringConfig.trust.officialConfidence.strongBonus;
    trustReasons.push("Official-source confidence is strong.");
  } else if ((job.officialSourceConfidence ?? 0) >= scoringConfig.trust.officialConfidence.mediumThreshold) {
    trustScore += scoringConfig.trust.officialConfidence.mediumBonus;
  } else if (job.officialSourceConfidence !== null) {
    trustScore -= scoringConfig.trust.officialConfidence.weakPenalty;
    trustReasons.push("Official-source confidence is weaker than ideal.");
  }

  if (trustedAtsBoardRoot) {
    trustScore -= scoringConfig.trust.companyLinkedBoardPenalty;
    trustReasons.push("Official source is confirmed from a trusted ATS board root inferred from repeated source evidence, not a company-page link.");
  } else if (companyLinkedBoard) {
    trustScore -= scoringConfig.trust.companyLinkedBoardPenalty;
    trustReasons.push("Official source is verified from a company-linked ATS board, not an exact job page.");
  }

  if (careersPageFallback) {
    trustScore -= scoringConfig.trust.careersPageFallbackPenalty;
    trustReasons.push("Official source falls back to a company careers page rather than a job-specific posting.");
  }

  if (canonicalSource) {
    switch (canonicalSource.rawJobListing.source.sourceType) {
      case SourceType.COMPANY_CAREERS:
        trustScore += scoringConfig.trust.canonicalSource.companyCareersBonus;
        trustReasons.push("Canonical source is a company careers page.");
        break;
      case SourceType.GREENHOUSE:
      case SourceType.LEVER:
      case SourceType.ASHBY:
        trustScore += scoringConfig.trust.canonicalSource.trustedAtsBonus;
        trustReasons.push("Canonical source is a trusted public ATS posting.");
        break;
      case SourceType.STRUCTURED_PAGE:
        trustScore += scoringConfig.trust.canonicalSource.structuredPageBonus;
        break;
      case SourceType.SUPPLEMENTAL:
        trustScore -= scoringConfig.trust.canonicalSource.supplementalPenalty;
        trustReasons.push("Canonical source is only a supplemental page.");
        break;
    }
  }

  if (activeSourceCount >= 2) {
    trustScore += scoringConfig.trust.multiActiveSourceBonus;
    trustReasons.push("Multiple active sources agree on the job cluster.");
  }

  if (descriptionLength >= scoringConfig.trust.detailedDescriptionThreshold) {
    trustScore += scoringConfig.trust.detailedDescriptionBonus;
    trustReasons.push("Job description is detailed enough to support legitimacy.");
  } else if (descriptionLength < scoringConfig.trust.sparseDescriptionThreshold) {
    trustScore -= scoringConfig.trust.sparseDescriptionPenalty;
    trustReasons.push("Description is unusually sparse.");
  }

  if (endpointStatus === ApplicationEndpointStatus.ACTIVE) {
    trustScore += scoringConfig.trust.endpointActiveBonus;
    trustReasons.push("Application endpoint appears active.");
  } else if (endpointStatus === ApplicationEndpointStatus.INACTIVE) {
    trustScore -= scoringConfig.trust.endpointInactivePenalty;
    trustReasons.push("Application endpoint appears inactive.");
  }

  if (inconsistentTitle) {
    trustScore -= scoringConfig.trust.inconsistentTitlePenalty;
    trustReasons.push("Linked sources disagree on title wording.");
  }

  if (inconsistentLocation) {
    trustScore -= scoringConfig.trust.inconsistentLocationPenalty;
    trustReasons.push("Linked sources disagree on location details.");
  }

  if (mirrorOnly) {
    trustScore -= scoringConfig.trust.mirrorOnlyPenalty;
    trustReasons.push("Only supplemental mirror-style sources remain.");
  }

  if (ambiguousFuzzyCluster && job.sources.length > 1) {
    trustScore -= scoringConfig.trust.fuzzyClusterPenalty;
    trustReasons.push("Cluster relies partly on fuzzy matching.");
  }

  trustScore = clampScore(trustScore);
  const trustLabel = toTrustLabel(trustScore);

  let freshnessScore: number = scoringConfig.freshness.baseScore;

  if (evidence.effectiveListingAgeDays <= scoringConfig.freshness.firstSeen.newestDays) {
    freshnessScore += scoringConfig.freshness.firstSeen.newestBonus;
    freshnessReasons.push("Listing looks newly posted or newly observed within the last 3 days.");
  } else if (evidence.effectiveListingAgeDays <= scoringConfig.freshness.firstSeen.recentDays) {
    freshnessScore += scoringConfig.freshness.firstSeen.recentBonus;
    freshnessReasons.push("Listing still looks recent within the past week.");
  } else if (evidence.effectiveListingAgeDays > scoringConfig.freshness.firstSeen.oldDays) {
    freshnessScore -= scoringConfig.freshness.firstSeen.oldPenalty;
    freshnessReasons.push("Source evidence suggests the listing has been around for more than 45 days.");
  } else if (evidence.effectiveListingAgeDays > scoringConfig.freshness.firstSeen.agingDays) {
    freshnessScore -= scoringConfig.freshness.firstSeen.agingPenalty;
    freshnessReasons.push("Source evidence suggests the listing is no longer especially new.");
  }

  if (
    evidence.sourceReportedDaysAgo !== null &&
    evidence.sourceReportedDaysAgo > evidence.firstSeenDaysAgo
  ) {
    freshnessReasons.push("Source-reported job age is older than our local observation history.");
  }

  if (evidence.lastSeenDaysAgo <= scoringConfig.freshness.lastSeen.recentDays) {
    freshnessScore += scoringConfig.freshness.lastSeen.recentBonus;
    freshnessReasons.push("Listing was seen again very recently.");
  } else if (evidence.lastSeenDaysAgo > scoringConfig.freshness.lastSeen.staleDays) {
    freshnessScore -= scoringConfig.freshness.lastSeen.stalePenalty;
    freshnessReasons.push("Listing has not been observed recently.");
  }

  if (endpointStatus === ApplicationEndpointStatus.ACTIVE) {
    freshnessScore += scoringConfig.freshness.endpointActiveBonus;
    freshnessReasons.push("Application endpoint is still active.");
  } else if (endpointStatus === ApplicationEndpointStatus.INACTIVE) {
    freshnessScore -= scoringConfig.freshness.endpointInactivePenalty;
    freshnessReasons.push("Official application endpoint no longer appears active.");
  }

  if (
    endpointStatus === ApplicationEndpointStatus.UNKNOWN &&
    (ambiguousFuzzyCluster || inconsistentTitle || inconsistentLocation)
  ) {
    freshnessScore -= scoringConfig.freshness.ambiguousClusterUnknownEndpointPenalty;
    freshnessReasons.push("Cluster disagreement lowers freshness confidence until the official posting is confirmed active.");
  }

  if (!job.officialSourceUrl) {
    freshnessScore -= scoringConfig.freshness.missingOfficialPenalty;
    freshnessReasons.push("Freshness confidence is lower without an official source.");
  }

  if (trustedAtsBoardRoot) {
    freshnessScore -= scoringConfig.freshness.companyLinkedBoardPenalty;
    freshnessReasons.push("A trusted ATS board root is useful evidence, but it is still less exact than a job-level official posting.");
  } else if (companyLinkedBoard) {
    freshnessScore -= scoringConfig.freshness.companyLinkedBoardPenalty;
    freshnessReasons.push("Company-board verification improves confidence, but it is still less exact than a job-level official posting.");
  }

  if (careersPageFallback) {
    freshnessScore -= scoringConfig.freshness.careersPageFallbackPenalty;
    freshnessReasons.push("A company careers hub is safer than no official source, but it is weaker than a job-specific posting.");
  }

  if (mirrorOnly) {
    freshnessScore -= scoringConfig.freshness.mirrorOnlyPenalty;
    freshnessReasons.push("Job persists only on supplemental sources.");
  }

  if (job.repostCount >= scoringConfig.freshness.repostPenaltyThreshold) {
    freshnessScore -= scoringConfig.freshness.repostPenalty;
    freshnessReasons.push(`Listing has already shown ${job.repostCount} repost cycles.`);
  }

  if (job.currentStatus !== "ACTIVE") {
    freshnessScore -= scoringConfig.freshness.inactiveJobPenalty;
    freshnessReasons.push("Canonical job is not currently marked active.");
  }

  freshnessScore = clampScore(freshnessScore);
  const freshnessLabel = toFreshnessLabel(
    freshnessScore,
    job.repostCount,
    Boolean(job.officialSourceUrl),
    officialSourceMethod,
    evidence.effectiveListingAgeDays,
  );

  let priorityScore = Math.round(trustScore * 0.5 + freshnessScore * 0.4);

  if (evidence.salaryPresent) {
    priorityScore += scoringConfig.priority.salaryPresentBonus;
    priorityReasons.push("Salary transparency makes the job easier to evaluate.");
  }

  if (job.remoteType !== "UNKNOWN") {
    priorityScore += scoringConfig.priority.knownRemoteTypeBonus;
  }

  if (job.officialSourceUrl) {
    priorityScore += scoringConfig.priority.officialApplyBonus;
    priorityReasons.push("Official apply path is available.");
  } else {
    priorityScore -= scoringConfig.priority.missingOfficialPenalty;
    priorityReasons.push("Missing official source keeps this below top application priority.");
  }

  if (ambiguousFuzzyCluster || inconsistentTitle || inconsistentLocation) {
    priorityScore -= scoringConfig.priority.ambiguousClusterPenalty;
    priorityReasons.push("Cluster disagreement lowers priority until the listing is reviewed.");
  }

  if (
    evidence.effectiveListingAgeDays > scoringConfig.freshness.firstSeen.oldDays &&
    (freshnessLabel === FreshnessLabel.FRESH || freshnessLabel === FreshnessLabel.AGING)
  ) {
    priorityScore -= scoringConfig.priority.olderFreshRolePenalty;
    priorityReasons.push("Older listings stay actionable, but they drop below true apply-now urgency.");
  }

  if (
    freshnessLabel === FreshnessLabel.AGING &&
    priorityScore >= scoringConfig.priority.labels.applyNowMin
  ) {
    priorityScore -= scoringConfig.priority.agingFreshnessPenalty;
    priorityReasons.push("Aging jobs can still be worth pursuing, but they stay below top urgency.");
  }

  if (trustLabel === TrustLabel.SUSPICIOUS_LOW_CONFIDENCE) {
    priorityScore -= scoringConfig.priority.suspiciousTrustPenalty;
    priorityReasons.push("Trust score is too weak to prioritize.");
  }

  if (
    freshnessLabel === FreshnessLabel.LIKELY_STALE ||
    freshnessLabel === FreshnessLabel.REPOSTED_REPEATEDLY
  ) {
    priorityScore -= scoringConfig.priority.stalePenalty;
    priorityReasons.push("Freshness risk lowers application priority.");
  }

  if (trustLabel === TrustLabel.HIGH_CONFIDENCE_REAL && freshnessLabel === FreshnessLabel.NEW) {
    priorityScore += scoringConfig.priority.highTrustNewBonus;
    priorityReasons.push("Strong trust plus strong freshness makes this worth acting on quickly.");
  }

  if (trustedAtsBoardRoot) {
    priorityScore -= scoringConfig.priority.companyLinkedBoardPenalty;
    priorityReasons.push("ATS-board-root confirmation is useful, but it stays below fully confirmed apply-now priority.");
  } else if (companyLinkedBoard) {
    priorityScore -= scoringConfig.priority.companyLinkedBoardPenalty;
    priorityReasons.push("Board-level official verification is useful, but it stays below fully confirmed apply-now priority.");
  }

  if (careersPageFallback) {
    priorityScore -= scoringConfig.priority.careersPageFallbackPenalty;
    priorityReasons.push("A company careers hub is not strong enough to justify top application priority by itself.");
  }

  priorityScore = clampScore(priorityScore);
  const priorityLabel = toPriorityLabel(priorityScore);

  const flags: ScoringFlags = {
    officialSourceMissing: !job.officialSourceUrl,
    officialSourceFallback: careersPageFallback,
    endpointInactive: endpointStatus === ApplicationEndpointStatus.INACTIVE,
    mirrorOnly,
    fuzzyCluster: ambiguousFuzzyCluster,
    inconsistentTitle,
    inconsistentLocation,
    sparseDescription: descriptionLength < 120,
  };

  if (priorityReasons.length === 0) {
    priorityReasons.push("Priority follows the combined trust and freshness view.");
  }

  return {
    canonicalJobId: job.id,
    scoredAt: now,
    trustScore,
    freshnessScore,
    priorityScore,
    trustLabel,
    freshnessLabel,
    priorityLabel,
    reasons: {
      trustReasons: dedupeReasons(trustReasons),
      freshnessReasons: dedupeReasons(freshnessReasons),
      priorityReasons: dedupeReasons(priorityReasons),
    },
    flags,
    evidence,
    snapshot: {
      sourceCount: job.sources.length,
      activeSourceCount,
      officialSourcePresent: Boolean(job.officialSourceUrl),
      applicationEndpointStatus: endpointStatus,
      descriptionHash: job.descriptionText ? hashText(job.descriptionText) : null,
      metadata: {
        sourceTypes: evidence.sourceTypes,
        officialSourceMethod,
        canonicalSourceType: evidence.canonicalSourceType,
        fuzzyMatchSourceCount: fuzzySourceCount,
        endpointStatusCode: endpointResult.statusCode,
      },
    },
  };
}

async function defaultEndpointChecker(job: CanonicalJobRecord): Promise<EndpointCheckResult> {
  const canonicalSource = job.sources.find((source) => source.isCanonicalSource) ?? job.sources[0] ?? null;
  const url = job.officialSourceUrl ?? canonicalSource?.rawJobListing.url ?? null;

  if (!url || !canonicalSource) {
    return {
      status: "UNKNOWN",
      statusCode: null,
    };
  }

  switch (canonicalSource.rawJobListing.source.sourceType) {
    case SourceType.GREENHOUSE:
      return checkGreenhouseJobActivity(url);
    case SourceType.LEVER:
      return checkLeverJobActivity(url);
    case SourceType.ASHBY:
      return checkAshbyJobActivity(url);
    default:
      return genericEndpointCheck(url);
  }
}

async function genericEndpointCheck(url: string): Promise<EndpointCheckResult> {
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      headers: {
        "User-Agent": "anti-ghost-job-search-engine/0.1",
      },
    });

    if (response.status === 404 || response.status === 410) {
      return {
        status: "INACTIVE",
        statusCode: response.status,
      };
    }

    if (response.ok || [301, 302, 307, 308].includes(response.status)) {
      return {
        status: "ACTIVE",
        statusCode: response.status,
      };
    }

    return {
      status: "UNKNOWN",
      statusCode: response.status,
    };
  } catch {
    return {
      status: "UNKNOWN",
      statusCode: null,
    };
  }
}

function mapEndpointStatus(status: EndpointCheckResult["status"]): ApplicationEndpointStatus {
  switch (status) {
    case "ACTIVE":
      return ApplicationEndpointStatus.ACTIVE;
    case "INACTIVE":
      return ApplicationEndpointStatus.INACTIVE;
    default:
      return ApplicationEndpointStatus.UNKNOWN;
  }
}

function toTrustLabel(score: number): TrustLabel {
  if (score >= scoringConfig.trust.labels.highConfidenceRealMin) {
    return TrustLabel.HIGH_CONFIDENCE_REAL;
  }

  if (score >= scoringConfig.trust.labels.mediumConfidenceMin) {
    return TrustLabel.MEDIUM_CONFIDENCE;
  }

  if (score >= scoringConfig.trust.labels.unverifiedSourceMin) {
    return TrustLabel.UNVERIFIED_SOURCE;
  }

  return TrustLabel.SUSPICIOUS_LOW_CONFIDENCE;
}

function toFreshnessLabel(
  score: number,
  repostCount: number,
  officialSourcePresent: boolean,
  officialSourceMethod: string | null,
  effectiveListingAgeDays: number,
): FreshnessLabel {
  if (
    repostCount >= scoringConfig.freshness.repostPenaltyThreshold &&
    score < scoringConfig.freshness.labels.freshMin
  ) {
    return FreshnessLabel.REPOSTED_REPEATEDLY;
  }

  if (!officialSourcePresent && score >= scoringConfig.freshness.labels.newMin) {
    return FreshnessLabel.FRESH;
  }

  if (
    (officialSourceMethod === officialSourceMethods.companyLinkedAtsBoard ||
      officialSourceMethod === officialSourceMethods.trustedAtsBoardRoot) &&
    score >= scoringConfig.freshness.labels.newMin
  ) {
    return FreshnessLabel.FRESH;
  }

  if (officialSourceMethod === officialSourceMethods.companyCareersPage && score >= scoringConfig.freshness.labels.freshMin) {
    return FreshnessLabel.AGING;
  }

  let label: FreshnessLabel;

  if (score >= scoringConfig.freshness.labels.newMin) {
    label = FreshnessLabel.NEW;
  } else if (score >= scoringConfig.freshness.labels.freshMin) {
    label = FreshnessLabel.FRESH;
  } else if (score >= scoringConfig.freshness.labels.agingMin) {
    label = FreshnessLabel.AGING;
  } else if (score >= scoringConfig.freshness.labels.possiblyStaleMin) {
    label = FreshnessLabel.POSSIBLY_STALE;
  } else {
    label = FreshnessLabel.LIKELY_STALE;
  }

  return capFreshnessLabelForAge(label, effectiveListingAgeDays);
}

function toPriorityLabel(score: number): PriorityLabel {
  if (score >= scoringConfig.priority.labels.applyNowMin) {
    return PriorityLabel.APPLY_NOW;
  }

  if (score >= scoringConfig.priority.labels.applySoonMin) {
    return PriorityLabel.APPLY_SOON;
  }

  if (score >= scoringConfig.priority.labels.lowPriorityMin) {
    return PriorityLabel.LOW_PRIORITY;
  }

  return PriorityLabel.AVOID_FOR_NOW;
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function dedupeReasons(reasons: string[]): string[] {
  return uniqueValues(reasons).slice(0, 4);
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function daysAgo(date: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)));
}

function uniqueValues<TValue>(values: TValue[]): TValue[] {
  return [...new Set(values)];
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function buildTitleAgreementKey(value: string): string {
  return normalizeText(value)
    .split(" ")
    .filter(Boolean)
    .sort()
    .join(" ");
}

function readMergeRule(value: Prisma.JsonValue | null): string {
  return isRecord(value) && typeof value.rule === "string" ? value.rule : "unknown";
}

function hasSharedRequisitionAcrossSources(sources: CanonicalJobRecord["sources"]): boolean {
  if (sources.length < 2) {
    return false;
  }

  const requisitionIds = uniqueValues(sources.map(readSourceRequisitionId).filter(Boolean));
  return requisitionIds.length === 1;
}

function readSourceRequisitionId(source: CanonicalJobRecord["sources"][number]): string | null {
  const payload = source.rawJobListing.payloadJson;
  if (!isRecord(payload)) {
    return null;
  }

  const normalized = payload.normalized;
  if (!isRecord(normalized)) {
    return null;
  }

  const canonicalHints = normalized.canonicalHints;
  return isRecord(canonicalHints) && typeof canonicalHints.requisitionId === "string"
    ? canonicalHints.requisitionId
    : null;
}

function isRecord(value: unknown): value is Record<string, Prisma.JsonValue> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function capFreshnessLabelForAge(
  label: FreshnessLabel,
  effectiveListingAgeDays: number,
): FreshnessLabel {
  if (effectiveListingAgeDays > scoringConfig.freshness.firstSeen.agingDays) {
    if (label === FreshnessLabel.NEW || label === FreshnessLabel.FRESH) {
      return FreshnessLabel.AGING;
    }

    return label;
  }

  if (effectiveListingAgeDays > scoringConfig.freshness.firstSeen.newestDays && label === FreshnessLabel.NEW) {
    return FreshnessLabel.FRESH;
  }

  return label;
}

function readSourceReportedDaysAgo(
  job: CanonicalJobRecord,
  canonicalSource: CanonicalJobRecord["sources"][number] | null,
  now: Date,
): number | null {
  const canonicalPostedAt = parseDateValue(canonicalSource?.rawJobListing.postedAtRaw ?? null);

  if (canonicalPostedAt) {
    return daysAgo(canonicalPostedAt, now);
  }

  const sourceReportedAges = job.sources
    .map((source) => parseDateValue(source.rawJobListing.postedAtRaw))
    .filter((value): value is Date => value !== null)
    .map((value) => daysAgo(value, now));

  if (sourceReportedAges.length === 0) {
    return null;
  }

  return Math.min(...sourceReportedAges);
}

function parseDateValue(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
}

function createCachedEndpointChecker(
  endpointChecker: (job: CanonicalJobRecord) => Promise<EndpointCheckResult>,
): (job: CanonicalJobRecord) => Promise<EndpointCheckResult> {
  const cache = new Map<string, Promise<EndpointCheckResult>>();

  return (job) => {
    const cacheKey = readEndpointCacheKey(job);

    if (!cache.has(cacheKey)) {
      cache.set(cacheKey, endpointChecker(job));
    }

    return cache.get(cacheKey) as Promise<EndpointCheckResult>;
  };
}

function readEndpointCacheKey(job: CanonicalJobRecord): string {
  const canonicalSource = job.sources.find((source) => source.isCanonicalSource) ?? job.sources[0] ?? null;
  const url = job.officialSourceUrl ?? canonicalSource?.rawJobListing.url ?? `job:${job.id}`;
  const sourceType = canonicalSource?.rawJobListing.source.sourceType ?? "UNKNOWN";
  return `${sourceType}:${url}`;
}

async function mapWithConcurrency<TInput, TOutput>(
  values: TInput[],
  concurrency: number,
  mapValue: (value: TInput, index: number) => Promise<TOutput>,
): Promise<TOutput[]> {
  const results = new Array<TOutput>(values.length);
  let nextIndex = 0;

  const workerCount = Math.min(Math.max(concurrency, 1), values.length || 1);
  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < values.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapValue(values[currentIndex] as TInput, currentIndex);
    }
  });

  await Promise.all(workers);

  return results;
}
