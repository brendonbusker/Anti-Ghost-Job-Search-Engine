import type { JobSearchFilters } from "@anti-ghost/domain";
import { prisma } from "@anti-ghost/database";

import { mapAlertSummary, type AlertSummary } from "@/lib/alerts";
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

export type SavedSearchView = {
  id: string;
  name: string;
  filters: JobSearchFilters;
  href: string;
  summary: string[];
  createdAt: string;
  alert: AlertSummary | null;
  latestCheck: SavedSearchCheckSummary | null;
};

export async function getSavedSearchesPageData(): Promise<{
  viewer: AuthViewer | null;
  searches: SavedSearchView[];
  usingFallbackData: boolean;
}> {
  const viewer = await getCurrentUser();

  if (!viewer) {
    return {
      viewer: null,
      searches: [],
      usingFallbackData: false,
    };
  }

  try {
    const rows = await prisma.savedSearch.findMany({
      where: {
        userId: viewer.id,
      },
      include: {
        alerts: {
          orderBy: [
            {
              status: "asc",
            },
            {
              updatedAt: "desc",
            },
          ],
          take: 1,
        },
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
      orderBy: {
        updatedAt: "desc",
      },
    });
    const checkDrafts = rows.map((row) => buildSavedSearchCheckDraft(row.snapshots));
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
      searches: rows.map((row, index) =>
        mapSavedSearchRow(
          row.id,
          row.name,
          row.queryParams,
          row.createdAt,
          row.alerts[0] ?? null,
          mapSavedSearchCheckDraft(checkDrafts[index] ?? null, previewJobMap),
        ),
      ),
      usingFallbackData: false,
    };
  } catch {
    return {
      viewer,
      searches: [],
      usingFallbackData: true,
    };
  }
}

export function mapSavedSearchRow(
  id: string,
  name: string | null,
  queryParams: unknown,
  createdAt: Date,
  alert:
    | {
        id: string;
        name: string | null;
        status: "ACTIVE" | "PAUSED" | "DISABLED";
        scheduleCron: string | null;
        lastSentAt: Date | null;
        createdAt: Date;
      }
    | null = null,
  latestCheck: SavedSearchCheckSummary | null = null,
): SavedSearchView {
  const filters = parseStoredSearchFilters(queryParams);
  const resolvedName = name?.trim() || buildSavedSearchName(filters);

  return {
    id,
    name: resolvedName,
    filters,
    href: buildSearchHrefFromFilters(filters),
    summary: summarizeSearchFilters(filters),
    createdAt: createdAt.toISOString(),
    alert: alert
      ? mapAlertSummary(alert.id, alert.name, alert.status, alert.scheduleCron, alert.lastSentAt, alert.createdAt, [])
      : null,
    latestCheck,
  };
}
