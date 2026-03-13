import type { JobSearchResult } from "@anti-ghost/domain";

export type SavedSearchCheckPoint = {
  checkedAt: string;
  matchedJobCount: number;
  applyNowCount: number;
  applySoonCount: number;
  officialSourceCount: number;
};

export type SavedSearchCheckTrend = {
  direction: "growing" | "shrinking" | "stable";
  windowChecks: number;
  deltaMatches: number;
  deltaApplyNow: number;
  deltaOfficialSourceCount: number;
};

export type SavedSearchCheckSummary = {
  checkedAt: string;
  matchedJobCount: number;
  applyNowCount: number;
  applySoonCount: number;
  officialSourceCount: number;
  trend: SavedSearchCheckTrend | null;
  recentChecks: SavedSearchCheckPoint[];
  comparison: {
    previousCheckedAt: string;
    newMatchesCount: number;
    droppedMatchesCount: number;
  } | null;
  topNewMatches: JobSearchResult[];
};

type SavedSearchCheckDraft = {
  checkedAt: string;
  matchedJobCount: number;
  applyNowCount: number;
  applySoonCount: number;
  officialSourceCount: number;
  trend: SavedSearchCheckTrend | null;
  recentChecks: SavedSearchCheckPoint[];
  comparison: {
    previousCheckedAt: string;
    newMatchesCount: number;
    droppedMatchesCount: number;
  } | null;
  topNewMatchIds: string[];
};

type SavedSearchSnapshotRow = {
  checkedAt: Date;
  matchedJobCount: number;
  applyNowCount: number;
  applySoonCount: number;
  officialSourceCount: number;
  matchedJobIdsJson: unknown;
};

export function buildSavedSearchCheckDraft(
  snapshots: SavedSearchSnapshotRow[],
): SavedSearchCheckDraft | null {
  const latestSnapshot = snapshots[0];

  if (!latestSnapshot) {
    return null;
  }

  const latestIds = readStringArray(latestSnapshot.matchedJobIdsJson);
  const previousSnapshot = snapshots[1] ?? null;
  const previousIds = previousSnapshot ? readStringArray(previousSnapshot.matchedJobIdsJson) : [];
  const previousIdSet = new Set(previousIds);
  const latestIdSet = new Set(latestIds);
  const recentChecks = snapshots.slice(0, 5).map((snapshot) => ({
    checkedAt: snapshot.checkedAt.toISOString(),
    matchedJobCount: snapshot.matchedJobCount,
    applyNowCount: snapshot.applyNowCount,
    applySoonCount: snapshot.applySoonCount,
    officialSourceCount: snapshot.officialSourceCount,
  }));
  const oldestSnapshot = snapshots.at(-1) ?? null;
  const topNewMatchIds = previousSnapshot
    ? latestIds.filter((jobId) => !previousIdSet.has(jobId)).slice(0, 3)
    : [];

  return {
    checkedAt: latestSnapshot.checkedAt.toISOString(),
    matchedJobCount: latestSnapshot.matchedJobCount,
    applyNowCount: latestSnapshot.applyNowCount,
    applySoonCount: latestSnapshot.applySoonCount,
    officialSourceCount: latestSnapshot.officialSourceCount,
    trend:
      oldestSnapshot && oldestSnapshot !== latestSnapshot
        ? {
            direction:
              latestSnapshot.matchedJobCount > oldestSnapshot.matchedJobCount
                ? "growing"
                : latestSnapshot.matchedJobCount < oldestSnapshot.matchedJobCount
                  ? "shrinking"
                  : "stable",
            windowChecks: recentChecks.length,
            deltaMatches: latestSnapshot.matchedJobCount - oldestSnapshot.matchedJobCount,
            deltaApplyNow: latestSnapshot.applyNowCount - oldestSnapshot.applyNowCount,
            deltaOfficialSourceCount:
              latestSnapshot.officialSourceCount - oldestSnapshot.officialSourceCount,
          }
        : null,
    recentChecks,
    comparison: previousSnapshot
      ? {
          previousCheckedAt: previousSnapshot.checkedAt.toISOString(),
          newMatchesCount: latestIds.filter((jobId) => !previousIdSet.has(jobId)).length,
          droppedMatchesCount: previousIds.filter((jobId) => !latestIdSet.has(jobId)).length,
        }
      : null,
    topNewMatchIds,
  };
}

export function mapSavedSearchCheckRow(
  snapshots: SavedSearchSnapshotRow[],
): SavedSearchCheckSummary | null {
  return mapSavedSearchCheckDraft(buildSavedSearchCheckDraft(snapshots), new Map());
}

export function mapSavedSearchCheckDraft(
  draft: SavedSearchCheckDraft | null,
  previewJobMap: Map<string, JobSearchResult>,
): SavedSearchCheckSummary | null {
  if (!draft) {
    return null;
  }

  return {
    checkedAt: draft.checkedAt,
    matchedJobCount: draft.matchedJobCount,
    applyNowCount: draft.applyNowCount,
    applySoonCount: draft.applySoonCount,
    officialSourceCount: draft.officialSourceCount,
    trend: draft.trend,
    recentChecks: draft.recentChecks,
    comparison: draft.comparison,
    topNewMatches: draft.topNewMatchIds
      .map((jobId) => previewJobMap.get(jobId))
      .filter((job): job is JobSearchResult => Boolean(job)),
  };
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
