import test from "node:test";
import assert from "node:assert/strict";

import { EmploymentType, RemoteType } from "@anti-ghost/database";

import { buildLeverPostingsUrl, normalizeLeverPosting } from "./lever";

test("buildLeverPostingsUrl targets the public Lever postings feed", () => {
  assert.equal(buildLeverPostingsUrl("acme"), "https://api.lever.co/v0/postings/acme?mode=json");
});

test("normalizeLeverPosting maps workplace, salary, and requisition fields", () => {
  const observedAt = new Date("2026-03-12T00:00:00.000Z");
  const normalized = normalizeLeverPosting(
    {
      id: "730e37db-93d3-4acf-b9de-7cfc397cef1d",
      text: "Infrastructure Engineer",
      createdAt: 1700000000000,
      updatedAt: 1700001000000,
      categories: {
        team: "Platform",
        department: "Engineering",
        location: "San Francisco",
        allLocations: ["San Francisco", "Remote, United States"],
        commitment: "Full-time",
      },
      content: {
        description: "<div>Build the platform.</div>",
        descriptionPlain: "Build the platform.",
        lists: [
          {
            text: "Requirements",
            content: "<li>TypeScript</li>",
          },
        ],
        closingHtml: "<div>EOE</div>",
      },
      hostedUrl: "https://jobs.lever.co/acme/730e37db-93d3-4acf-b9de-7cfc397cef1d",
      applyUrl: "https://jobs.lever.co/acme/730e37db-93d3-4acf-b9de-7cfc397cef1d/apply",
      workplaceType: "hybrid",
      requisitionCodes: ["REQ-99"],
      salaryRange: {
        min: 170000,
        max: 210000,
        currency: "USD",
        interval: "per-year-salary",
      },
      distributionChannels: ["public"],
    },
    "Acme",
    observedAt,
  );

  assert.equal(normalized.externalJobId, "730e37db-93d3-4acf-b9de-7cfc397cef1d");
  assert.equal(normalized.remoteType, RemoteType.HYBRID);
  assert.equal(normalized.employmentType, EmploymentType.FULL_TIME);
  assert.equal(normalized.salary?.min, 170000);
  assert.equal(normalized.salary?.max, 210000);
  assert.equal(normalized.canonicalHints.requisitionId, "REQ-99");
  assert.equal(normalized.companyName, "Acme");
  assert.match(normalized.contentHash, /^[a-f0-9]{64}$/);
  assert.equal(normalized.firstSeenAt.toISOString(), observedAt.toISOString());
});

test("normalizeLeverPosting falls back to a trailing title requisition code when the feed omits it", () => {
  const observedAt = new Date("2026-03-12T00:00:00.000Z");
  const normalized = normalizeLeverPosting(
    {
      id: "420d8697-74f1-4157-9b3a-a9362e6baf4c",
      text: "Agent Management Analyst (R-18876)",
      categories: {
        location: "Center Valley - Pennsylvania - United States",
      },
      hostedUrl: "https://jobs.lever.co/dnb/420d8697-74f1-4157-9b3a-a9362e6baf4c",
      workplaceType: "hybrid",
      content: {
        descriptionPlain: "Build trusted operations workflows.",
      },
    },
    "Dnb",
    observedAt,
  );

  assert.equal(normalized.canonicalHints.requisitionId, "R-18876");
  assert.equal(normalized.title, "Agent Management Analyst (R-18876)");
});
