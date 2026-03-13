import {
  EmploymentType,
  RemoteType,
  SourceTrustLevel,
  SourceType,
} from "@anti-ghost/database";

import type {
  AdapterFetchResult,
  AdapterParseResult,
  EndpointCheckResult,
  NormalizedCompensation,
  NormalizedJobListing,
  SourceAdapter,
} from "../contracts";
import {
  collectUniqueText,
  fetchJsonWithRetry,
  hashText,
  inferEmploymentTypeFromText,
  inferRemoteTypeFromText,
} from "../helpers";

type GreenhouseBoardConfig = {
  boardToken: string;
  companyDisplayName?: string;
};

type GreenhouseDepartment = {
  id?: number;
  name?: string;
};

type GreenhouseOffice = {
  id?: number;
  name?: string;
  location?: {
    name?: string;
  };
};

type GreenhouseMetadataField = {
  id?: number;
  name?: string;
  value?: string | null;
  value_type?: string;
};

type GreenhousePayInputRange = {
  title?: string | null;
  min_cents?: number | null;
  max_cents?: number | null;
  currency_type?: string | null;
};

type GreenhouseJob = {
  id: number;
  internal_job_id?: number | null;
  requisition_id?: string | null;
  title: string;
  updated_at?: string | null;
  location?: {
    name?: string | null;
  } | null;
  absolute_url: string;
  content?: string | null;
  departments?: GreenhouseDepartment[];
  offices?: GreenhouseOffice[];
  metadata?: GreenhouseMetadataField[];
  pay_input_ranges?: GreenhousePayInputRange[];
};

type GreenhouseJobsPayload = {
  jobs: GreenhouseJob[];
};

type GreenhouseBoardPayload = {
  id?: number;
  name?: string;
  content?: string | null;
  job_board_url?: string | null;
};

type GreenhouseFetchPayload = {
  board: GreenhouseBoardPayload;
  jobs: GreenhouseJobsPayload;
  boardToken: string;
};

export function createGreenhouseAdapter(): SourceAdapter<GreenhouseBoardConfig, GreenhouseFetchPayload> {
  return {
    name: "greenhouse",
    surfaceKind: "API_FEED",
    async fetch(config) {
      const observedAt = new Date();
      const board = await fetchJsonWithRetry<GreenhouseBoardPayload>(buildGreenhouseBoardUrl(config.boardToken));
      const jobs = await fetchJsonWithRetry<GreenhouseJobsPayload>(buildGreenhouseJobsUrl(config.boardToken));

      return {
        observedAt,
        payload: {
          board,
          jobs,
          boardToken: config.boardToken,
        },
        retrievalState: "SUCCESS",
        sourceUrl: buildGreenhouseJobsUrl(config.boardToken),
      };
    },
    async parse(result) {
      const companyName = result.payload.board.name?.trim() || "Unknown company";

      return {
        source: {
          type: SourceType.GREENHOUSE,
          name: `greenhouse:${result.payload.boardToken}`,
          baseUrl: result.payload.board.job_board_url?.trim() || buildGreenhouseBoardPageUrl(result.payload.boardToken),
          trustLevel: SourceTrustLevel.HIGH,
          metadata: {
            boardToken: result.payload.boardToken,
            companyDisplayName: companyName,
            boardId: result.payload.board.id ?? null,
            sourceApiUrl: result.sourceUrl,
          },
        },
        surfaceKind: "API_FEED",
        observedAt: result.observedAt,
        listings: result.payload.jobs.jobs.map((job) => normalizeGreenhouseJob(job, companyName, result.observedAt)),
      };
    },
    validate(result) {
      return {
        ...result,
        listings: result.listings.filter((listing) => {
          return Boolean(listing.title.trim() && listing.companyName.trim() && listing.url.trim());
        }),
      };
    },
  };
}

export async function syncGreenhouseBoard(config: GreenhouseBoardConfig) {
  const adapter = createGreenhouseAdapter();
  const fetched = await adapter.fetch(config);
  const parsed = await adapter.parse(fetched);
  return adapter.validate(parsed);
}

export async function checkGreenhouseJobActivity(url: string): Promise<EndpointCheckResult> {
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

export function buildGreenhouseBoardUrl(boardToken: string): string {
  return `https://boards-api.greenhouse.io/v1/boards/${boardToken}`;
}

export function buildGreenhouseJobsUrl(boardToken: string): string {
  return `https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs?content=true`;
}

export function buildGreenhouseBoardPageUrl(boardToken: string): string {
  return `https://boards.greenhouse.io/${boardToken}`;
}

export function normalizeGreenhouseJob(
  job: GreenhouseJob,
  companyDisplayName: string,
  observedAt: Date,
): NormalizedJobListing {
  const metadataValues = job.metadata?.map((field) => `${field.name ?? ""} ${field.value ?? ""}`) ?? [];
  const officeNames = collectUniqueText(job.offices?.map((office) => office.name) ?? []);
  const departmentNames = collectUniqueText(job.departments?.map((department) => department.name) ?? []);
  const locationCandidates = collectUniqueText([
    job.location?.name ?? null,
    ...officeNames,
    ...job.offices?.map((office) => office.location?.name ?? null).filter(Boolean).map(String) ?? [],
  ]);

  const compensation = normalizeGreenhouseCompensation(job.pay_input_ranges ?? []);
  const salaryRaw = compensation ? formatSalaryRaw(compensation) : null;

  return {
    externalJobId: String(job.id),
    url: job.absolute_url,
    title: job.title.trim(),
    companyName: companyDisplayName,
    location: locationCandidates[0] ?? null,
    remoteType: inferRemoteTypeFromText([
      job.location?.name ?? null,
      ...officeNames,
      ...metadataValues,
      job.title,
    ]),
    employmentType: inferEmploymentTypeFromText(metadataValues) ?? EmploymentType.UNKNOWN,
    salary: compensation,
    salaryRaw,
    descriptionRaw: job.content?.trim() || "",
    postedAtRaw: job.updated_at ?? null,
    firstSeenAt: observedAt,
    lastSeenAt: observedAt,
    isActive: true,
    parseConfidence: calculateParseConfidence(job),
    contentHash: hashText(job.content?.trim() || ""),
    payload: {
      greenhouse: job,
    },
    canonicalHints: {
      officialSourceUrl: job.absolute_url,
      requisitionId: job.requisition_id ?? null,
      internalJobId: job.internal_job_id ?? null,
      departmentNames,
      officeNames,
    },
  };
}

function normalizeGreenhouseCompensation(
  ranges: GreenhousePayInputRange[],
): NormalizedCompensation | null {
  const validRanges = ranges.filter((range) => range.min_cents || range.max_cents);

  if (!validRanges.length) {
    return null;
  }

  const first = validRanges[0];

  if (!first) {
    return null;
  }

  const min = first.min_cents ? Math.round(first.min_cents / 100) : null;
  const max = first.max_cents ? Math.round(first.max_cents / 100) : null;

  return {
    currency: first.currency_type?.toUpperCase() ?? null,
    min,
    max,
    interval: inferCompensationInterval(first.title ?? ""),
  };
}

function inferCompensationInterval(title: string): "YEAR" | "HOUR" | "UNKNOWN" {
  const normalized = title.toLowerCase();

  if (normalized.includes("hour")) {
    return "HOUR";
  }

  if (normalized.includes("year") || normalized.includes("annual") || normalized.includes("salary")) {
    return "YEAR";
  }

  return "UNKNOWN";
}

function formatSalaryRaw(compensation: NormalizedCompensation): string | null {
  if (!compensation.currency || (!compensation.min && !compensation.max)) {
    return null;
  }

  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: compensation.currency,
    maximumFractionDigits: 0,
  });

  if (compensation.min && compensation.max) {
    return `${formatter.format(compensation.min)} - ${formatter.format(compensation.max)} / ${compensation.interval.toLowerCase()}`;
  }

  if (compensation.min) {
    return `${formatter.format(compensation.min)}+ / ${compensation.interval.toLowerCase()}`;
  }

  return `${formatter.format(compensation.max as number)} / ${compensation.interval.toLowerCase()}`;
}

function calculateParseConfidence(job: GreenhouseJob): number {
  let score = 0.65;

  if (job.title?.trim()) {
    score += 0.1;
  }

  if (job.absolute_url?.trim()) {
    score += 0.1;
  }

  if (job.content?.trim()) {
    score += 0.1;
  }

  if (job.requisition_id || job.internal_job_id) {
    score += 0.05;
  }

  return Math.min(score, 0.98);
}
