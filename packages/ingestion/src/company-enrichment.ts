import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  CanonicalJobStatus,
  prisma,
  type Prisma,
  type PrismaClient,
  SourceType,
} from "@anti-ghost/database";

import { normalizeUrlForMatching } from "./canonicalization";

const CAREERS_KEYWORDS = [
  "career",
  "careers",
  "jobs",
  "join-us",
  "join_us",
  "joinourteam",
  "join-our-team",
  "open-roles",
  "openings",
  "work-with-us",
  "workwithus",
];

const ATS_HOSTS = new Set([
  "boards.greenhouse.io",
  "jobs.lever.co",
  "jobs.ashbyhq.com",
]);
const DEFAULT_COMPANY_SEED_CONFIG_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "config",
  "company-enrichment.seeds.json",
);

export const officialSourceMethods = {
  sourceCanonicalHint: "source_canonical_hint",
  companyCareersSource: "company_careers_source",
  companyLinkedExactJob: "company_linked_exact_job",
  companyLinkedAtsBoard: "company_linked_ats_board",
  trustedAtsBoardRoot: "trusted_ats_board_root",
  companyCareersPage: "company_careers_page",
} as const;

export type OfficialSourceMethod = (typeof officialSourceMethods)[keyof typeof officialSourceMethods];

export type CompanyEnrichmentRunSummary = {
  companiesScanned: number;
  companiesUpdated: number;
  jobsBackfilled: number;
  jobsVerified: number;
  jobsStillUnresolved: number;
};

export type PageFetchResult = {
  url: string;
  finalUrl: string;
  status: number | null;
  html: string | null;
};

export type PageFetcher = (url: string) => Promise<PageFetchResult>;
export type CompanyEnrichmentSeed = {
  normalizedName: string;
  primaryDomain: string;
  careersUrl?: string;
};
export type CompanyEnrichmentSeedMap = Map<string, CompanyEnrichmentSeed>;

type CompanyRecord = Prisma.CompanyGetPayload<{
  include: {
    canonicalJobs: {
      include: {
        sources: {
          include: {
            rawJobListing: {
              include: {
                source: true;
              };
            };
          };
        };
      };
    };
  };
}>;

type CompanyPageLink = {
  href: string;
  text: string;
};

type DerivedCompanySignals = {
  primaryDomain: string | null;
  primaryDomainConfidence: number | null;
  careersUrl: string | null;
  careersUrlConfidence: number | null;
  careersUrlSource: "existing_company_record" | "curated_company_seed" | "company_page_link" | "trusted_ats_board_root" | "unresolved";
  careersKeywordLink: string | null;
  atsLinks: string[];
  atsBoardRoot: string | null;
  atsBoardRootConfidence: number | null;
  atsBoardRootEvidence: {
    rootUrl: string;
    supportCount: number;
    sourceTypes: SourceType[];
  } | null;
  pageEvidence: Array<{
    url: string;
    status: number | null;
    linkCount: number;
  }>;
  domainEvidence: {
    source: string;
    value: string | null;
  };
};

type JobOfficialResolution = {
  url: string;
  confidence: number;
  method: OfficialSourceMethod;
  evidence: Prisma.InputJsonObject;
};

export async function enrichCompaniesAndBackfillOfficialSources(
  options: {
    db?: PrismaClient;
    pageFetcher?: PageFetcher;
    companySeeds?: CompanyEnrichmentSeedMap;
  } = {},
): Promise<CompanyEnrichmentRunSummary> {
  const db = options.db ?? prisma;
  const pageFetcher = options.pageFetcher ?? defaultPageFetcher;
  const companySeeds = options.companySeeds ?? (await loadCompanyEnrichmentSeeds());
  const companies = await loadCompaniesForEnrichment(db);

  let companiesUpdated = 0;
  let jobsBackfilled = 0;
  let jobsVerified = 0;
  let jobsStillUnresolved = 0;

  for (const company of companies) {
    const signals = await deriveCompanySignals(company, pageFetcher, companySeeds.get(company.normalizedName) ?? null);
    const companyUpdated = await persistCompanySignals(db, company, signals);

    if (companyUpdated) {
      companiesUpdated += 1;
    }

    for (const job of company.canonicalJobs) {
      const resolution = resolveOfficialSourceForJob(job, company, signals);
      const updated = await persistJobOfficialSource(db, job, resolution);

      if (!resolution) {
        if (!job.officialSourceUrl) {
          jobsStillUnresolved += 1;
        }

        continue;
      }

      if (!job.officialSourceUrl && updated) {
        jobsBackfilled += 1;
      } else if (updated) {
        jobsVerified += 1;
      }
    }
  }

  return {
    companiesScanned: companies.length,
    companiesUpdated,
    jobsBackfilled,
    jobsVerified,
    jobsStillUnresolved,
  };
}

export async function loadCompaniesForEnrichment(db: PrismaClient): Promise<CompanyRecord[]> {
  return db.company.findMany({
    include: {
      canonicalJobs: {
        where: {
          currentStatus: CanonicalJobStatus.ACTIVE,
        },
        include: {
          sources: {
            include: {
              rawJobListing: {
                include: {
                  source: true,
                },
              },
            },
            orderBy: [
              {
                precedenceRank: "asc",
              },
              {
                createdAt: "asc",
              },
            ],
          },
        },
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
  });
}

export async function deriveCompanySignals(
  company: CompanyRecord,
  pageFetcher: PageFetcher,
  companySeed: CompanyEnrichmentSeed | null = null,
): Promise<DerivedCompanySignals> {
  const domainCandidate = derivePrimaryDomainCandidate(company, companySeed);
  const existingCareersUrl = normalizeUrlForMatching(company.careersUrl);
  const existingCareersUrlSource = readStoredCareersUrlSource(company.enrichmentEvidenceJson, existingCareersUrl);
  const seededCareersUrl = companySeed?.careersUrl ? normalizeUrlForMatching(companySeed.careersUrl) : null;
  const pageUrls = uniqueValues(
    [
      domainCandidate.homepageUrl,
      existingCareersUrl,
      seededCareersUrl,
    ].filter(Boolean),
  );

  const fetchedPages = await Promise.all(pageUrls.map((url) => pageFetcher(url)));
  const normalizedHomepageUrl = normalizeUrlForMatching(domainCandidate.homepageUrl);
  const homepagePage =
    fetchedPages.find((page) => normalizeUrlForMatching(page.url) === normalizedHomepageUrl) ?? null;
  const homepageLinks = homepagePage?.html ? extractLinks(homepagePage.html, homepagePage.finalUrl) : [];
  const homepageCareersLink = selectBestCareersLink(homepageLinks, domainCandidate.domain);
  const atsBoardRoot = deriveTrustedAtsBoardRoot(company);
  const careersUrl =
    existingCareersUrl ??
    seededCareersUrl ??
    homepageCareersLink ??
    atsBoardRoot?.rootUrl ??
    null;
  const careersUrlSource = existingCareersUrl
    ? existingCareersUrlSource ?? "existing_company_record"
    : seededCareersUrl
      ? "curated_company_seed"
      : homepageCareersLink
        ? "company_page_link"
        : atsBoardRoot
          ? "trusted_ats_board_root"
          : "unresolved";
  const careersConfidence = existingCareersUrl
    ? company.careersUrlConfidence ??
      (existingCareersUrlSource === "trusted_ats_board_root" ? 0.83 : 0.92)
    : seededCareersUrl
      ? 0.97
      : homepageCareersLink
        ? 0.88
        : atsBoardRoot
          ? 0.83
          : null;

  const careersPage =
    careersUrl && !pageUrls.includes(careersUrl)
      ? await pageFetcher(careersUrl)
      : fetchedPages.find((page) => normalizeUrlForMatching(page.url) === careersUrl) ?? null;
  const careersLinks = careersPage?.html ? extractLinks(careersPage.html, careersPage.finalUrl) : [];
  const atsLinks = uniqueValues([
    ...collectAtsLinks(homepageLinks),
    ...collectAtsLinks(careersLinks),
  ]);

  return {
    primaryDomain: domainCandidate.domain,
    primaryDomainConfidence: domainCandidate.confidence,
    careersUrl,
    careersUrlConfidence: careersConfidence,
    careersUrlSource,
    careersKeywordLink: homepageCareersLink,
    atsLinks,
    atsBoardRoot: atsBoardRoot?.rootUrl ?? null,
    atsBoardRootConfidence: atsBoardRoot?.confidence ?? null,
    atsBoardRootEvidence: atsBoardRoot
      ? {
          rootUrl: atsBoardRoot.rootUrl,
          supportCount: atsBoardRoot.supportCount,
          sourceTypes: atsBoardRoot.sourceTypes,
        }
      : null,
    pageEvidence: uniquePageEvidence([...fetchedPages, ...(careersPage ? [careersPage] : [])], {
      [homepagePage?.finalUrl ?? ""]: homepageLinks.length,
      [careersPage?.finalUrl ?? ""]: careersLinks.length,
    }),
    domainEvidence: {
      source: domainCandidate.source,
      value: domainCandidate.domain,
    },
  };
}

export function resolveOfficialSourceForJob(
  job: CompanyRecord["canonicalJobs"][number],
  company: CompanyRecord,
  signals: DerivedCompanySignals,
): JobOfficialResolution | null {
  const canonicalSource = job.sources.find((source) => source.isCanonicalSource) ?? job.sources[0] ?? null;
  const normalizedCurrentOfficial = normalizeUrlForMatching(job.officialSourceUrl);

  if (normalizedCurrentOfficial) {
    const verifiedExisting = matchCompanyAtsLink(job.officialSourceUrl ?? normalizedCurrentOfficial, signals.atsLinks);

    if (verifiedExisting) {
      const trustedAtsBoardRoot = signals.careersUrlSource === "trusted_ats_board_root";
      return {
        url: job.officialSourceUrl as string,
        confidence: trustedAtsBoardRoot
          ? verifiedExisting.exactMatch
            ? 0.92
            : 0.88
          : 0.95,
        method: trustedAtsBoardRoot
          ? officialSourceMethods.trustedAtsBoardRoot
          : verifiedExisting.exactMatch
            ? officialSourceMethods.companyLinkedExactJob
            : officialSourceMethods.companyLinkedAtsBoard,
        evidence: {
          matchedCompanyLink: verifiedExisting.matchedLink,
          primaryDomain: signals.primaryDomain,
          careersUrl: signals.careersUrl,
          careersUrlSource: signals.careersUrlSource,
          atsBoardRootEvidence: signals.atsBoardRootEvidence,
        },
      };
    }

    if (!job.officialSourceMethod) {
      return {
        url: job.officialSourceUrl as string,
        confidence: job.officialSourceConfidence ?? inferExistingOfficialConfidence(canonicalSource?.rawJobListing.source.sourceType),
        method:
          canonicalSource?.rawJobListing.source.sourceType === SourceType.COMPANY_CAREERS
            ? officialSourceMethods.companyCareersSource
            : officialSourceMethods.sourceCanonicalHint,
        evidence: {
          canonicalSourceType: canonicalSource?.rawJobListing.source.sourceType ?? "UNKNOWN",
          sourceUrl: canonicalSource?.rawJobListing.url ?? null,
        },
      };
    }

    return null;
  }

  const atsCandidate = canonicalSource && isAtsSourceType(canonicalSource.rawJobListing.source.sourceType)
    ? matchCompanyAtsLink(canonicalSource.rawJobListing.url, signals.atsLinks)
    : null;

  if (atsCandidate && canonicalSource) {
    const trustedAtsBoardRoot = signals.careersUrlSource === "trusted_ats_board_root";
    return {
      url: canonicalSource.rawJobListing.url,
      confidence: trustedAtsBoardRoot
        ? atsCandidate.exactMatch
          ? 0.92
          : 0.88
        : atsCandidate.exactMatch
          ? 0.96
          : 0.91,
      method: trustedAtsBoardRoot
        ? officialSourceMethods.trustedAtsBoardRoot
        : atsCandidate.exactMatch
          ? officialSourceMethods.companyLinkedExactJob
          : officialSourceMethods.companyLinkedAtsBoard,
      evidence: {
        matchedCompanyLink: atsCandidate.matchedLink,
        canonicalSourceType: canonicalSource.rawJobListing.source.sourceType,
        canonicalSourceUrl: canonicalSource.rawJobListing.url,
        primaryDomain: signals.primaryDomain,
        careersUrl: signals.careersUrl,
        careersUrlSource: signals.careersUrlSource,
        atsBoardRootEvidence: signals.atsBoardRootEvidence,
      },
    };
  }

  if (signals.careersUrl && signals.careersUrlSource !== "trusted_ats_board_root") {
    return {
      url: signals.careersUrl,
      confidence: Math.min(signals.careersUrlConfidence ?? 0.76, 0.8),
      method: officialSourceMethods.companyCareersPage,
      evidence: {
        primaryDomain: signals.primaryDomain,
        careersUrl: signals.careersUrl,
        careersKeywordLink: signals.careersKeywordLink,
        companyName: company.displayName,
      },
    };
  }

  return null;
}

async function persistCompanySignals(
  db: PrismaClient,
  company: CompanyRecord,
  signals: DerivedCompanySignals,
): Promise<boolean> {
  const update: Prisma.CompanyUpdateInput = {};

  if (shouldUpdateStringValue(company.primaryDomain, signals.primaryDomain, company.primaryDomainConfidence, signals.primaryDomainConfidence)) {
    update.primaryDomain = signals.primaryDomain;
    update.primaryDomainConfidence = signals.primaryDomainConfidence;
  }

  if (shouldUpdateStringValue(company.careersUrl, signals.careersUrl, company.careersUrlConfidence, signals.careersUrlConfidence)) {
    update.careersUrl = signals.careersUrl;
    update.careersUrlConfidence = signals.careersUrlConfidence;
  }

  const evidence = buildCompanyEvidence(company, signals);
  const previousEvidence = stringifyJson(company.enrichmentEvidenceJson);
  const nextEvidence = stringifyJson(evidence);

  if (previousEvidence !== nextEvidence) {
    update.enrichmentEvidenceJson = evidence;
  }

  if (Object.keys(update).length === 0) {
    return false;
  }

  await db.company.update({
    where: {
      id: company.id,
    },
    data: update,
  });

  return true;
}

async function persistJobOfficialSource(
  db: PrismaClient,
  job: CompanyRecord["canonicalJobs"][number],
  resolution: JobOfficialResolution | null,
): Promise<boolean> {
  if (!resolution) {
    return false;
  }

  const currentNormalizedUrl = normalizeUrlForMatching(job.officialSourceUrl);
  const nextNormalizedUrl = normalizeUrlForMatching(resolution.url);
  const sameUrl = currentNormalizedUrl && nextNormalizedUrl ? currentNormalizedUrl === nextNormalizedUrl : false;
  const strongerConfidence = (resolution.confidence ?? 0) > ((job.officialSourceConfidence ?? 0) + 0.02);
  const evidenceChanged =
    stringifyJson(job.officialSourceEvidenceJson) !== stringifyJson(resolution.evidence as Prisma.JsonValue);

  if (
    job.officialSourceUrl &&
    !sameUrl &&
    job.officialSourceMethod
  ) {
    return false;
  }

  if (
    job.officialSourceUrl &&
    sameUrl &&
    job.officialSourceMethod === resolution.method &&
    !strongerConfidence &&
    !evidenceChanged
  ) {
    return false;
  }

  await db.canonicalJob.update({
    where: {
      id: job.id,
    },
    data: {
      officialSourceUrl: job.officialSourceUrl ?? resolution.url,
      officialSourceConfidence:
        !job.officialSourceUrl || sameUrl || strongerConfidence
          ? resolution.confidence
          : job.officialSourceConfidence,
      officialSourceMethod: resolution.method,
      officialSourceEvidenceJson: resolution.evidence,
    },
  });

  return true;
}

function derivePrimaryDomainCandidate(company: CompanyRecord, companySeed: CompanyEnrichmentSeed | null): {
  domain: string | null;
  confidence: number | null;
  source: string;
  homepageUrl: string | null;
} {
  const existingDomain = normalizeDomain(company.primaryDomain);

  if (existingDomain) {
    return {
      domain: existingDomain,
      confidence: company.primaryDomainConfidence ?? 0.98,
      source: "existing_primary_domain",
      homepageUrl: normalizeUrlForMatching(`https://${existingDomain}`),
    };
  }

  const careersDomain = normalizeDomain(readHostname(company.careersUrl));

  if (careersDomain) {
    return {
      domain: careersDomain,
      confidence: 0.92,
      source: "existing_careers_url",
      homepageUrl: normalizeUrlForMatching(`https://${careersDomain}`),
    };
  }

  if (companySeed) {
    const seededDomain = normalizeDomain(companySeed.primaryDomain);

    if (seededDomain) {
      return {
        domain: seededDomain,
        confidence: 0.99,
        source: "curated_company_seed",
        homepageUrl: normalizeUrlForMatching(`https://${seededDomain}`),
      };
    }
  }

  const sourceCandidates = company.canonicalJobs
    .flatMap((job) => job.sources)
    .map((source) => ({
      sourceType: source.rawJobListing.source.sourceType,
      hostname: normalizeDomain(readHostname(source.rawJobListing.url)),
    }))
    .filter((candidate) => candidate.hostname && !ATS_HOSTS.has(candidate.hostname));

  const companyCareersCandidate = sourceCandidates.find((candidate) => candidate.sourceType === SourceType.COMPANY_CAREERS);

  if (companyCareersCandidate?.hostname) {
    return {
      domain: companyCareersCandidate.hostname,
      confidence: 0.86,
      source: "company_careers_source",
      homepageUrl: normalizeUrlForMatching(`https://${companyCareersCandidate.hostname}`),
    };
  }

  const structuredCandidate = sourceCandidates.find((candidate) => candidate.sourceType === SourceType.STRUCTURED_PAGE);

  if (structuredCandidate?.hostname) {
    return {
      domain: structuredCandidate.hostname,
      confidence: 0.74,
      source: "structured_page_source",
      homepageUrl: normalizeUrlForMatching(`https://${structuredCandidate.hostname}`),
    };
  }

  return {
    domain: null,
    confidence: null,
    source: "unresolved",
    homepageUrl: null,
  };
}

export async function loadCompanyEnrichmentSeeds(
  configPath: string = DEFAULT_COMPANY_SEED_CONFIG_PATH,
): Promise<CompanyEnrichmentSeedMap> {
  try {
    const raw = await readFile(configPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return parseCompanyEnrichmentSeedMap(parsed);
  } catch (error) {
    if (isMissingFileError(error)) {
      return new Map();
    }

    throw error;
  }
}

export function parseCompanyEnrichmentSeedMap(value: unknown): CompanyEnrichmentSeedMap {
  if (!value || typeof value !== "object" || !("companies" in value)) {
    throw new Error("Company seed config must be an object with a companies array.");
  }

  const { companies } = value as { companies?: unknown };

  if (!Array.isArray(companies)) {
    throw new Error("Company seed config must include a companies array.");
  }

  return new Map(companies.map(parseCompanyEnrichmentSeed).map((seed) => [seed.normalizedName, seed]));
}

function parseCompanyEnrichmentSeed(value: unknown): CompanyEnrichmentSeed {
  if (!value || typeof value !== "object") {
    throw new Error("Each company seed entry must be an object.");
  }

  const candidate = value as Record<string, unknown>;
  const normalizedName = readRequiredSeedString(candidate.normalizedName, "normalizedName");
  const primaryDomain = readRequiredSeedString(candidate.primaryDomain, "primaryDomain");
  const careersUrl = readOptionalSeedString(candidate.careersUrl);

  return {
    normalizedName: normalizedName.toLowerCase(),
    primaryDomain,
    ...(careersUrl ? { careersUrl } : {}),
  };
}

function readRequiredSeedString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Company seed ${fieldName} must be a non-empty string.`);
  }

  return value.trim();
}

function readOptionalSeedString(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("Company seed careersUrl must be a non-empty string when provided.");
  }

  return value.trim();
}

function selectBestCareersLink(links: CompanyPageLink[], companyDomain: string | null): string | null {
  const candidates = links
    .filter((link) => {
      const normalizedUrl = normalizeUrlForMatching(link.href);
      const hostname = normalizeDomain(readHostname(normalizedUrl));

      if (!normalizedUrl || !hostname || !companyDomain || hostname !== companyDomain) {
        return false;
      }

      const haystack = `${normalizedUrl} ${link.text}`.toLowerCase();
      return CAREERS_KEYWORDS.some((keyword) => haystack.includes(keyword));
    })
    .map((link) => ({
      url: normalizeUrlForMatching(link.href) as string,
      score: scoreCareersLink(link),
    }))
    .sort((left, right) => right.score - left.score || left.url.localeCompare(right.url));

  return candidates[0]?.url ?? null;
}

function collectAtsLinks(links: CompanyPageLink[]): string[] {
  return uniqueValues(
    links
      .map((link) => normalizeUrlForMatching(link.href))
      .filter((link): link is string => {
        const hostname = normalizeDomain(readHostname(link));
        return Boolean(link) && Boolean(hostname) && ATS_HOSTS.has(hostname as string);
      }),
  );
}

function extractLinks(html: string, baseUrl: string): CompanyPageLink[] {
  const links: CompanyPageLink[] = [];
  const anchorPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gis;

  for (const match of html.matchAll(anchorPattern)) {
    const href = resolveHref(match[1] ?? "", baseUrl);
    const text = stripHtml(match[2] ?? "").trim();

    if (!href) {
      continue;
    }

    links.push({
      href,
      text,
    });
  }

  return uniqueValuesByKey(links, (link) => `${normalizeUrlForMatching(link.href)}::${link.text.toLowerCase()}`);
}

function matchCompanyAtsLink(
  jobUrl: string,
  atsLinks: string[],
): {
  matchedLink: string;
  exactMatch: boolean;
} | null {
  const normalizedJobUrl = normalizeUrlForMatching(jobUrl);

  if (!normalizedJobUrl) {
    return null;
  }

  for (const atsLink of atsLinks) {
    const normalizedAtsLink = normalizeUrlForMatching(atsLink);

    if (!normalizedAtsLink) {
      continue;
    }

    if (normalizedJobUrl === normalizedAtsLink) {
      return {
        matchedLink: normalizedAtsLink,
        exactMatch: true,
      };
    }

    if (normalizedJobUrl.startsWith(`${normalizedAtsLink}/`)) {
      return {
        matchedLink: normalizedAtsLink,
        exactMatch: false,
      };
    }
  }

  return null;
}

function buildCompanyEvidence(
  company: CompanyRecord,
  signals: DerivedCompanySignals,
): Prisma.InputJsonObject {
  return {
    companyName: company.displayName,
    primaryDomain: signals.primaryDomain,
    primaryDomainConfidence: signals.primaryDomainConfidence,
    careersUrl: signals.careersUrl,
    careersUrlConfidence: signals.careersUrlConfidence,
    careersUrlSource: signals.careersUrlSource,
    atsLinks: signals.atsLinks,
    atsBoardRoot: signals.atsBoardRoot,
    atsBoardRootConfidence: signals.atsBoardRootConfidence,
    atsBoardRootEvidence: signals.atsBoardRootEvidence,
    pageEvidence: signals.pageEvidence,
    domainEvidence: signals.domainEvidence,
  };
}

function scoreCareersLink(link: CompanyPageLink): number {
  const normalized = `${link.href} ${link.text}`.toLowerCase();
  let score = 0;

  if (normalized.includes("career")) {
    score += 4;
  }

  if (normalized.includes("jobs")) {
    score += 3;
  }

  if (normalized.includes("open role") || normalized.includes("opening")) {
    score += 2;
  }

  const url = normalizeUrlForMatching(link.href);

  if (url && url !== normalizeUrlForMatching(`https://${readHostname(url) ?? ""}`)) {
    score += 1;
  }

  return score;
}

function inferExistingOfficialConfidence(sourceType: SourceType | undefined): number {
  switch (sourceType) {
    case SourceType.COMPANY_CAREERS:
      return 0.94;
    case SourceType.GREENHOUSE:
    case SourceType.LEVER:
    case SourceType.ASHBY:
      return 0.84;
    case SourceType.STRUCTURED_PAGE:
      return 0.72;
    default:
      return 0.6;
  }
}

function deriveTrustedAtsBoardRoot(company: CompanyRecord): {
  rootUrl: string;
  confidence: number;
  supportCount: number;
  sourceTypes: SourceType[];
} | null {
  const atsRoots = company.canonicalJobs
    .flatMap((job) => job.sources)
    .map((source) => ({
      rootUrl: deriveAtsBoardRoot(source.rawJobListing.url),
      sourceType: source.rawJobListing.source.sourceType,
    }))
    .filter(
      (
        candidate,
      ): candidate is {
        rootUrl: string;
        sourceType: SourceType;
      } => Boolean(candidate.rootUrl) && isAtsSourceType(candidate.sourceType),
    );

  const groupedRoots = new Map<
    string,
    {
      supportCount: number;
      sourceTypes: Set<SourceType>;
    }
  >();

  for (const candidate of atsRoots) {
    const existing = groupedRoots.get(candidate.rootUrl) ?? {
      supportCount: 0,
      sourceTypes: new Set<SourceType>(),
    };
    existing.supportCount += 1;
    existing.sourceTypes.add(candidate.sourceType);
    groupedRoots.set(candidate.rootUrl, existing);
  }

  if (groupedRoots.size !== 1) {
    return null;
  }

  const singleRootEntry = [...groupedRoots.entries()][0];

  if (!singleRootEntry) {
    return null;
  }

  const [rootUrl, rootEvidence] = singleRootEntry;

  if ((rootEvidence?.supportCount ?? 0) < 2) {
    return null;
  }

  return {
    rootUrl,
    confidence: 0.83,
    supportCount: rootEvidence.supportCount,
    sourceTypes: [...rootEvidence.sourceTypes].sort(),
  };
}

function deriveAtsBoardRoot(url: string): string | null {
  const normalizedUrl = normalizeUrlForMatching(url);
  const parsedUrl = readUrl(normalizedUrl);
  if (!parsedUrl) {
    return null;
  }

  const hostname = normalizeDomain(parsedUrl.hostname);
  const pathSegments = parsedUrl.pathname.split("/").filter(Boolean);
  const tenant = pathSegments[0];

  if (!tenant) {
    return null;
  }

  if (hostname === "boards.greenhouse.io" || hostname === "job-boards.greenhouse.io") {
    return normalizeUrlForMatching(`${parsedUrl.origin}/${tenant}`);
  }

  if (hostname === "jobs.lever.co" || hostname === "jobs.ashbyhq.com") {
    return normalizeUrlForMatching(`${parsedUrl.origin}/${tenant}`);
  }

  return null;
}

function shouldUpdateStringValue(
  currentValue: string | null,
  nextValue: string | null,
  currentConfidence: number | null,
  nextConfidence: number | null,
): boolean {
  const normalizedCurrent = normalizeStringValue(currentValue);
  const normalizedNext = normalizeStringValue(nextValue);

  if (!normalizedNext) {
    return false;
  }

  if (!normalizedCurrent) {
    return true;
  }

  if (normalizedCurrent !== normalizedNext) {
    return false;
  }

  return (nextConfidence ?? 0) > ((currentConfidence ?? 0) + 0.01);
}

function normalizeStringValue(value: string | null): string | null {
  return value?.trim().toLowerCase() || null;
}

function uniquePageEvidence(
  pages: PageFetchResult[],
  linkCountsByUrl: Record<string, number>,
): DerivedCompanySignals["pageEvidence"] {
  return uniqueValuesByKey(
    pages
      .filter((page) => page.url || page.finalUrl)
      .map((page) => ({
        url: page.finalUrl || page.url,
        status: page.status,
        linkCount: linkCountsByUrl[page.finalUrl] ?? linkCountsByUrl[page.url] ?? 0,
      })),
    (page) => `${page.url}::${page.status ?? "unknown"}`,
  );
}

function resolveHref(value: string, baseUrl: string): string | null {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return null;
  }
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

function readHostname(value: string | null | undefined): string | null {
  return readUrl(value)?.hostname ?? null;
}

function readUrl(value: string | null | undefined): URL | null {
  if (!value) {
    return null;
  }

  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function normalizeDomain(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  return value.toLowerCase().replace(/^www\./, "").trim() || null;
}

function uniqueValues<TValue>(values: Array<TValue | null | undefined>): TValue[] {
  return [...new Set(values.filter((value): value is TValue => value !== null && value !== undefined))];
}

function uniqueValuesByKey<TValue>(values: TValue[], getKey: (value: TValue) => string): TValue[] {
  return [...new Map(values.map((value) => [getKey(value), value])).values()];
}

function stringifyJson(value: Prisma.JsonValue | Prisma.InputJsonValue | null | undefined): string {
  return JSON.stringify(value ?? null);
}

function readStoredCareersUrlSource(
  enrichmentEvidence: Prisma.JsonValue | null,
  careersUrl: string | null,
): DerivedCompanySignals["careersUrlSource"] | null {
  if (!careersUrl || !isRecord(enrichmentEvidence)) {
    return null;
  }

  const evidenceCareersUrl =
    typeof enrichmentEvidence.careersUrl === "string"
      ? normalizeUrlForMatching(enrichmentEvidence.careersUrl)
      : null;
  const careersUrlSource = enrichmentEvidence.careersUrlSource;

  if (evidenceCareersUrl !== careersUrl || typeof careersUrlSource !== "string") {
    return null;
  }

  return isCareersUrlSource(careersUrlSource) ? careersUrlSource : null;
}

function isAtsSourceType(sourceType: SourceType): boolean {
  return (
    sourceType === SourceType.GREENHOUSE ||
    sourceType === SourceType.LEVER ||
    sourceType === SourceType.ASHBY
  );
}

async function defaultPageFetcher(url: string): Promise<PageFetchResult> {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "anti-ghost-job-search-engine/0.1",
      },
    });
    const contentType = response.headers.get("content-type") ?? "";
    const html = contentType.includes("text/html") ? await response.text() : null;

    return {
      url,
      finalUrl: normalizeUrlForMatching(response.url) ?? response.url,
      status: response.status,
      html,
    };
  } catch {
    return {
      url,
      finalUrl: url,
      status: null,
      html: null,
    };
  }
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return false;
  }

  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

function isRecord(value: Prisma.JsonValue | null): value is Record<string, Prisma.JsonValue> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isCareersUrlSource(value: string): value is DerivedCompanySignals["careersUrlSource"] {
  return (
    value === "existing_company_record" ||
    value === "curated_company_seed" ||
    value === "company_page_link" ||
    value === "trusted_ats_board_root" ||
    value === "unresolved"
  );
}
