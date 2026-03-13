import type { AlertStatus } from "@anti-ghost/database";
import { prisma } from "@anti-ghost/database";

import { mapAlertRunSummary, type AlertRunSummary } from "@/lib/alert-execution";
import {
  alertCadenceOptions,
  cadenceFromSchedule,
  type AlertCadence,
  isAlertDue,
  isAlertDueSinceReference,
} from "@/lib/alert-schedule";
import { getCurrentUser, type AuthViewer } from "@/lib/auth";
import { getSearchJobMapByIds } from "@/lib/jobs";
import {
  buildSavedSearchCheckDraft,
  mapSavedSearchCheckDraft,
  type SavedSearchCheckSummary,
} from "@/lib/saved-search-checks";
import {
  buildSavedSearchName,
  buildSearchHrefFromFilters,
  parseStoredSearchFilters,
  summarizeSearchFilters,
} from "@/lib/search-filters";

export type AlertSummary = {
  id: string;
  name: string;
  status: AlertStatus;
  cadence: AlertCadence;
  cadenceLabel: string;
  lastSentAt: string | null;
  dueNow: boolean;
  latestRun: AlertRunSummary | null;
  latestDueRun: AlertRunSummary | null;
  autoRefreshStatus: "HEALTHY" | "WAITING" | "OVERDUE" | "FAILING" | "PAUSED";
};

export type AlertView = AlertSummary & {
  recentRuns: AlertRunSummary[];
  savedSearch: {
    id: string;
    name: string;
    href: string;
    summary: string[];
    latestCheck: SavedSearchCheckSummary | null;
  };
};

export async function getAlertsPageData(): Promise<{
  viewer: AuthViewer | null;
  alerts: AlertView[];
  usingFallbackData: boolean;
}> {
  const viewer = await getCurrentUser();

  if (!viewer) {
    return {
      viewer: null,
      alerts: [],
      usingFallbackData: false,
    };
  }

  try {
    const rows = await prisma.alert.findMany({
      where: {
        userId: viewer.id,
      },
      include: {
        savedSearch: {
          include: {
            snapshots: {
              orderBy: [
                {
                  checkedAt: "desc",
                },
                {
                  createdAt: "desc",
                },
              ],
              take: 5,
            },
          },
        },
        runs: {
          orderBy: [
            {
              startedAt: "desc",
            },
            {
              createdAt: "desc",
            },
          ],
          take: 5,
        },
      },
      orderBy: [
        {
          status: "asc",
        },
        {
          updatedAt: "desc",
        },
      ],
    });
    const checkDrafts = rows.map((row) => buildSavedSearchCheckDraft(row.savedSearch?.snapshots ?? []));
    const previewJobMap = await getSearchJobMapByIds(
      Array.from(
        new Set(
          checkDrafts.flatMap((draft) => draft?.topNewMatchIds ?? []),
        ),
      ),
      viewer.id,
    );

    return {
      viewer,
      alerts: rows
        .filter((row) => row.savedSearch)
        .map((row, index) => ({
          ...mapAlertSummary(row.id, row.name, row.status, row.scheduleCron, row.lastSentAt, row.createdAt, row.runs),
          recentRuns: row.runs
            .map((run) => mapAlertRunSummary(run))
            .filter((run): run is AlertRunSummary => Boolean(run)),
          savedSearch: mapAlertSavedSearch(
            row.savedSearch!.id,
            row.savedSearch!.name,
            row.savedSearch!.queryParams,
            mapSavedSearchCheckDraft(checkDrafts[index] ?? null, previewJobMap),
          ),
        })),
      usingFallbackData: false,
    };
  } catch {
    return {
      viewer,
      alerts: [],
      usingFallbackData: true,
    };
  }
}

export function mapAlertSummary(
  id: string,
  name: string | null,
  status: AlertStatus,
  scheduleCron: string | null,
  lastSentAt: Date | null,
  createdAt: Date,
  runs: Array<{
    id: string;
    trigger: "MANUAL" | "DUE_BATCH";
    status: "SUCCESS" | "ERROR";
    startedAt: Date;
    completedAt: Date | null;
    matchedJobCount: number;
    newMatchesCount: number;
    droppedMatchesCount: number;
    applyNowCount: number;
    applySoonCount: number;
    officialSourceCount: number;
    errorMessage: string | null;
  }>,
): AlertSummary {
  const cadence = cadenceFromSchedule(scheduleCron);
  const cadenceLabel = alertCadenceOptions.find((option) => option.value === cadence)?.label ?? "Custom";
  const latestRun = runs[0] ?? null;
  const latestDueRun = runs.find((run) => run.trigger === "DUE_BATCH") ?? null;

  return {
    id,
    name: name?.trim() || "Search alert",
    status,
    cadence,
    cadenceLabel,
    lastSentAt: lastSentAt?.toISOString() ?? null,
    dueNow: status === "ACTIVE" && isAlertDue({ scheduleCron, createdAt, lastSentAt }),
    latestRun: mapAlertRunSummary(latestRun),
    latestDueRun: mapAlertRunSummary(latestDueRun),
    autoRefreshStatus: mapAutoRefreshStatus({
      status,
      scheduleCron,
      createdAt,
      latestDueRun,
    }),
  };
}

function mapAlertSavedSearch(
  id: string,
  name: string | null,
  queryParams: unknown,
  latestCheck: SavedSearchCheckSummary | null,
) {
  const filters = parseStoredSearchFilters(queryParams);

  return {
    id,
    name: name?.trim() || buildSavedSearchName(filters),
    href: buildSearchHrefFromFilters(filters),
    summary: summarizeSearchFilters(filters),
    latestCheck,
  };
}

function mapAutoRefreshStatus({
  status,
  scheduleCron,
  createdAt,
  latestDueRun,
}: {
  status: AlertStatus;
  scheduleCron: string | null;
  createdAt: Date;
  latestDueRun: {
    status: "SUCCESS" | "ERROR";
    startedAt: Date;
  } | null;
}): AlertSummary["autoRefreshStatus"] {
  if (status !== "ACTIVE") {
    return "PAUSED";
  }

  if (!latestDueRun) {
    return isAlertDueSinceReference({
      scheduleCron,
      referenceAt: createdAt,
    })
      ? "OVERDUE"
      : "WAITING";
  }

  if (latestDueRun.status === "ERROR") {
    return "FAILING";
  }

  return isAlertDueSinceReference({
    scheduleCron,
    referenceAt: latestDueRun.startedAt,
  })
    ? "OVERDUE"
    : "HEALTHY";
}
