import { readFile } from "node:fs/promises";

import type { AdapterParseResult, AdapterPersistResult } from "./contracts";
import { persistAdapterResult } from "./persistence";
import { syncAshbyBoard } from "./sources/ashby";
import { syncGreenhouseBoard } from "./sources/greenhouse";
import { syncLeverSite } from "./sources/lever";

export type SourceSyncSpec =
  | {
      kind: "greenhouse";
      boardToken: string;
    }
  | {
      kind: "lever";
      site: string;
    }
  | {
      kind: "ashby";
      boardName: string;
    };

export type SourceSyncPlan = {
  sources: SourceSyncSpec[];
};

export type SourceSyncRunResult =
  | {
      spec: SourceSyncSpec;
      status: "success";
      persistence: AdapterPersistResult;
      observedAt: string;
      listingCount: number;
    }
  | {
      spec: SourceSyncSpec;
      status: "error";
      error: string;
    };

export type SourceSyncSummary = {
  startedAt: string;
  finishedAt: string;
  totalSources: number;
  successCount: number;
  errorCount: number;
  totalListingsObserved: number;
  totalCreatedCount: number;
  totalUpdatedCount: number;
  totalDeactivatedCount: number;
  results: SourceSyncRunResult[];
};

type RunOptions = {
  syncResultProvider?: (spec: SourceSyncSpec) => Promise<AdapterParseResult>;
  persistResult?: (result: AdapterParseResult) => Promise<AdapterPersistResult>;
};

export async function loadSourceSyncPlan(configPath: string): Promise<SourceSyncPlan> {
  const raw = await readFile(configPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;

  return parseSourceSyncPlan(parsed);
}

export function parseSourceSyncPlan(value: unknown): SourceSyncPlan {
  if (!value || typeof value !== "object" || !("sources" in value)) {
    throw new Error("Sync config must be an object with a sources array.");
  }

  const { sources } = value as { sources?: unknown };

  if (!Array.isArray(sources) || sources.length === 0) {
    throw new Error("Sync config must include at least one source.");
  }

  return {
    sources: sources.map(parseSourceSyncSpec),
  };
}

export async function runSourceSyncPlan(
  plan: SourceSyncPlan,
  options: RunOptions = {},
): Promise<SourceSyncSummary> {
  const startedAt = new Date();
  const results: SourceSyncRunResult[] = [];

  for (const spec of plan.sources) {
    try {
      const parsed = await (options.syncResultProvider ?? syncSourceSpec)(spec);
      const persistence = await (options.persistResult ?? persistAdapterResult)(parsed);

      results.push({
        spec,
        status: "success",
        persistence,
        observedAt: parsed.observedAt.toISOString(),
        listingCount: parsed.listings.length,
      });
    } catch (error) {
      results.push({
        spec,
        status: "error",
        error: error instanceof Error ? error.message : "Unknown sync failure",
      });
    }
  }

  const finishedAt = new Date();
  const successfulRuns = results.filter((result): result is Extract<SourceSyncRunResult, { status: "success" }> => {
    return result.status === "success";
  });

  return {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    totalSources: plan.sources.length,
    successCount: successfulRuns.length,
    errorCount: results.length - successfulRuns.length,
    totalListingsObserved: successfulRuns.reduce((sum, result) => sum + result.listingCount, 0),
    totalCreatedCount: successfulRuns.reduce((sum, result) => sum + result.persistence.createdCount, 0),
    totalUpdatedCount: successfulRuns.reduce((sum, result) => sum + result.persistence.updatedCount, 0),
    totalDeactivatedCount: successfulRuns.reduce((sum, result) => sum + result.persistence.deactivatedCount, 0),
    results,
  };
}

async function syncSourceSpec(spec: SourceSyncSpec): Promise<AdapterParseResult> {
  switch (spec.kind) {
    case "greenhouse":
      return syncGreenhouseBoard({
        boardToken: spec.boardToken,
      });
    case "lever":
      return syncLeverSite({
        site: spec.site,
      });
    case "ashby":
      return syncAshbyBoard({
        boardName: spec.boardName,
      });
  }
}

function parseSourceSyncSpec(value: unknown): SourceSyncSpec {
  if (!value || typeof value !== "object" || !("kind" in value)) {
    throw new Error("Each source entry must be an object with a kind.");
  }

  const candidate = value as Record<string, unknown>;

  switch (candidate.kind) {
    case "greenhouse": {
      const boardToken = readRequiredString(candidate.boardToken, "greenhouse.boardToken");
      return {
        kind: "greenhouse",
        boardToken,
      };
    }
    case "lever": {
      const site = readRequiredString(candidate.site, "lever.site");
      return {
        kind: "lever",
        site,
      };
    }
    case "ashby": {
      const boardName = readRequiredString(candidate.boardName, "ashby.boardName");
      return {
        kind: "ashby",
        boardName,
      };
    }
    default:
      throw new Error(`Unsupported source kind: ${String(candidate.kind)}`);
  }
}

function readRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }

  return value.trim();
}
