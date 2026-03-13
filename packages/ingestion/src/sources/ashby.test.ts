import test from "node:test";
import assert from "node:assert/strict";

import { EmploymentType, RemoteType } from "@anti-ghost/database";

import { buildAshbyBoardUrl, normalizeAshbyJob } from "./ashby";

test("buildAshbyBoardUrl targets the public Ashby job postings API", () => {
  assert.equal(
    buildAshbyBoardUrl("Acme"),
    "https://api.ashbyhq.com/posting-api/job-board/Acme?includeCompensation=true",
  );
});

test("normalizeAshbyJob maps listed fields, remote type, and salary", () => {
  const observedAt = new Date("2026-03-12T00:00:00.000Z");
  const normalized = normalizeAshbyJob(
    {
      id: "job-123",
      title: "Analytics Engineer",
      location: "New York, NY",
      secondaryLocations: [
        {
          location: "Remote, United States",
        },
      ],
      department: "Data",
      team: "Analytics",
      isListed: true,
      isRemote: false,
      workplaceType: "Hybrid",
      descriptionHtml: "<p>Build quality analytics systems.</p>",
      descriptionPlain: "Build quality analytics systems.",
      publishedAt: "2026-03-11T18:15:00.000+00:00",
      employmentType: "FullTime",
      address: {
        postalAddress: {
          addressLocality: "New York",
          addressRegion: "New York",
          addressCountry: "USA",
        },
      },
      jobUrl: "https://jobs.ashbyhq.com/Acme/123",
      applyUrl: "https://jobs.ashbyhq.com/Acme/123/apply",
      compensation: {
        compensationTierSummary: "$140K - $180K plus bonus",
        scrapeableCompensationSalarySummary: "$140K - $180K",
        summaryComponents: [
          {
            compensationType: "Salary",
            interval: "1 YEAR",
            currencyCode: "USD",
            minValue: 140000,
            maxValue: 180000,
          },
        ],
      },
    },
    "Acme",
    observedAt,
  );

  assert.equal(normalized.externalJobId, "job-123");
  assert.equal(normalized.remoteType, RemoteType.HYBRID);
  assert.equal(normalized.employmentType, EmploymentType.FULL_TIME);
  assert.equal(normalized.salary?.min, 140000);
  assert.equal(normalized.salary?.max, 180000);
  assert.equal(normalized.companyName, "Acme");
  assert.equal(normalized.canonicalHints.requisitionId, null);
  assert.match(normalized.contentHash, /^[a-f0-9]{64}$/);
  assert.equal(normalized.payload.ashby && typeof normalized.payload.ashby === "object", true);
  assert.equal(
    "descriptionHtml" in (normalized.payload.ashby as Record<string, unknown>),
    false,
  );
  assert.equal(
    "descriptionPlain" in (normalized.payload.ashby as Record<string, unknown>),
    false,
  );
  const descriptionStorage = (
    normalized.payload.ashby as {
      descriptionStorage?: {
        rawField: string | null;
        storedSeparatelyInDescriptionRaw: boolean;
        html?: { length: number; hash: string } | null;
        plain?: { length: number; hash: string } | null;
      };
    }
  ).descriptionStorage;

  assert.deepEqual(
    {
      rawField: descriptionStorage?.rawField ?? null,
      storedSeparatelyInDescriptionRaw: descriptionStorage?.storedSeparatelyInDescriptionRaw ?? false,
      htmlLength: descriptionStorage?.html?.length ?? null,
      plainLength: descriptionStorage?.plain?.length ?? null,
    },
    {
      rawField: "descriptionHtml",
      storedSeparatelyInDescriptionRaw: true,
      htmlLength: "<p>Build quality analytics systems.</p>".length,
      plainLength: "Build quality analytics systems.".length,
    },
  );
  assert.match(descriptionStorage?.html?.hash ?? "", /^[a-f0-9]{64}$/);
  assert.match(descriptionStorage?.plain?.hash ?? "", /^[a-f0-9]{64}$/);
});
