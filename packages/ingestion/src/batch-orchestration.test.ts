import assert from "node:assert/strict";
import test from "node:test";

import { parseSourceSyncBatchPlan, runSourceSyncBatchPlan } from "./batch-orchestration";

test("parseSourceSyncBatchPlan trims config paths and requires at least one entry", () => {
  const plan = parseSourceSyncBatchPlan(["config/a.json", " config/b.json "]);

  assert.deepEqual(plan, {
    configs: ["config/a.json", "config/b.json"],
  });
});

test("runSourceSyncBatchPlan aggregates sequential config summaries", async () => {
  const loadCalls: string[] = [];
  const runCalls: string[] = [];

  const summary = await runSourceSyncBatchPlan(
    {
      configs: ["config/a.json", "config/b.json"],
    },
    {
      loadPlan: async (configPath) => {
        loadCalls.push(configPath);
        return {
          sources: [
            {
              kind: "greenhouse",
              boardToken: configPath,
            },
          ],
        };
      },
      runPlan: async (plan) => {
        runCalls.push((plan.sources[0] as { boardToken: string }).boardToken);
        return {
          startedAt: "2026-03-12T00:00:00.000Z",
          finishedAt: "2026-03-12T00:00:01.000Z",
          totalSources: 1,
          successCount: 1,
          errorCount: 0,
          totalListingsObserved: 5,
          totalCreatedCount: 5,
          totalUpdatedCount: 0,
          totalDeactivatedCount: 0,
          results: [],
        };
      },
    },
  );

  assert.deepEqual(loadCalls, ["config/a.json", "config/b.json"]);
  assert.deepEqual(runCalls, ["config/a.json", "config/b.json"]);
  assert.equal(summary.totalConfigs, 2);
  assert.equal(summary.totalSources, 2);
  assert.equal(summary.totalListingsObserved, 10);
  assert.equal(summary.totalCreatedCount, 10);
});
