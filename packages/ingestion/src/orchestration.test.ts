import assert from "node:assert/strict";
import test from "node:test";

import type { AdapterParseResult } from "./contracts";
import { parseSourceSyncPlan, runSourceSyncPlan } from "./orchestration";

test("parseSourceSyncPlan validates the supported source kinds", () => {
  const plan = parseSourceSyncPlan({
    sources: [
      {
        kind: "greenhouse",
        boardToken: "acme",
      },
      {
        kind: "lever",
        site: "acme",
      },
      {
        kind: "ashby",
        boardName: "Acme",
      },
    ],
  });

  assert.equal(plan.sources.length, 3);
  assert.deepEqual(plan.sources[0], {
    kind: "greenhouse",
    boardToken: "acme",
  });
});

test("runSourceSyncPlan continues after a source failure and aggregates results", async () => {
  const plan = parseSourceSyncPlan({
    sources: [
      {
        kind: "greenhouse",
        boardToken: "good-board",
      },
      {
        kind: "lever",
        site: "broken-site",
      },
    ],
  });

  const summary = await runSourceSyncPlan(plan, {
    syncResultProvider: async (spec) => {
      if (spec.kind === "lever") {
        throw new Error("Lever sync failed");
      }

      return createStubParseResult();
    },
    persistResult: async () => {
      return {
        sourceId: "src_123",
        createdCount: 1,
        updatedCount: 2,
        deactivatedCount: 0,
      };
    },
  });

  assert.equal(summary.totalSources, 2);
  assert.equal(summary.successCount, 1);
  assert.equal(summary.errorCount, 1);
  assert.equal(summary.totalListingsObserved, 1);
  assert.equal(summary.totalCreatedCount, 1);
  assert.equal(summary.totalUpdatedCount, 2);
  assert.equal(summary.results[1]?.status, "error");
});

function createStubParseResult(): AdapterParseResult {
  return {
    source: {
      type: "GREENHOUSE",
      name: "greenhouse:stub",
      baseUrl: "https://boards.greenhouse.io/stub",
      trustLevel: "HIGH",
      metadata: {},
    },
    surfaceKind: "API_FEED",
    observedAt: new Date("2026-03-12T00:00:00.000Z"),
    listings: [
      {
        externalJobId: "job_1",
        url: "https://boards.greenhouse.io/stub/jobs/1",
        title: "Platform Engineer",
        companyName: "Stub Corp",
        location: "Remote",
        remoteType: "REMOTE",
        employmentType: "FULL_TIME",
        salary: null,
        salaryRaw: null,
        descriptionRaw: "Build systems.",
        postedAtRaw: "2026-03-12T00:00:00.000Z",
        firstSeenAt: new Date("2026-03-12T00:00:00.000Z"),
        lastSeenAt: new Date("2026-03-12T00:00:00.000Z"),
        isActive: true,
        parseConfidence: 0.9,
        contentHash: "abc",
        payload: {},
        canonicalHints: {
          officialSourceUrl: "https://boards.greenhouse.io/stub/jobs/1",
          requisitionId: null,
          internalJobId: null,
          departmentNames: [],
          officeNames: [],
        },
      },
    ],
  };
}
