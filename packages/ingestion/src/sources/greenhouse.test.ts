import test from "node:test";
import assert from "node:assert/strict";

import { RemoteType } from "@anti-ghost/database";

import {
  buildGreenhouseBoardUrl,
  buildGreenhouseJobsUrl,
  normalizeGreenhouseJob,
} from "./greenhouse";

test("buildGreenhouseJobsUrl uses the public board jobs endpoint with content=true", () => {
  assert.equal(
    buildGreenhouseJobsUrl("stripe"),
    "https://boards-api.greenhouse.io/v1/boards/stripe/jobs?content=true",
  );
  assert.equal(buildGreenhouseBoardUrl("stripe"), "https://boards-api.greenhouse.io/v1/boards/stripe");
});

test("normalizeGreenhouseJob preserves identifiers and compensation hints", () => {
  const observedAt = new Date("2026-03-12T00:00:00.000Z");
  const normalized = normalizeGreenhouseJob(
    {
      id: 12345,
      internal_job_id: 987,
      requisition_id: "REQ-12",
      title: "Senior Data Engineer",
      updated_at: "2026-03-11T18:15:00Z",
      location: {
        name: "Remote, United States",
      },
      absolute_url: "https://boards.greenhouse.io/acme/jobs/12345",
      content: "<p>Build the platform.</p>",
      departments: [{ name: "Data" }],
      offices: [{ name: "Remote" }],
      metadata: [{ name: "Employment Type", value: "Full-time" }],
      pay_input_ranges: [
        {
          title: "Annual salary",
          min_cents: 18000000,
          max_cents: 22000000,
          currency_type: "USD",
        },
      ],
    },
    "Acme",
    observedAt,
  );

  assert.equal(normalized.externalJobId, "12345");
  assert.equal(normalized.companyName, "Acme");
  assert.equal(normalized.remoteType, RemoteType.REMOTE);
  assert.equal(normalized.salary?.min, 180000);
  assert.equal(normalized.salary?.max, 220000);
  assert.equal(normalized.canonicalHints.requisitionId, "REQ-12");
  assert.equal(normalized.canonicalHints.internalJobId, 987);
  assert.equal(normalized.firstSeenAt.toISOString(), observedAt.toISOString());
  assert.match(normalized.contentHash, /^[a-f0-9]{64}$/);
});
