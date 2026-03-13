import {
  EmploymentType,
  RemoteType,
  SourceTrustLevel,
  SourceType,
} from "@anti-ghost/database";

import type {
  EndpointCheckResult,
  NormalizedCompensation,
  NormalizedJobListing,
  SourceAdapter,
} from "../contracts";
import { collectUniqueText, fetchJsonWithRetry, hashText, inferRemoteTypeFromText } from "../helpers";

type AshbyBoardConfig = {
  boardName: string;
  companyDisplayName?: string;
};

type AshbyAddress = {
  addressLocality?: string | null;
  addressRegion?: string | null;
  addressCountry?: string | null;
};

type AshbySecondaryLocation = {
  location?: string | null;
  address?: AshbyAddress | null;
};

type AshbyCompensationComponent = {
  compensationType?: string | null;
  interval?: string | null;
  currencyCode?: string | null;
  minValue?: number | null;
  maxValue?: number | null;
  summary?: string | null;
};

type AshbyCompensation = {
  compensationTierSummary?: string | null;
  scrapeableCompensationSalarySummary?: string | null;
  summaryComponents?: AshbyCompensationComponent[] | null;
};

type AshbyJob = {
  id?: string | null;
  title: string;
  location?: string | null;
  secondaryLocations?: AshbySecondaryLocation[] | null;
  department?: string | null;
  team?: string | null;
  isListed?: boolean | null;
  isRemote?: boolean | null;
  workplaceType?: "OnSite" | "Remote" | "Hybrid" | null;
  descriptionHtml?: string | null;
  descriptionPlain?: string | null;
  publishedAt?: string | null;
  employmentType?: "FullTime" | "PartTime" | "Intern" | "Contract" | "Temporary" | null;
  address?: {
    postalAddress?: AshbyAddress | null;
  } | null;
  jobUrl: string;
  applyUrl?: string | null;
  compensation?: AshbyCompensation | null;
};

type AshbyBoardPayload = {
  apiVersion: string;
  jobs: AshbyJob[];
};

export function createAshbyAdapter(): SourceAdapter<AshbyBoardConfig, AshbyBoardPayload> {
  return {
    name: "ashby",
    surfaceKind: "API_FEED",
    async fetch(config) {
      const observedAt = new Date();
      const payload = await fetchJsonWithRetry<AshbyBoardPayload>(buildAshbyBoardUrl(config.boardName));

      return {
        observedAt,
        payload,
        retrievalState: "SUCCESS",
        sourceUrl: buildAshbyBoardUrl(config.boardName),
      };
    },
    async parse(result) {
      const boardName = extractAshbyBoardName(result.sourceUrl);
      const companyName = titleCaseSlug(boardName);

      return {
        source: {
          type: SourceType.ASHBY,
          name: `ashby:${boardName}`,
          baseUrl: buildAshbyJobBoardUrl(boardName),
          trustLevel: SourceTrustLevel.HIGH,
          metadata: {
            boardName,
            apiVersion: result.payload.apiVersion,
            companyDisplayName: companyName,
            sourceApiUrl: result.sourceUrl,
          },
        },
        surfaceKind: "API_FEED",
        observedAt: result.observedAt,
        listings: result.payload.jobs.map((job) => normalizeAshbyJob(job, companyName, result.observedAt)),
      };
    },
    validate(result) {
      return {
        ...result,
        listings: result.listings.filter((listing) => {
          const isListed = listing.payload.ashby && typeof listing.payload.ashby === "object"
            ? (listing.payload.ashby as { isListed?: boolean | null }).isListed !== false
            : true;

          return Boolean(listing.title && listing.url && listing.companyName) && isListed;
        }),
      };
    },
  };
}

export async function syncAshbyBoard(config: AshbyBoardConfig) {
  const adapter = createAshbyAdapter();
  const fetched = await adapter.fetch(config);
  const parsed = await adapter.parse(fetched);
  return adapter.validate(parsed);
}

export async function checkAshbyJobActivity(url: string): Promise<EndpointCheckResult> {
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      headers: {
        "User-Agent": "anti-ghost-job-search-engine/0.1",
      },
    });

    if (response.status === 404 || response.status === 410) {
      return {
        status: "INACTIVE",
        statusCode: response.status,
      };
    }

    if (response.ok || [301, 302, 307, 308].includes(response.status)) {
      return {
        status: "ACTIVE",
        statusCode: response.status,
      };
    }

    return {
      status: "UNKNOWN",
      statusCode: response.status,
    };
  } catch {
    return {
      status: "UNKNOWN",
      statusCode: null,
    };
  }
}

export function buildAshbyBoardUrl(boardName: string): string {
  return `https://api.ashbyhq.com/posting-api/job-board/${boardName}?includeCompensation=true`;
}

export function buildAshbyJobBoardUrl(boardName: string): string {
  return `https://jobs.ashbyhq.com/${boardName}`;
}

export function normalizeAshbyJob(
  job: AshbyJob,
  companyDisplayName: string,
  observedAt: Date,
): NormalizedJobListing {
  const secondaryLocations = collectUniqueText(
    job.secondaryLocations?.map((secondaryLocation) => secondaryLocation.location) ?? [],
  );

  const locationCandidates = collectUniqueText([
    job.location ?? null,
    job.address?.postalAddress?.addressLocality ?? null,
    ...secondaryLocations,
  ]);

  const compensation = normalizeAshbyCompensation(job.compensation ?? null);
  const salaryRaw =
    job.compensation?.scrapeableCompensationSalarySummary ??
    job.compensation?.compensationTierSummary ??
    null;

  return {
    externalJobId: job.id ?? job.jobUrl,
    url: job.jobUrl,
    title: job.title.trim(),
    companyName: companyDisplayName,
    location: locationCandidates[0] ?? null,
    remoteType: normalizeAshbyRemoteType(job),
    employmentType: normalizeAshbyEmploymentType(job.employmentType ?? null),
    salary: compensation,
    salaryRaw,
    descriptionRaw: (job.descriptionHtml ?? job.descriptionPlain ?? "").trim(),
    postedAtRaw: job.publishedAt ?? null,
    firstSeenAt: observedAt,
    lastSeenAt: observedAt,
    isActive: true,
    parseConfidence: calculateAshbyParseConfidence(job),
    contentHash: hashText((job.descriptionPlain ?? job.descriptionHtml ?? "").trim()),
    payload: {
      ashby: buildAshbyPayload(job),
    },
    canonicalHints: {
      officialSourceUrl: job.jobUrl,
      requisitionId: null,
      internalJobId: null,
      departmentNames: collectUniqueText([job.department ?? null, job.team ?? null]),
      officeNames: secondaryLocations,
    },
  };
}

function buildAshbyPayload(job: AshbyJob) {
  const { descriptionHtml, descriptionPlain, ...rest } = job;

  return {
    ...rest,
    descriptionStorage: {
      rawField: descriptionHtml ? "descriptionHtml" : descriptionPlain ? "descriptionPlain" : null,
      storedSeparatelyInDescriptionRaw: true,
      html: buildAshbyDescriptionMetadata(descriptionHtml),
      plain: buildAshbyDescriptionMetadata(descriptionPlain),
    },
  };
}

function buildAshbyDescriptionMetadata(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  return {
    length: trimmed.length,
    hash: hashText(trimmed),
  };
}

function normalizeAshbyCompensation(compensation: AshbyCompensation | null): NormalizedCompensation | null {
  const salaryComponent = compensation?.summaryComponents?.find((component) => component.compensationType === "Salary");

  if (!salaryComponent || (!salaryComponent.minValue && !salaryComponent.maxValue)) {
    return null;
  }

  return {
    currency: salaryComponent.currencyCode?.toUpperCase() ?? null,
    min: salaryComponent.minValue ?? null,
    max: salaryComponent.maxValue ?? null,
    interval: normalizeAshbyInterval(salaryComponent.interval ?? null),
  };
}

function normalizeAshbyInterval(interval: string | null): "YEAR" | "HOUR" | "UNKNOWN" {
  const normalized = interval?.toLowerCase() ?? "";

  if (normalized.includes("hour")) {
    return "HOUR";
  }

  if (normalized.includes("year")) {
    return "YEAR";
  }

  return "UNKNOWN";
}

function normalizeAshbyRemoteType(job: AshbyJob): RemoteType {
  switch (job.workplaceType) {
    case "Remote":
      return RemoteType.REMOTE;
    case "Hybrid":
      return RemoteType.HYBRID;
    case "OnSite":
      return RemoteType.ONSITE;
    default:
      if (job.isRemote) {
        return RemoteType.REMOTE;
      }

      return inferRemoteTypeFromText([job.location ?? null]);
  }
}

function normalizeAshbyEmploymentType(employmentType: AshbyJob["employmentType"]): EmploymentType {
  switch (employmentType) {
    case "FullTime":
      return EmploymentType.FULL_TIME;
    case "PartTime":
      return EmploymentType.PART_TIME;
    case "Intern":
      return EmploymentType.INTERN;
    case "Contract":
      return EmploymentType.CONTRACT;
    case "Temporary":
      return EmploymentType.TEMPORARY;
    default:
      return EmploymentType.UNKNOWN;
  }
}

function calculateAshbyParseConfidence(job: AshbyJob): number {
  let score = 0.66;

  if (job.title?.trim()) {
    score += 0.1;
  }

  if (job.jobUrl?.trim()) {
    score += 0.1;
  }

  if (job.descriptionHtml || job.descriptionPlain) {
    score += 0.1;
  }

  if (job.compensation?.summaryComponents?.length) {
    score += 0.02;
  }

  return Math.min(score, 0.98);
}

function extractAshbyBoardName(url: string): string {
  const match = url.match(/job-board\/([^?]+)/);
  return match?.[1] ?? "unknown";
}

function titleCaseSlug(value: string): string {
  return value
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
