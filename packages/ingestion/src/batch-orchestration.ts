import { loadSourceSyncPlan, runSourceSyncPlan, type SourceSyncSummary } from "./orchestration";

export type SourceSyncBatchPlan = {
  configs: string[];
};

export type SourceSyncBatchRunResult = {
  configPath: string;
  summary: SourceSyncSummary;
};

export type SourceSyncBatchSummary = {
  startedAt: string;
  finishedAt: string;
  totalConfigs: number;
  totalSources: number;
  successCount: number;
  errorCount: number;
  totalListingsObserved: number;
  totalCreatedCount: number;
  totalUpdatedCount: number;
  totalDeactivatedCount: number;
  results: SourceSyncBatchRunResult[];
};

type RunOptions = {
  loadPlan?: typeof loadSourceSyncPlan;
  runPlan?: typeof runSourceSyncPlan;
};

export function parseSourceSyncBatchPlan(value: string[]): SourceSyncBatchPlan {
  const configs = value.map((entry) => entry.trim()).filter(Boolean);

  if (configs.length === 0) {
    throw new Error("Pass at least one sync config path.");
  }

  return {
    configs,
  };
}

export async function runSourceSyncBatchPlan(
  plan: SourceSyncBatchPlan,
  options: RunOptions = {},
): Promise<SourceSyncBatchSummary> {
  const startedAt = new Date();
  const results: SourceSyncBatchRunResult[] = [];
  const loadPlan = options.loadPlan ?? loadSourceSyncPlan;
  const runPlan = options.runPlan ?? runSourceSyncPlan;

  for (const configPath of plan.configs) {
    const sourcePlan = await loadPlan(configPath);
    const summary = await runPlan(sourcePlan);
    results.push({
      configPath,
      summary,
    });
  }

  const finishedAt = new Date();

  return {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    totalConfigs: results.length,
    totalSources: results.reduce((sum, result) => sum + result.summary.totalSources, 0),
    successCount: results.reduce((sum, result) => sum + result.summary.successCount, 0),
    errorCount: results.reduce((sum, result) => sum + result.summary.errorCount, 0),
    totalListingsObserved: results.reduce((sum, result) => sum + result.summary.totalListingsObserved, 0),
    totalCreatedCount: results.reduce((sum, result) => sum + result.summary.totalCreatedCount, 0),
    totalUpdatedCount: results.reduce((sum, result) => sum + result.summary.totalUpdatedCount, 0),
    totalDeactivatedCount: results.reduce((sum, result) => sum + result.summary.totalDeactivatedCount, 0),
    results,
  };
}
