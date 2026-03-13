import { disconnectPrisma, prisma, type Prisma } from "@anti-ghost/database";

import { scoringConfig } from "../config";

async function main() {
  const limit = parseLimit(process.argv.slice(2));
  const rows = await prisma.canonicalJob.findMany({
    include: {
      canonicalCompany: true,
      reviews: {
        orderBy: {
          createdAt: "desc",
        },
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

  const reportJobs = rows.map((row) => {
    const latestScore = row.scores[0] ?? null;

    return {
      id: row.id,
      title: row.canonicalTitle,
      company: row.canonicalCompany?.displayName ?? "Unknown company",
      companyId: row.canonicalCompany?.id ?? null,
      companyPrimaryDomain: row.canonicalCompany?.primaryDomain ?? null,
      companyCareersUrl: row.canonicalCompany?.careersUrl ?? null,
      companyCareersUrlSource: readCompanyCareersUrlSource(row.canonicalCompany?.enrichmentEvidenceJson ?? null),
      companyEnrichmentEvidencePresent: row.canonicalCompany?.enrichmentEvidenceJson !== null,
      officialSourceUrl: row.officialSourceUrl,
      officialSourceMethod: row.officialSourceMethod,
      reviews: row.reviews.map((review) => ({
        id: review.id,
        reviewType: review.reviewType,
        disposition: review.disposition,
        summary: review.summary,
        createdAt: review.createdAt.toISOString(),
      })),
      score:
        latestScore === null
          ? null
          : {
              scoredAt: latestScore.scoredAt.toISOString(),
              trustLabel: latestScore.trustLabel,
              freshnessLabel: latestScore.freshnessLabel,
              priorityLabel: latestScore.priorityLabel,
              trustScore: latestScore.trustScore,
              freshnessScore: latestScore.freshnessScore,
              priorityScore: latestScore.priorityScore,
              flags: parseFlags(latestScore.flagsJson),
              reasons: parseReasons(latestScore.reasonsJson),
            },
    };
  });

  const scoredJobs = reportJobs.filter((job) => job.score !== null);
  const unscoredJobs = reportJobs.filter((job) => job.score === null);
  const reviewedJobs = reportJobs.filter((job) => job.reviews.length > 0);
  const followUpReviewJobs = reportJobs.filter((job) =>
    job.reviews.some((review) => review.disposition === "NEEDS_FOLLOW_UP"),
  );
  const missingOfficialActionableJobs = scoredJobs.filter(
    (job) =>
      !job.officialSourceUrl &&
      job.score !== null &&
      job.score.priorityLabel !== "AVOID_FOR_NOW",
  );
  const enrichmentBackfilledJobs = scoredJobs.filter(
    (job) =>
      job.officialSourceMethod === "company_linked_exact_job" ||
      job.officialSourceMethod === "company_linked_ats_board" ||
      job.officialSourceMethod === "company_careers_page",
  );
  const ambiguousClusterJobs = scoredJobs.filter((job) =>
    job.score
      ? job.score.flags.includes("fuzzyCluster") ||
        job.score.flags.includes("inconsistentTitle") ||
        job.score.flags.includes("inconsistentLocation")
      : false,
  );
  const ambiguousReviewCandidateJobs = ambiguousClusterJobs.filter(
    (job) =>
      job.score !== null &&
      job.score.trustLabel !== "SUSPICIOUS_LOW_CONFIDENCE" &&
      !["LIKELY_STALE", "REPOSTED_REPEATEDLY"].includes(job.score.freshnessLabel) &&
      job.score.priorityLabel !== "AVOID_FOR_NOW",
  );
  const ambiguousRejectedJobs = ambiguousClusterJobs.filter(
    (job) =>
      job.score !== null &&
      (job.score.trustLabel === "SUSPICIOUS_LOW_CONFIDENCE" ||
        ["LIKELY_STALE", "REPOSTED_REPEATEDLY"].includes(job.score.freshnessLabel) ||
        job.score.priorityLabel === "AVOID_FOR_NOW"),
  );
  const calibrationCandidateJobs = uniqueJobsById([
    ...missingOfficialActionableJobs,
    ...ambiguousReviewCandidateJobs,
  ]);
  const reportJobsWithReviewMeta = reportJobs.map((job) =>
    addReviewQueueMeta(job, {
      missingOfficialActionable: missingOfficialActionableJobs.some((candidate) => candidate.id === job.id),
      ambiguousReviewCandidate: ambiguousReviewCandidateJobs.some((candidate) => candidate.id === job.id),
    }),
  );
  const reviewBacklogJobs = reportJobsWithReviewMeta
    .filter((job) => job.reviewBacklog)
    .sort((left, right) => right.reviewPriorityScore - left.reviewPriorityScore || left.company.localeCompare(right.company));
  const firstPassReviewJobs = reviewBacklogJobs.filter((job) => job.reviewStatus === "NEEDS_FIRST_PASS");
  const reviewedResolvedJobs = reportJobsWithReviewMeta
    .filter((job) => job.reviewStatus === "REVIEWED_RESOLVED")
    .sort((left, right) => left.company.localeCompare(right.company) || left.title.localeCompare(right.title));
  const companyCoverageRows = summarizeCompanyCoverage(reportJobsWithReviewMeta);
  const unresolvedCompanies = companyCoverageRows.filter(
    (company) => !company.primaryDomainResolved || !company.careersUrlResolved,
  );
  const officialSourceResolvedCount = reportJobs.filter((job) => Boolean(job.officialSourceUrl)).length;

  const report = {
    generatedAt: new Date().toISOString(),
    modelVersion: scoringConfig.modelVersion,
    dataset: {
      canonicalJobs: rows.length,
      scoredJobs: scoredJobs.length,
      unscoredJobs: unscoredJobs.length,
    },
    thresholds: {
      trust: scoringConfig.trust.labels,
      freshness: {
        ...scoringConfig.freshness.labels,
        repostPenaltyThreshold: scoringConfig.freshness.repostPenaltyThreshold,
      },
      priority: scoringConfig.priority.labels,
    },
    counts: {
      trust: countByLabel(scoredJobs, (job) => job.score?.trustLabel ?? "UNSCORED"),
      freshness: countByLabel(scoredJobs, (job) => job.score?.freshnessLabel ?? "UNSCORED"),
      priority: countByLabel(scoredJobs, (job) => job.score?.priorityLabel ?? "UNSCORED"),
      flags: countFlags(scoredJobs),
      officialSourceMethods: countByLabel(reportJobs, (job) => job.officialSourceMethod ?? "UNSET"),
      reviewStatuses: countByLabel(reportJobsWithReviewMeta, (job) => job.reviewStatus),
      reviewDispositions: countReviewDispositions(reportJobs),
      reviewTypes: countReviewTypes(reportJobs),
    },
    diagnostics: {
      officialSourceCoverage: {
        jobs: reportJobs.length,
        officialSourcePresent: officialSourceResolvedCount,
        officialSourceMissing: reportJobs.length - officialSourceResolvedCount,
        methodCounts: countByLabel(reportJobs, (job) => job.officialSourceMethod ?? "UNSET"),
      },
      companyEnrichmentCoverage: {
        companies: companyCoverageRows.length,
        primaryDomainResolved: companyCoverageRows.filter((company) => company.primaryDomainResolved).length,
        careersUrlResolved: companyCoverageRows.filter((company) => company.careersUrlResolved).length,
        enrichmentEvidencePresent: companyCoverageRows.filter((company) => company.enrichmentEvidencePresent).length,
        careersUrlSourceCounts: countByLabel(
          companyCoverageRows,
          (company) => company.careersUrlSource ?? "UNSET",
        ),
      },
      reviewerAnnotationCoverage: {
        jobs: reportJobs.length,
        reviewedJobs: reviewedJobs.length,
        reviewBacklogJobs: reviewBacklogJobs.length,
        firstPassReviewJobs: firstPassReviewJobs.length,
        followUpReviewJobs: followUpReviewJobs.length,
        reviewedResolvedJobs: reviewedResolvedJobs.length,
        annotationCount: reportJobs.reduce((total, job) => total + job.reviews.length, 0),
        reviewStatuses: countByLabel(reportJobsWithReviewMeta, (job) => job.reviewStatus),
        dispositions: countReviewDispositions(reportJobs),
        reviewTypes: countReviewTypes(reportJobs),
      },
      overallAverages: averageScores(scoredJobs),
      topReasons: {
        trust: topReasons(scoredJobs, (job) => job.score?.reasons.trustReasons ?? []),
        freshness: topReasons(scoredJobs, (job) => job.score?.reasons.freshnessReasons ?? []),
        priority: topReasons(scoredJobs, (job) => job.score?.reasons.priorityReasons ?? []),
      },
      queueAverages: {
        calibrationCandidates: averageScores(calibrationCandidateJobs),
        enrichmentBackfilled: averageScores(enrichmentBackfilledJobs),
        reviewBacklog: averageScores(reviewBacklogJobs),
        firstPassReview: averageScores(firstPassReviewJobs),
        reviewerFollowUp: averageScores(followUpReviewJobs),
        missingOfficialActionable: averageScores(missingOfficialActionableJobs),
        ambiguousClusters: averageScores(ambiguousClusterJobs),
        ambiguousReviewCandidates: averageScores(ambiguousReviewCandidateJobs),
        ambiguousRejected: averageScores(ambiguousRejectedJobs),
      },
      queueReasonHighlights: {
        calibrationCandidates: {
          trust: topReasons(calibrationCandidateJobs, (job) => job.score?.reasons.trustReasons ?? []),
          freshness: topReasons(calibrationCandidateJobs, (job) => job.score?.reasons.freshnessReasons ?? []),
          priority: topReasons(calibrationCandidateJobs, (job) => job.score?.reasons.priorityReasons ?? []),
        },
        enrichmentBackfilled: {
          trust: topReasons(enrichmentBackfilledJobs, (job) => job.score?.reasons.trustReasons ?? []),
          freshness: topReasons(enrichmentBackfilledJobs, (job) => job.score?.reasons.freshnessReasons ?? []),
          priority: topReasons(enrichmentBackfilledJobs, (job) => job.score?.reasons.priorityReasons ?? []),
        },
        reviewBacklog: {
          trust: topReasons(reviewBacklogJobs, (job) => job.score?.reasons.trustReasons ?? []),
          freshness: topReasons(reviewBacklogJobs, (job) => job.score?.reasons.freshnessReasons ?? []),
          priority: topReasons(reviewBacklogJobs, (job) => job.score?.reasons.priorityReasons ?? []),
        },
        firstPassReview: {
          trust: topReasons(firstPassReviewJobs, (job) => job.score?.reasons.trustReasons ?? []),
          freshness: topReasons(firstPassReviewJobs, (job) => job.score?.reasons.freshnessReasons ?? []),
          priority: topReasons(firstPassReviewJobs, (job) => job.score?.reasons.priorityReasons ?? []),
        },
        reviewerFollowUp: {
          trust: topReasons(followUpReviewJobs, (job) => job.score?.reasons.trustReasons ?? []),
          freshness: topReasons(followUpReviewJobs, (job) => job.score?.reasons.freshnessReasons ?? []),
          priority: topReasons(followUpReviewJobs, (job) => job.score?.reasons.priorityReasons ?? []),
        },
        missingOfficialActionable: {
          trust: topReasons(
            missingOfficialActionableJobs,
            (job) => job.score?.reasons.trustReasons ?? [],
          ),
          freshness: topReasons(
            missingOfficialActionableJobs,
            (job) => job.score?.reasons.freshnessReasons ?? [],
          ),
          priority: topReasons(
            missingOfficialActionableJobs,
            (job) => job.score?.reasons.priorityReasons ?? [],
          ),
        },
        ambiguousClusters: {
          trust: topReasons(ambiguousClusterJobs, (job) => job.score?.reasons.trustReasons ?? []),
          freshness: topReasons(ambiguousClusterJobs, (job) => job.score?.reasons.freshnessReasons ?? []),
          priority: topReasons(ambiguousClusterJobs, (job) => job.score?.reasons.priorityReasons ?? []),
        },
        ambiguousReviewCandidates: {
          trust: topReasons(ambiguousReviewCandidateJobs, (job) => job.score?.reasons.trustReasons ?? []),
          freshness: topReasons(ambiguousReviewCandidateJobs, (job) => job.score?.reasons.freshnessReasons ?? []),
          priority: topReasons(ambiguousReviewCandidateJobs, (job) => job.score?.reasons.priorityReasons ?? []),
        },
        ambiguousRejected: {
          trust: topReasons(ambiguousRejectedJobs, (job) => job.score?.reasons.trustReasons ?? []),
          freshness: topReasons(ambiguousRejectedJobs, (job) => job.score?.reasons.freshnessReasons ?? []),
          priority: topReasons(ambiguousRejectedJobs, (job) => job.score?.reasons.priorityReasons ?? []),
        },
      },
    },
    queues: {
      unscored: unscoredJobs.slice(0, limit).map(toSummary),
      reviewBacklog: reviewBacklogJobs.slice(0, limit).map(toSummary),
      firstPassReview: firstPassReviewJobs.slice(0, limit).map(toSummary),
      calibrationCandidates: calibrationCandidateJobs.slice(0, limit).map(toSummary),
      enrichmentBackfilled: enrichmentBackfilledJobs.slice(0, limit).map(toSummary),
      reviewerFollowUp: followUpReviewJobs.slice(0, limit).map(toSummary),
      reviewedJobs: reviewedJobs.slice(0, limit).map(toSummary),
      reviewedResolved: reviewedResolvedJobs.slice(0, limit).map(toSummary),
      topCompanies: companyCoverageRows.slice(0, limit),
      suspiciousTrust: scoredJobs
        .filter((job) => job.score?.trustLabel === "SUSPICIOUS_LOW_CONFIDENCE")
        .slice(0, limit)
        .map(toSummary),
      freshnessRisk: scoredJobs
        .filter((job) =>
          job.score
            ? ["LIKELY_STALE", "REPOSTED_REPEATEDLY"].includes(job.score.freshnessLabel)
            : false,
        )
        .slice(0, limit)
        .map(toSummary),
      avoidForNow: scoredJobs
        .filter((job) => job.score?.priorityLabel === "AVOID_FOR_NOW")
        .slice(0, limit)
        .map(toSummary),
      missingOfficialActionable: missingOfficialActionableJobs.slice(0, limit).map(toSummary),
      unresolvedCompanies: unresolvedCompanies.slice(0, limit),
      ambiguousClusters: ambiguousClusterJobs.slice(0, limit).map(toSummary),
      ambiguousReviewCandidates: ambiguousReviewCandidateJobs.slice(0, limit).map(toSummary),
      ambiguousRejected: ambiguousRejectedJobs.slice(0, limit).map(toSummary),
      applyNow: scoredJobs
        .filter((job) => job.score?.priorityLabel === "APPLY_NOW")
        .slice(0, limit)
        .map(toSummary),
    },
  };

  console.log(JSON.stringify(report, null, 2));
}

type ReportJob = {
  id: string;
  title: string;
  company: string;
  companyId: string | null;
  companyPrimaryDomain: string | null;
  companyCareersUrl: string | null;
  companyCareersUrlSource: string | null;
  companyEnrichmentEvidencePresent: boolean;
  officialSourceUrl: string | null;
  officialSourceMethod: string | null;
  reviews: Array<{
    id: string;
    reviewType: string;
    disposition: string;
    summary: string;
    createdAt: string;
  }>;
  score: {
    scoredAt: string;
    trustLabel: string;
    freshnessLabel: string;
    priorityLabel: string;
    trustScore: number;
    freshnessScore: number;
    priorityScore: number;
    flags: string[];
    reasons: {
      trustReasons: string[];
      freshnessReasons: string[];
      priorityReasons: string[];
    };
  } | null;
};

type ReviewMetaJob = ReportJob & {
  reviewStatus: "FOLLOW_UP" | "NEEDS_FIRST_PASS" | "REVIEWED_RESOLVED" | "UNREVIEWED_STABLE";
  reviewBacklog: boolean;
  reviewPriorityScore: number;
};

type CompanyCoverageSummary = {
  companyId: string | null;
  company: string;
  activeCanonicalJobs: number;
  reviewBacklogJobs: number;
  firstPassReviewJobs: number;
  followUpReviewJobs: number;
  reviewedJobs: number;
  reviewedResolvedJobs: number;
  highestReviewPriorityScore: number;
  latestReviewSummary: string | null;
  latestReviewDisposition: string | null;
  latestReviewType: string | null;
  latestReviewAt: string | null;
  primaryDomainResolved: boolean;
  careersUrlResolved: boolean;
  careersUrlSource: string | null;
  enrichmentEvidencePresent: boolean;
  officialSourceMethods: string[];
};

function parseLimit(argv: string[]): number {
  const limitArg = argv.find((value) => value.startsWith("--limit="));
  const parsed = limitArg ? Number(limitArg.split("=")[1]) : 5;
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 20) : 5;
}

function countByLabel<TItem>(jobs: TItem[], getLabel: (job: TItem) => string): Record<string, number> {
  return jobs.reduce<Record<string, number>>((accumulator, job) => {
    const label = getLabel(job);
    accumulator[label] = (accumulator[label] ?? 0) + 1;
    return accumulator;
  }, {});
}

function countFlags(jobs: ReportJob[]): Record<string, number> {
  return jobs.reduce<Record<string, number>>((accumulator, job) => {
    for (const flag of job.score?.flags ?? []) {
      accumulator[flag] = (accumulator[flag] ?? 0) + 1;
    }

    return accumulator;
  }, {});
}

function countReviewDispositions(jobs: ReportJob[]): Record<string, number> {
  return jobs.reduce<Record<string, number>>((accumulator, job) => {
    for (const review of job.reviews) {
      accumulator[review.disposition] = (accumulator[review.disposition] ?? 0) + 1;
    }

    return accumulator;
  }, {});
}

function countReviewTypes(jobs: ReportJob[]): Record<string, number> {
  return jobs.reduce<Record<string, number>>((accumulator, job) => {
    for (const review of job.reviews) {
      accumulator[review.reviewType] = (accumulator[review.reviewType] ?? 0) + 1;
    }

    return accumulator;
  }, {});
}

function parseFlags(value: Prisma.JsonValue | null): string[] {
  if (!isRecord(value)) {
    return [];
  }

  return Object.entries(value)
    .filter(([, flagValue]) => flagValue === true)
    .map(([key]) => key);
}

function parseReasons(value: Prisma.JsonValue | null): {
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

function averageScores(jobs: ReportJob[]) {
  const scoredJobs = jobs.filter((job): job is ReportJob & { score: NonNullable<ReportJob["score"]> } => job.score !== null);

  if (scoredJobs.length === 0) {
    return {
      jobs: 0,
      trustScore: null,
      freshnessScore: null,
      priorityScore: null,
    };
  }

  const totals = scoredJobs.reduce(
    (accumulator, job) => ({
      trustScore: accumulator.trustScore + job.score.trustScore,
      freshnessScore: accumulator.freshnessScore + job.score.freshnessScore,
      priorityScore: accumulator.priorityScore + job.score.priorityScore,
    }),
    {
      trustScore: 0,
      freshnessScore: 0,
      priorityScore: 0,
    },
  );

  return {
    jobs: scoredJobs.length,
    trustScore: Math.round(totals.trustScore / scoredJobs.length),
    freshnessScore: Math.round(totals.freshnessScore / scoredJobs.length),
    priorityScore: Math.round(totals.priorityScore / scoredJobs.length),
  };
}

function topReasons(
  jobs: ReportJob[],
  selectReasons: (job: ReportJob) => string[],
): Array<{ reason: string; count: number }> {
  const counts = jobs.reduce<Map<string, number>>((accumulator, job) => {
    for (const reason of selectReasons(job)) {
      accumulator.set(reason, (accumulator.get(reason) ?? 0) + 1);
    }

    return accumulator;
  }, new Map());

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 5)
    .map(([reason, count]) => ({ reason, count }));
}

function toSummary(job: ReviewMetaJob | ReportJob) {
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    officialSourcePresent: Boolean(job.officialSourceUrl),
    officialSourceMethod: job.officialSourceMethod,
    reviewStatus: "reviewStatus" in job ? job.reviewStatus : undefined,
    reviewPriorityScore: "reviewPriorityScore" in job ? job.reviewPriorityScore : undefined,
    score: job.score,
  };
}

function uniqueJobsById(jobs: ReportJob[]): ReportJob[] {
  return [...new Map(jobs.map((job) => [job.id, job])).values()];
}

function summarizeCompanyCoverage(jobs: ReviewMetaJob[]): CompanyCoverageSummary[] {
  const companies = new Map<string, CompanyCoverageSummary>();

  for (const job of jobs) {
    const key = job.companyId ?? `company:${job.company}`;
    const existing = companies.get(key);

    if (existing) {
      existing.activeCanonicalJobs += 1;
      existing.reviewBacklogJobs += job.reviewBacklog ? 1 : 0;
      existing.firstPassReviewJobs += job.reviewStatus === "NEEDS_FIRST_PASS" ? 1 : 0;
      existing.followUpReviewJobs += job.reviewStatus === "FOLLOW_UP" ? 1 : 0;
      existing.reviewedJobs += job.reviews.length > 0 ? 1 : 0;
      existing.reviewedResolvedJobs += job.reviewStatus === "REVIEWED_RESOLVED" ? 1 : 0;
      existing.highestReviewPriorityScore = Math.max(existing.highestReviewPriorityScore, job.reviewPriorityScore);
      existing.primaryDomainResolved ||= Boolean(job.companyPrimaryDomain);
      existing.careersUrlResolved ||= Boolean(job.companyCareersUrl);
      existing.careersUrlSource ??= job.companyCareersUrlSource;
      existing.enrichmentEvidencePresent ||= job.companyEnrichmentEvidencePresent;

      const latestReview = job.reviews[0] ?? null;
      if (
        latestReview &&
        (!existing.latestReviewAt || new Date(latestReview.createdAt).getTime() > new Date(existing.latestReviewAt).getTime())
      ) {
        existing.latestReviewSummary = latestReview.summary;
        existing.latestReviewDisposition = latestReview.disposition;
        existing.latestReviewType = latestReview.reviewType;
        existing.latestReviewAt = latestReview.createdAt;
      }

      if (job.officialSourceMethod && !existing.officialSourceMethods.includes(job.officialSourceMethod)) {
        existing.officialSourceMethods.push(job.officialSourceMethod);
        existing.officialSourceMethods.sort();
      }

      continue;
    }

    companies.set(key, {
      companyId: job.companyId,
      company: job.company,
      activeCanonicalJobs: 1,
      reviewBacklogJobs: job.reviewBacklog ? 1 : 0,
      firstPassReviewJobs: job.reviewStatus === "NEEDS_FIRST_PASS" ? 1 : 0,
      followUpReviewJobs: job.reviewStatus === "FOLLOW_UP" ? 1 : 0,
      reviewedJobs: job.reviews.length > 0 ? 1 : 0,
      reviewedResolvedJobs: job.reviewStatus === "REVIEWED_RESOLVED" ? 1 : 0,
      highestReviewPriorityScore: job.reviewPriorityScore,
      latestReviewSummary: job.reviews[0]?.summary ?? null,
      latestReviewDisposition: job.reviews[0]?.disposition ?? null,
      latestReviewType: job.reviews[0]?.reviewType ?? null,
      latestReviewAt: job.reviews[0]?.createdAt ?? null,
      primaryDomainResolved: Boolean(job.companyPrimaryDomain),
      careersUrlResolved: Boolean(job.companyCareersUrl),
      careersUrlSource: job.companyCareersUrlSource,
      enrichmentEvidencePresent: job.companyEnrichmentEvidencePresent,
      officialSourceMethods: job.officialSourceMethod ? [job.officialSourceMethod] : [],
    });
  }

  return [...companies.values()].sort(
    (left, right) =>
      right.reviewBacklogJobs - left.reviewBacklogJobs ||
      right.followUpReviewJobs - left.followUpReviewJobs ||
      right.firstPassReviewJobs - left.firstPassReviewJobs ||
      right.highestReviewPriorityScore - left.highestReviewPriorityScore ||
      right.activeCanonicalJobs - left.activeCanonicalJobs ||
      left.company.localeCompare(right.company),
  );
}

function isRecord(value: unknown): value is Record<string, Prisma.JsonValue> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readStringArray(value: Prisma.JsonValue | undefined): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function readCompanyCareersUrlSource(value: Prisma.JsonValue | null): string | null {
  if (!isRecord(value)) {
    return null;
  }

  return typeof value.careersUrlSource === "string" ? value.careersUrlSource : null;
}

function addReviewQueueMeta(
  job: ReportJob,
  inputs: {
    missingOfficialActionable: boolean;
    ambiguousReviewCandidate: boolean;
  },
): ReviewMetaJob {
  const needsFollowUpReview = job.reviews.some((review) => review.disposition === "NEEDS_FOLLOW_UP");
  const needsScoreReview =
    job.score === null ||
    job.score.priorityLabel === "AVOID_FOR_NOW" ||
    job.score.trustLabel === "UNVERIFIED_SOURCE" ||
    job.score.trustLabel === "SUSPICIOUS_LOW_CONFIDENCE" ||
    ["LIKELY_STALE", "REPOSTED_REPEATEDLY"].includes(job.score.freshnessLabel) ||
    job.score.flags.length > 0;
  const needsFirstPassReview =
    job.reviews.length === 0 &&
    (inputs.missingOfficialActionable || inputs.ambiguousReviewCandidate || needsScoreReview);
  const reviewStatus = needsFollowUpReview
    ? "FOLLOW_UP"
    : needsFirstPassReview
      ? "NEEDS_FIRST_PASS"
      : job.reviews.length > 0
        ? "REVIEWED_RESOLVED"
        : "UNREVIEWED_STABLE";
  const reviewPriorityScore =
    (needsFollowUpReview ? 100 : 0) +
    (needsFirstPassReview ? 70 : 0) +
    (inputs.missingOfficialActionable ? 16 : 0) +
    (inputs.ambiguousReviewCandidate ? 14 : 0) +
    (needsScoreReview ? 10 : 0) -
    (reviewStatus === "REVIEWED_RESOLVED" ? 25 : 0);

  return {
    ...job,
    reviewStatus,
    reviewBacklog: needsFollowUpReview || needsFirstPassReview,
    reviewPriorityScore,
  };
}

main().catch((error) => {
  const detail = error instanceof Error ? error.message : "Unknown error";
  console.error(`Score report failed. Confirm DATABASE_URL and local Postgres availability.\n${detail}`);
  process.exitCode = 1;
}).finally(async () => {
  await disconnectPrisma();
});
