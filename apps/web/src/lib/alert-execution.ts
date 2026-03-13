import type { AlertRunTrigger, Prisma } from "@anti-ghost/database";
import { prisma } from "@anti-ghost/database";

import { getAlertSearchResultsForFilters } from "./alert-search-query";
import { isAlertDue } from "./alert-schedule";
import { parseStoredSearchFilters } from "./search-filters";

type AlertExecutionRow = Prisma.AlertGetPayload<{
  include: {
    savedSearch: {
      include: {
        snapshots: {
          orderBy: [
            {
              checkedAt: "desc";
            },
            {
              createdAt: "desc";
            },
          ];
          take: 1;
        };
      };
    };
  };
}>;

export type AlertRunSummary = {
  id: string;
  trigger: AlertRunTrigger;
  status: "SUCCESS" | "ERROR";
  startedAt: string;
  completedAt: string | null;
  matchedJobCount: number;
  newMatchesCount: number;
  droppedMatchesCount: number;
  applyNowCount: number;
  applySoonCount: number;
  officialSourceCount: number;
  errorMessage: string | null;
};

export type ExecutedAlertResult = {
  alertId: string;
  alertName: string;
  trigger: AlertRunTrigger;
  status: "SUCCESS" | "ERROR";
  dueAtExecution: boolean;
  matchedJobCount: number;
  newMatchesCount: number;
  droppedMatchesCount: number;
  applyNowCount: number;
  applySoonCount: number;
  officialSourceCount: number;
  errorMessage: string | null;
};

export type DueAlertBatchSummary = {
  checkedAt: string;
  scannedAlerts: number;
  dueAlerts: number;
  succeeded: number;
  failed: number;
  results: ExecutedAlertResult[];
};

export async function executeAlertRunById(
  alertId: string,
  options: {
    trigger: AlertRunTrigger;
    force?: boolean;
    now?: Date;
  },
): Promise<ExecutedAlertResult | null> {
  const now = options.now ?? new Date();
  const row = await prisma.alert.findUnique({
    where: {
      id: alertId,
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
            take: 1,
          },
        },
      },
    },
  });

  if (!row || !row.savedSearch) {
    return null;
  }
  const savedSearch = row.savedSearch;

  const dueAtExecution = isAlertDue({
    scheduleCron: row.scheduleCron,
    createdAt: row.createdAt,
    lastSentAt: row.lastSentAt,
    now,
  });

  if (!options.force && !dueAtExecution) {
    return null;
  }

  return executeAlertRow(
    {
      ...row,
      savedSearch,
    },
    {
      trigger: options.trigger,
      dueAtExecution,
      now,
    },
  );
}

export async function executeDueAlerts(options: {
  now?: Date;
  userId?: string;
} = {}): Promise<DueAlertBatchSummary> {
  const now = options.now ?? new Date();
  const rows = await prisma.alert.findMany({
    where: {
      status: "ACTIVE",
      savedSearchId: {
        not: null,
      },
      ...(options.userId
        ? {
            userId: options.userId,
          }
        : {}),
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
            take: 1,
          },
        },
      },
    },
    orderBy: [
      {
        updatedAt: "desc",
      },
      {
        createdAt: "desc",
      },
    ],
  });

  const dueRows = rows.filter(
    (row): row is AlertExecutionRow & { savedSearch: NonNullable<AlertExecutionRow["savedSearch"]> } =>
      Boolean(row.savedSearch) &&
      isAlertDue({
        scheduleCron: row.scheduleCron,
        createdAt: row.createdAt,
        lastSentAt: row.lastSentAt,
        now,
      }),
  );

  const results: ExecutedAlertResult[] = [];

  for (const row of dueRows) {
    results.push(
      await executeAlertRow(row, {
        trigger: "DUE_BATCH",
        dueAtExecution: true,
        now,
      }),
    );
  }

  return {
    checkedAt: now.toISOString(),
    scannedAlerts: rows.length,
    dueAlerts: dueRows.length,
    succeeded: results.filter((result) => result.status === "SUCCESS").length,
    failed: results.filter((result) => result.status === "ERROR").length,
    results,
  };
}

export function mapAlertRunSummary(
  run:
    | {
        id: string;
        trigger: AlertRunTrigger;
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
      }
    | null
    | undefined,
): AlertRunSummary | null {
  if (!run) {
    return null;
  }

  return {
    id: run.id,
    trigger: run.trigger,
    status: run.status,
    startedAt: run.startedAt.toISOString(),
    completedAt: run.completedAt?.toISOString() ?? null,
    matchedJobCount: run.matchedJobCount,
    newMatchesCount: run.newMatchesCount,
    droppedMatchesCount: run.droppedMatchesCount,
    applyNowCount: run.applyNowCount,
    applySoonCount: run.applySoonCount,
    officialSourceCount: run.officialSourceCount,
    errorMessage: run.errorMessage,
  };
}

async function executeAlertRow(
  row: AlertExecutionRow & { savedSearch: NonNullable<AlertExecutionRow["savedSearch"]> },
  options: {
    trigger: AlertRunTrigger;
    dueAtExecution: boolean;
    now: Date;
  },
): Promise<ExecutedAlertResult> {
  const latestSnapshot = row.savedSearch.snapshots[0] ?? null;

  try {
    const filters = parseStoredSearchFilters(row.savedSearch.queryParams);
    const jobs = await getAlertSearchResultsForFilters(filters);
    const matchedJobIds = jobs.map((job) => job.id);
    const previousMatchedJobIds = latestSnapshot ? readStringArray(latestSnapshot.matchedJobIdsJson) : [];
    const previousMatchedJobIdSet = new Set(previousMatchedJobIds);
    const currentMatchedJobIdSet = new Set(matchedJobIds);
    const newMatchesCount = latestSnapshot
      ? matchedJobIds.filter((jobId) => !previousMatchedJobIdSet.has(jobId)).length
      : 0;
    const droppedMatchesCount = latestSnapshot
      ? previousMatchedJobIds.filter((jobId) => !currentMatchedJobIdSet.has(jobId)).length
      : 0;
    const matchedJobCount = matchedJobIds.length;
    const applyNowCount = jobs.filter((job) => job.priorityLabel === "APPLY_NOW").length;
    const applySoonCount = jobs.filter((job) => job.priorityLabel === "APPLY_SOON").length;
    const officialSourceCount = jobs.filter((job) => job.officialSourceStatus !== "MISSING").length;

    await prisma.$transaction(async (transaction) => {
      const snapshot = await transaction.savedSearchSnapshot.create({
        data: {
          savedSearchId: row.savedSearch.id,
          checkedAt: options.now,
          matchedJobCount,
          applyNowCount,
          applySoonCount,
          officialSourceCount,
          matchedJobIdsJson: matchedJobIds,
        },
      });

      await transaction.alertRun.create({
        data: {
          alertId: row.id,
          savedSearchSnapshotId: snapshot.id,
          trigger: options.trigger,
          status: "SUCCESS",
          startedAt: options.now,
          completedAt: options.now,
          matchedJobCount,
          newMatchesCount,
          droppedMatchesCount,
          applyNowCount,
          applySoonCount,
          officialSourceCount,
        },
      });

      await transaction.alert.update({
        where: {
          id: row.id,
        },
        data: {
          lastSentAt: options.now,
        },
      });
    });

    return {
      alertId: row.id,
      alertName: row.name?.trim() || "Search alert",
      trigger: options.trigger,
      status: "SUCCESS",
      dueAtExecution: options.dueAtExecution,
      matchedJobCount,
      newMatchesCount,
      droppedMatchesCount,
      applyNowCount,
      applySoonCount,
      officialSourceCount,
      errorMessage: null,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown alert execution error.";

    await prisma.alertRun.create({
      data: {
        alertId: row.id,
        trigger: options.trigger,
        status: "ERROR",
        startedAt: options.now,
        completedAt: options.now,
        errorMessage,
      },
    });

    return {
      alertId: row.id,
      alertName: row.name?.trim() || "Search alert",
      trigger: options.trigger,
      status: "ERROR",
      dueAtExecution: options.dueAtExecution,
      matchedJobCount: 0,
      newMatchesCount: 0,
      droppedMatchesCount: 0,
      applyNowCount: 0,
      applySoonCount: 0,
      officialSourceCount: 0,
      errorMessage,
    };
  }
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
