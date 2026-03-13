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
import {
  collectUniqueText,
  fetchJsonWithRetry,
  hashText,
  inferEmploymentTypeFromText,
  inferRemoteTypeFromText,
} from "../helpers";

type LeverSiteConfig = {
  site: string;
  companyDisplayName?: string;
};

type LeverPostingCategorySet = {
  team?: string | null;
  department?: string | null;
  location?: string | null;
  allLocations?: string[] | null;
  commitment?: string | null;
};

type LeverPostingContent = {
  description?: string | null;
  descriptionPlain?: string | null;
  lists?: Array<{
    text?: string | null;
    content?: string | null;
  }> | null;
  closing?: string | null;
  closingHtml?: string | null;
};

type LeverSalaryRange = {
  min?: number | null;
  max?: number | null;
  currency?: string | null;
  interval?: string | null;
};

type LeverPosting = {
  id: string;
  text: string;
  createdAt?: number | null;
  updatedAt?: number | null;
  categories?: LeverPostingCategorySet | null;
  content?: LeverPostingContent | null;
  descriptionPlain?: string | null;
  description?: string | null;
  hostedUrl?: string | null;
  applyUrl?: string | null;
  workplaceType?: "onsite" | "remote" | "hybrid" | "unspecified" | null;
  salaryRange?: LeverSalaryRange | null;
  salaryDescription?: string | null;
  salaryDescriptionHtml?: string | null;
  distributionChannels?: string[] | null;
  requisitionCodes?: string[] | null;
  reqCode?: string | null;
  urls?: {
    list?: string | null;
    show?: string | null;
    apply?: string | null;
  } | null;
  lists?: Array<{
    text?: string | null;
    content?: string | null;
  }> | null;
};

export function createLeverAdapter(): SourceAdapter<LeverSiteConfig, LeverPosting[]> {
  return {
    name: "lever",
    surfaceKind: "API_FEED",
    async fetch(config) {
      const observedAt = new Date();
      const payload = await fetchJsonWithRetry<LeverPosting[]>(buildLeverPostingsUrl(config.site));

      return {
        observedAt,
        payload,
        retrievalState: "SUCCESS",
        sourceUrl: buildLeverPostingsUrl(config.site),
      };
    },
    async parse(result) {
      const site = extractLeverSiteFromUrl(result.sourceUrl);
      const companyName = siteToCompanyName(site);

      return {
        source: {
          type: SourceType.LEVER,
          name: `lever:${site}`,
          baseUrl: buildLeverJobSiteUrl(site),
          trustLevel: SourceTrustLevel.HIGH,
          metadata: {
            site,
            companyDisplayName: companyName,
            sourceApiUrl: result.sourceUrl,
          },
        },
        surfaceKind: "API_FEED",
        observedAt: result.observedAt,
        listings: result.payload.map((posting) => normalizeLeverPosting(posting, companyName, result.observedAt)),
      };
    },
    validate(result) {
      return {
        ...result,
        listings: result.listings.filter((listing) => Boolean(listing.title && listing.url && listing.companyName)),
      };
    },
  };
}

export async function syncLeverSite(config: LeverSiteConfig) {
  const adapter = createLeverAdapter();
  const fetched = await adapter.fetch(config);
  const parsed = await adapter.parse(fetched);
  return adapter.validate(parsed);
}

export async function checkLeverJobActivity(url: string): Promise<EndpointCheckResult> {
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

export function buildLeverPostingsUrl(site: string): string {
  return `https://api.lever.co/v0/postings/${site}?mode=json`;
}

export function buildLeverJobSiteUrl(site: string): string {
  return `https://jobs.lever.co/${site}`;
}

export function normalizeLeverPosting(
  posting: LeverPosting,
  companyDisplayName: string,
  observedAt: Date,
): NormalizedJobListing {
  const locationCandidates = collectUniqueText([
    posting.categories?.location ?? null,
    ...(posting.categories?.allLocations ?? []),
  ]);

  const descriptionPieces = [
    posting.content?.description ?? null,
    posting.description ?? null,
    posting.content?.lists?.map((item) => `${item.text ?? ""} ${item.content ?? ""}`).join(" ") ?? null,
    posting.content?.closingHtml ?? null,
  ].filter(Boolean);

  const descriptionRaw = descriptionPieces.join("\n\n").trim();
  const compensation = normalizeLeverCompensation(posting.salaryRange ?? null);
  const salaryRaw = formatLeverSalaryRaw(compensation, posting.salaryDescription ?? null);
  const remoteType = normalizeLeverRemoteType(posting);
  const employmentType =
    normalizeLeverEmploymentType(posting.categories?.commitment ?? null) ??
    inferEmploymentTypeFromText([posting.categories?.commitment ?? null]);
  const title = posting.text.trim();
  const requisitionId = posting.requisitionCodes?.[0] ?? posting.reqCode ?? extractLeverTitleRequisitionCode(title);

  const canonicalUrl = posting.hostedUrl ?? posting.urls?.show ?? posting.applyUrl ?? posting.urls?.apply ?? "";

  return {
    externalJobId: posting.id,
    url: canonicalUrl,
    title,
    companyName: companyDisplayName,
    location: locationCandidates[0] ?? null,
    remoteType,
    employmentType,
    salary: compensation,
    salaryRaw,
    descriptionRaw,
    postedAtRaw: timestampToIsoString(posting.updatedAt ?? posting.createdAt ?? null),
    firstSeenAt: observedAt,
    lastSeenAt: observedAt,
    isActive: true,
    parseConfidence: calculateLeverParseConfidence(posting),
    contentHash: hashText(descriptionRaw),
    payload: {
      lever: posting,
    },
    canonicalHints: {
      officialSourceUrl: canonicalUrl,
      requisitionId,
      internalJobId: null,
      departmentNames: collectUniqueText([posting.categories?.department ?? null, posting.categories?.team ?? null]),
      officeNames: locationCandidates,
    },
  };
}

function normalizeLeverCompensation(range: LeverSalaryRange | null): NormalizedCompensation | null {
  if (!range || (!range.min && !range.max)) {
    return null;
  }

  return {
    currency: range.currency?.toUpperCase() ?? null,
    min: range.min ?? null,
    max: range.max ?? null,
    interval: normalizeLeverInterval(range.interval ?? null),
  };
}

function normalizeLeverInterval(interval: string | null): "YEAR" | "HOUR" | "UNKNOWN" {
  const normalized = interval?.toLowerCase() ?? "";

  if (normalized.includes("hour")) {
    return "HOUR";
  }

  if (normalized.includes("year")) {
    return "YEAR";
  }

  return "UNKNOWN";
}

function formatLeverSalaryRaw(compensation: NormalizedCompensation | null, fallback: string | null): string | null {
  if (!compensation?.currency || (!compensation.min && !compensation.max)) {
    return fallback;
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

function normalizeLeverRemoteType(posting: LeverPosting): RemoteType {
  switch (posting.workplaceType) {
    case "remote":
      return RemoteType.REMOTE;
    case "hybrid":
      return RemoteType.HYBRID;
    case "onsite":
      return RemoteType.ONSITE;
    default:
      return inferRemoteTypeFromText([
        posting.categories?.location ?? null,
        ...(posting.categories?.allLocations ?? []),
      ]);
  }
}

function normalizeLeverEmploymentType(commitment: string | null): EmploymentType | null {
  const normalized = commitment?.toLowerCase().trim();

  switch (normalized) {
    case "full-time":
    case "full time":
      return EmploymentType.FULL_TIME;
    case "part-time":
    case "part time":
      return EmploymentType.PART_TIME;
    case "contract":
    case "contractor":
      return EmploymentType.CONTRACT;
    case "temporary":
    case "temp-worker":
      return EmploymentType.TEMPORARY;
    case "intern":
    case "internship":
      return EmploymentType.INTERN;
    default:
      return null;
  }
}

function calculateLeverParseConfidence(posting: LeverPosting): number {
  let score = 0.64;

  if (posting.text?.trim()) {
    score += 0.1;
  }

  if (posting.hostedUrl || posting.urls?.show) {
    score += 0.1;
  }

  if (posting.content?.description || posting.description) {
    score += 0.1;
  }

  if (posting.requisitionCodes?.length || posting.reqCode || extractLeverTitleRequisitionCode(posting.text)) {
    score += 0.04;
  }

  return Math.min(score, 0.98);
}

function extractLeverTitleRequisitionCode(title: string | null | undefined): string | null {
  if (!title) {
    return null;
  }

  const match = title.match(/\(\s*((?:REQ|R)-\d{2,})\s*\)\s*$/i);
  return match?.[1]?.toUpperCase() ?? null;
}

function timestampToIsoString(value: number | null): string | null {
  if (!value) {
    return null;
  }

  return new Date(value).toISOString();
}

function siteToCompanyName(site: string): string {
  return site
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function extractLeverSiteFromUrl(url: string): string {
  const match = url.match(/\/postings\/([^?]+)/);
  return match?.[1] ?? "unknown";
}
