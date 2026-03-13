import { randomUUID } from "node:crypto";

import {
  CanonicalJobStatus,
  EmploymentType,
  Prisma,
  prisma,
  PrismaClient,
  RemoteType,
  SourceTrustLevel,
  SourceType,
} from "@anti-ghost/database";

const FUZZY_MATCH_THRESHOLD = 0.84;
const FUZZY_TITLE_THRESHOLD = 0.72;
const CANONICAL_JOB_CREATE_CHUNK_SIZE = 100;
const CANONICAL_LINK_CREATE_CHUNK_SIZE = 100;
const LOCAL_PGLITE_CANONICALIZE_LISTING_LIMIT = 500;
const LOCAL_PGLITE_CANONICALIZE_BATCH_TARGET = 150;

export type CanonicalizationSalary = {
  currency: string | null;
  min: number | null;
  max: number | null;
  interval: "YEAR" | "HOUR" | "UNKNOWN";
};

export type CanonicalizationListing = {
  rawJobListingId: string;
  sourceId: string;
  sourceType: SourceType;
  sourceName: string;
  sourceTrustLevel: SourceTrustLevel;
  sourceBaseUrl: string | null;
  externalJobId: string | null;
  url: string;
  title: string;
  companyName: string;
  location: string | null;
  remoteType: RemoteType;
  employmentType: EmploymentType;
  salary: CanonicalizationSalary | null;
  descriptionRaw: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
  isActive: boolean;
  parseConfidence: number;
  contentHash: string | null;
  officialSourceUrl: string | null;
  requisitionId: string | null;
  internalJobId: number | null;
  departmentNames: string[];
  officeNames: string[];
  existingCanonicalJobIds: string[];
  normalized: {
    companyName: string;
    title: string;
    location: string | null;
    officialSourceUrl: string | null;
  };
};

export type MergeRule =
  | "seed"
  | "official_source_url"
  | "requisition_id"
  | "internal_job_id"
  | "fuzzy_title_location";

export type MergeRationale = {
  rule: MergeRule;
  confidence: number;
  titleSimilarity: number;
  locationSimilarity: number;
  remoteCompatibility: number;
  employmentCompatibility: number;
  matchedOn: string[];
};

export type CanonicalClusterMember = {
  listing: CanonicalizationListing;
  rationale: MergeRationale;
  canonicalSourceRank: number;
};

export type CanonicalCluster = {
  members: CanonicalClusterMember[];
  canonicalSourceListingId: string;
  clusterConfidence: number;
};

export type CanonicalizationRunSummary = {
  scannedListingCount: number;
  clusterCount: number;
  createdCanonicalJobCount: number;
  updatedCanonicalJobCount: number;
  linkedSourceCount: number;
};

type RawListingRecord = Prisma.RawJobListingGetPayload<{
  include: {
    source: true;
    canonicalLinks: {
      select: {
        canonicalJobId: true;
      };
    };
  };
}>;

export async function canonicalizeActiveListings(
  options: {
    db?: PrismaClient;
  } = {},
): Promise<CanonicalizationRunSummary> {
  const db = options.db ?? prisma;
  const listings = await loadListingsForCanonicalization(db);
  let clusterCount = 0;
  let summary: Omit<CanonicalizationRunSummary, "scannedListingCount" | "clusterCount">;

  if (shouldBatchLocalSingleConnectionCanonicalize(process.env.DATABASE_URL, listings.length)) {
    const batchSummary = await persistCanonicalizationBatches(db, createCanonicalizationBatches(listings));
    clusterCount = batchSummary.clusterCount;
    summary = batchSummary;
  } else {
    const clusters = buildCanonicalClusters(listings);
    clusterCount = clusters.length;
    summary = await persistCanonicalClusters(db, clusters);
  }

  await db.canonicalJob.updateMany({
    where: {
      sources: {
        none: {
          rawJobListing: {
            isActive: true,
          },
        },
      },
    },
    data: {
      currentStatus: CanonicalJobStatus.INACTIVE,
    },
  });

  await db.canonicalJob.deleteMany({
    where: {
      sources: {
        none: {},
      },
      savedJobs: {
        none: {},
      },
    },
  });

  return {
    scannedListingCount: listings.length,
    clusterCount,
    ...summary,
  };
}

export async function loadListingsForCanonicalization(
  db: PrismaClient,
): Promise<CanonicalizationListing[]> {
  const rows = await db.rawJobListing.findMany({
    where: {
      isActive: true,
    },
    include: {
      source: true,
      canonicalLinks: {
        select: {
          canonicalJobId: true,
        },
      },
    },
    orderBy: [
      {
        lastSeenAt: "desc",
      },
      {
        createdAt: "asc",
      },
    ],
  });

  return rows.map(mapRawListingToCanonicalizationListing);
}

export function buildCanonicalClusters(listings: CanonicalizationListing[]): CanonicalCluster[] {
  const clusters: CanonicalCluster[] = [];
  const officialUrlIndex = new Map<string, number>();
  const requisitionIndex = new Map<string, number>();
  const internalJobIndex = new Map<string, number>();

  const orderedListings = [...listings].sort((left, right) => {
    return scoreCanonicalSourceCandidate(right) - scoreCanonicalSourceCandidate(left);
  });

  for (const listing of orderedListings) {
    const hardMatchIndex =
      findIndexedCluster(officialUrlIndex, buildOfficialUrlKey(listing)) ??
      findIndexedCluster(requisitionIndex, buildRequisitionKey(listing)) ??
      findIndexedCluster(internalJobIndex, buildInternalJobKey(listing));

    if (hardMatchIndex !== null) {
      const cluster = clusters[hardMatchIndex];

      if (!cluster) {
        continue;
      }

      addListingToCluster(cluster, listing);
      indexClusterKeys(cluster, hardMatchIndex, officialUrlIndex, requisitionIndex, internalJobIndex);
      continue;
    }

    const fuzzyMatch = findBestFuzzyCluster(clusters, listing);

    if (fuzzyMatch) {
      const cluster = clusters[fuzzyMatch.clusterIndex];

      if (!cluster) {
        continue;
      }

      addListingToCluster(cluster, listing, fuzzyMatch.rationale);
      indexClusterKeys(cluster, fuzzyMatch.clusterIndex, officialUrlIndex, requisitionIndex, internalJobIndex);
      continue;
    }

    const clusterIndex = clusters.push(createCluster(listing)) - 1;
    indexClusterKeys(clusters[clusterIndex] as CanonicalCluster, clusterIndex, officialUrlIndex, requisitionIndex, internalJobIndex);
  }

  return clusters.map(finalizeCluster);
}

export function createCanonicalizationBatches(
  listings: CanonicalizationListing[],
  targetBatchListingCount = LOCAL_PGLITE_CANONICALIZE_BATCH_TARGET,
): CanonicalizationListing[][] {
  if (listings.length === 0) {
    return [];
  }

  const listingsByCompany = new Map<string, CanonicalizationListing[]>();

  for (const listing of listings) {
    const key = listing.normalized.companyName || "__unknown_company__";
    const existing = listingsByCompany.get(key);

    if (existing) {
      existing.push(listing);
      continue;
    }

    listingsByCompany.set(key, [listing]);
  }

  const companyBatches = [...listingsByCompany.values()].sort((left, right) => right.length - left.length);
  const batches: CanonicalizationListing[][] = [];
  let currentBatch: CanonicalizationListing[] = [];
  let currentBatchCount = 0;

  for (const companyListings of companyBatches) {
    if (currentBatchCount > 0 && currentBatchCount + companyListings.length > targetBatchListingCount) {
      batches.push(currentBatch);
      currentBatch = [];
      currentBatchCount = 0;
    }

    currentBatch.push(...companyListings);
    currentBatchCount += companyListings.length;

    if (currentBatchCount >= targetBatchListingCount) {
      batches.push(currentBatch);
      currentBatch = [];
      currentBatchCount = 0;
    }
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}

export function normalizeCompanyName(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(inc|llc|ltd|corp|corporation|co|company)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeJobTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(sr|senior)\b/g, " senior ")
    .replace(/\b(jr|junior)\b/g, " junior ")
    .replace(/\b(staff-level)\b/g, " staff ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeLocation(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value
    .toLowerCase()
    .replace(/\b(united states|usa|u\.s\.)\b/g, "us")
    .replace(/\b(remote)\b/g, "remote")
    .replace(/[()]/g, " ")
    .replace(/[^a-z0-9, ]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

  return normalized || null;
}

export function normalizeUrlForMatching(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = new URL(value);
    parsed.hash = "";
    parsed.searchParams.forEach((_, key) => {
      if (key.toLowerCase().startsWith("utm_")) {
        parsed.searchParams.delete(key);
      }
    });

    const pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    return `${parsed.protocol}//${parsed.hostname.toLowerCase()}${pathname}${parsed.search}`;
  } catch {
    return value.trim().toLowerCase().replace(/\/+$/, "");
  }
}

async function persistCanonicalClusters(
  db: PrismaClient,
  clusters: CanonicalCluster[],
): Promise<Omit<CanonicalizationRunSummary, "scannedListingCount" | "clusterCount">> {
  const useSingleConnectionSafeWrites = isLocalSingleConnectionDatabaseUrl(process.env.DATABASE_URL);
  let createdCanonicalJobCount = 0;
  let updatedCanonicalJobCount = 0;
  const claimedCanonicalJobIds = new Set<string>();
  const companyIdsByNormalizedName = await prepareCanonicalCompanies(db, clusters);
  const canonicalJobCreates: Array<{
    canonicalJobId: string;
    payload: ReturnType<typeof buildCanonicalJobPayload>;
  }> = [];
  const canonicalJobUpdates: Array<{
    canonicalJobId: string;
    payload: ReturnType<typeof buildCanonicalJobPayload>;
  }> = [];
  const canonicalJobSourcePayloads: Array<ReturnType<typeof buildCanonicalJobSourcePayload>> = [];
  const obsoleteCanonicalJobIds = new Set<string>();
  const activeRawJobListingIds = uniqueValues(
    clusters.flatMap((cluster) => cluster.members.map((member) => member.listing.rawJobListingId)),
  );

  for (const cluster of clusters) {
    const preferredCanonicalJobId = await resolvePreferredCanonicalJobId(db, cluster, claimedCanonicalJobIds);
    const companyId = resolveCanonicalCompanyId(cluster, companyIdsByNormalizedName);
    const canonicalPayload = buildCanonicalJobPayload(cluster, companyId);

    let canonicalJobId = preferredCanonicalJobId;

    if (!canonicalJobId) {
      canonicalJobId = randomUUID();
      canonicalJobCreates.push({
        canonicalJobId,
        payload: canonicalPayload,
      });
    } else {
      canonicalJobUpdates.push({
        canonicalJobId,
        payload: canonicalPayload,
      });
    }

    claimedCanonicalJobIds.add(canonicalJobId);

    const clusterObsoleteCanonicalJobIds = uniqueValues(
      cluster.members.flatMap((member) => member.listing.existingCanonicalJobIds),
    ).filter((candidateId) => candidateId !== canonicalJobId);
    clusterObsoleteCanonicalJobIds.forEach((candidateId) => obsoleteCanonicalJobIds.add(candidateId));
    canonicalJobSourcePayloads.push(
      ...cluster.members.map((member) => buildCanonicalJobSourcePayload(canonicalJobId, cluster, member)),
    );
  }

  if (useSingleConnectionSafeWrites) {
    for (const { canonicalJobId, payload } of canonicalJobCreates) {
      await db.canonicalJob.create({
        data: {
          id: canonicalJobId,
          ...payload,
        },
      });
    }
  } else {
    for (const chunk of chunkValues(canonicalJobCreates, CANONICAL_JOB_CREATE_CHUNK_SIZE)) {
      await db.canonicalJob.createMany({
        data: chunk.map(({ canonicalJobId, payload }) => ({
          id: canonicalJobId,
          ...payload,
        })),
      });
    }
  }

  for (const { canonicalJobId, payload } of canonicalJobUpdates) {
    await db.canonicalJob.update({
      where: {
        id: canonicalJobId,
      },
      data: payload,
    });
  }

  await db.canonicalJobSource.deleteMany({
    where: {
      rawJobListingId: {
        in: activeRawJobListingIds,
      },
    },
  });

  if (useSingleConnectionSafeWrites) {
    for (const payload of canonicalJobSourcePayloads) {
      await db.canonicalJobSource.create({
        data: payload,
      });
    }
  } else {
    for (const chunk of chunkValues(canonicalJobSourcePayloads, CANONICAL_LINK_CREATE_CHUNK_SIZE)) {
      await db.canonicalJobSource.createMany({
        data: chunk,
        skipDuplicates: false,
      });
    }
  }

  if (obsoleteCanonicalJobIds.size > 0) {
    await db.canonicalJob.deleteMany({
      where: {
        id: {
          in: [...obsoleteCanonicalJobIds],
        },
        sources: {
          none: {},
        },
        savedJobs: {
          none: {},
        },
      },
    });
  }

  return {
    createdCanonicalJobCount: canonicalJobCreates.length,
    updatedCanonicalJobCount: canonicalJobUpdates.length,
    linkedSourceCount: canonicalJobSourcePayloads.length,
  };
}

function mapRawListingToCanonicalizationListing(row: RawListingRecord): CanonicalizationListing {
  const payload = readNormalizedPayload(row.payloadJson);
  const officialSourceUrl = normalizeUrlForMatching(payload.canonicalHints.officialSourceUrl ?? row.url);

  return {
    rawJobListingId: row.id,
    sourceId: row.sourceId,
    sourceType: row.source.sourceType,
    sourceName: row.source.sourceName,
    sourceTrustLevel: row.source.trustLevel,
    sourceBaseUrl: row.source.baseUrl,
    externalJobId: row.externalJobId,
    url: row.url,
    title: row.titleRaw,
    companyName: row.companyNameRaw,
    location: payload.location ?? row.locationRaw,
    remoteType: payload.remoteType ?? parseRemoteType(row.remoteTypeRaw),
    employmentType: payload.employmentType ?? parseEmploymentType(row.employmentTypeRaw),
    salary: payload.salary,
    descriptionRaw: row.descriptionRaw,
    firstSeenAt: row.firstSeenAt,
    lastSeenAt: row.lastSeenAt,
    isActive: row.isActive,
    parseConfidence: row.parseConfidence ?? 0,
    contentHash: row.contentHash,
    officialSourceUrl,
    requisitionId: payload.canonicalHints.requisitionId,
    internalJobId: payload.canonicalHints.internalJobId,
    departmentNames: payload.canonicalHints.departmentNames,
    officeNames: payload.canonicalHints.officeNames,
    existingCanonicalJobIds: uniqueValues(row.canonicalLinks.map((link) => link.canonicalJobId)),
    normalized: {
      companyName: normalizeCompanyName(row.companyNameRaw),
      title: normalizeJobTitle(row.titleRaw),
      location: normalizeLocation(payload.location ?? row.locationRaw),
      officialSourceUrl,
    },
  };
}

function createCluster(listing: CanonicalizationListing): CanonicalCluster {
  return {
    members: [
      {
        listing,
        rationale: {
          rule: "seed",
          confidence: 1,
          titleSimilarity: 1,
          locationSimilarity: 1,
          remoteCompatibility: 1,
          employmentCompatibility: 1,
          matchedOn: ["cluster_seed"],
        },
        canonicalSourceRank: 0,
      },
    ],
    canonicalSourceListingId: listing.rawJobListingId,
    clusterConfidence: 1,
  };
}

function addListingToCluster(
  cluster: CanonicalCluster,
  listing: CanonicalizationListing,
  rationale: MergeRationale = buildHardMatchRationale(cluster, listing),
): void {
  cluster.members.push({
    listing,
    rationale,
    canonicalSourceRank: 0,
  });
}

function finalizeCluster(cluster: CanonicalCluster): CanonicalCluster {
  const orderedMembers = [...cluster.members].sort((left, right) => {
    return scoreCanonicalSourceCandidate(right.listing) - scoreCanonicalSourceCandidate(left.listing);
  });

  orderedMembers.forEach((member, index) => {
    member.canonicalSourceRank = index + 1;
  });

  const canonicalSource = orderedMembers[0];
  const confidences = orderedMembers.map((member) => member.rationale.confidence);

  return {
    members: orderedMembers,
    canonicalSourceListingId: canonicalSource?.listing.rawJobListingId ?? cluster.canonicalSourceListingId,
    clusterConfidence: confidences.length
      ? Number((confidences.reduce((sum, confidence) => sum + confidence, 0) / confidences.length).toFixed(2))
      : 0,
  };
}

function buildHardMatchRationale(cluster: CanonicalCluster, listing: CanonicalizationListing): MergeRationale {
  const canonicalSource = cluster.members[0]?.listing;

  if (!canonicalSource) {
    return {
      rule: "seed",
      confidence: 1,
      titleSimilarity: 1,
      locationSimilarity: 1,
      remoteCompatibility: 1,
      employmentCompatibility: 1,
      matchedOn: ["cluster_seed"],
    };
  }

  if (
    canonicalSource.normalized.officialSourceUrl &&
    listing.normalized.officialSourceUrl &&
    canonicalSource.normalized.officialSourceUrl === listing.normalized.officialSourceUrl
  ) {
    return {
      rule: "official_source_url",
      confidence: 0.99,
      titleSimilarity: calculateTitleSimilarity(canonicalSource, listing),
      locationSimilarity: calculateLocationSimilarity(canonicalSource, listing),
      remoteCompatibility: calculateRemoteCompatibility(canonicalSource, listing),
      employmentCompatibility: calculateEmploymentCompatibility(canonicalSource, listing),
      matchedOn: ["official_source_url"],
    };
  }

  if (
    isUsableRequisitionId(canonicalSource.requisitionId) &&
    isUsableRequisitionId(listing.requisitionId) &&
    canonicalSource.requisitionId === listing.requisitionId
  ) {
    return {
      rule: "requisition_id",
      confidence: 0.97,
      titleSimilarity: calculateTitleSimilarity(canonicalSource, listing),
      locationSimilarity: calculateLocationSimilarity(canonicalSource, listing),
      remoteCompatibility: calculateRemoteCompatibility(canonicalSource, listing),
      employmentCompatibility: calculateEmploymentCompatibility(canonicalSource, listing),
      matchedOn: ["requisition_id"],
    };
  }

  return {
    rule: "internal_job_id",
    confidence: 0.95,
    titleSimilarity: calculateTitleSimilarity(canonicalSource, listing),
    locationSimilarity: calculateLocationSimilarity(canonicalSource, listing),
    remoteCompatibility: calculateRemoteCompatibility(canonicalSource, listing),
    employmentCompatibility: calculateEmploymentCompatibility(canonicalSource, listing),
    matchedOn: ["internal_job_id"],
  };
}

function findBestFuzzyCluster(
  clusters: CanonicalCluster[],
  listing: CanonicalizationListing,
): {
  clusterIndex: number;
  rationale: MergeRationale;
} | null {
  let bestMatch:
    | {
        clusterIndex: number;
        rationale: MergeRationale;
      }
    | null = null;

  for (const [clusterIndex, cluster] of clusters.entries()) {
    const representative = cluster.members[0]?.listing;

    if (!representative || representative.normalized.companyName !== listing.normalized.companyName) {
      continue;
    }

    const titleSimilarity = calculateTitleSimilarity(representative, listing);
    const locationSimilarity = calculateLocationSimilarity(representative, listing);
    const remoteCompatibility = calculateRemoteCompatibility(representative, listing);
    const employmentCompatibility = calculateEmploymentCompatibility(representative, listing);

    if (hasProtectedTitleQualifierMismatch(representative.title, listing.title)) {
      continue;
    }

    if (
      titleSimilarity === 1 &&
      locationSimilarity === 0 &&
      representative.normalized.location &&
      listing.normalized.location
    ) {
      continue;
    }

    const confidence =
      titleSimilarity * 0.72 +
      locationSimilarity * 0.14 +
      remoteCompatibility * 0.08 +
      employmentCompatibility * 0.06;

    if (titleSimilarity < FUZZY_TITLE_THRESHOLD || confidence < FUZZY_MATCH_THRESHOLD) {
      continue;
    }

    const rationale: MergeRationale = {
      rule: "fuzzy_title_location",
      confidence: Number(confidence.toFixed(2)),
      titleSimilarity: Number(titleSimilarity.toFixed(2)),
      locationSimilarity: Number(locationSimilarity.toFixed(2)),
      remoteCompatibility: Number(remoteCompatibility.toFixed(2)),
      employmentCompatibility: Number(employmentCompatibility.toFixed(2)),
      matchedOn: ["normalized_company_name", "title_similarity", "location_or_remote_compatibility"],
    };

    if (!bestMatch || rationale.confidence > bestMatch.rationale.confidence) {
      bestMatch = {
        clusterIndex,
        rationale,
      };
    }
  }

  return bestMatch;
}

function buildCanonicalJobPayload(cluster: CanonicalCluster, companyId: string | null) {
  const canonicalSource = cluster.members.find((member) => {
    return member.listing.rawJobListingId === cluster.canonicalSourceListingId;
  })?.listing ?? cluster.members[0]?.listing;

  const title = canonicalSource?.title.trim() || cluster.members[0]?.listing.title.trim() || "Unknown role";
  const location = mostCommonValue(cluster.members.map((member) => member.listing.location)) ?? canonicalSource?.location ?? null;
  const remoteType =
    mostCommonEnumValue(cluster.members.map((member) => member.listing.remoteType)) ??
    canonicalSource?.remoteType ??
    RemoteType.UNKNOWN;
  const employmentType =
    mostCommonEnumValue(cluster.members.map((member) => member.listing.employmentType)) ??
    canonicalSource?.employmentType ??
    EmploymentType.UNKNOWN;
  const firstSeenAt = minDate(cluster.members.map((member) => member.listing.firstSeenAt));
  const lastSeenAt = maxDate(cluster.members.map((member) => member.listing.lastSeenAt));
  const descriptionText = stripHtml(canonicalSource?.descriptionRaw ?? "").trim() || null;
  const searchSummary = descriptionText ? buildSearchSummary(descriptionText) : null;
  const officialSourceUrl = canonicalSource?.officialSourceUrl ?? normalizeUrlForMatching(canonicalSource?.url ?? null);
  const officialSourceMethod = officialSourceUrl
    ? canonicalSource?.sourceType === SourceType.COMPANY_CAREERS
      ? "company_careers_source"
      : "source_canonical_hint"
    : null;
  const officialSourceEvidenceJson = officialSourceUrl
    ? {
        canonicalSourceType: canonicalSource?.sourceType ?? "UNKNOWN",
        canonicalSourceUrl: canonicalSource?.url ?? null,
        sourceName: canonicalSource?.sourceName ?? null,
      }
    : null;

  return {
    canonicalTitle: title,
    canonicalCompanyId: companyId,
    canonicalLocation: location,
    remoteType,
    employmentType,
    salaryCurrency: canonicalSource?.salary?.currency ?? null,
    salaryMin: canonicalSource?.salary?.min ?? null,
    salaryMax: canonicalSource?.salary?.max ?? null,
    descriptionText,
    searchSummary,
    officialSourceUrl,
    officialSourceConfidence: Number((cluster.clusterConfidence * sourceConfidenceMultiplier(canonicalSource?.sourceType)).toFixed(2)),
    officialSourceMethod,
    officialSourceEvidenceJson: officialSourceEvidenceJson ?? Prisma.DbNull,
    firstSeenAt,
    lastSeenAt,
    repostCount: 0,
    currentStatus: cluster.members.some((member) => member.listing.isActive)
      ? CanonicalJobStatus.ACTIVE
      : CanonicalJobStatus.INACTIVE,
  };
}

function buildCanonicalJobSourcePayload(
  canonicalJobId: string,
  cluster: CanonicalCluster,
  member: CanonicalClusterMember,
) {
  return {
    canonicalJobId,
    rawJobListingId: member.listing.rawJobListingId,
    linkConfidence: member.rationale.confidence,
    precedenceRank: member.canonicalSourceRank,
    isCanonicalSource: member.listing.rawJobListingId === cluster.canonicalSourceListingId,
    mergeRationaleJson: {
      ...member.rationale,
      clusterConfidence: cluster.clusterConfidence,
      canonicalSourceScore: scoreCanonicalSourceCandidate(member.listing),
      normalized: member.listing.normalized,
    },
  };
}

async function resolvePreferredCanonicalJobId(
  db: PrismaClient,
  cluster: CanonicalCluster,
  claimedCanonicalJobIds: Set<string>,
): Promise<string | null> {
  const candidateIds = filterReusableCanonicalJobIds(
    uniqueValues(cluster.members.flatMap((member) => member.listing.existingCanonicalJobIds)),
    claimedCanonicalJobIds,
  );

  if (candidateIds.length === 0) {
    return null;
  }

  if (candidateIds.length === 1) {
    return candidateIds[0] ?? null;
  }

  const jobs = await db.canonicalJob.findMany({
    where: {
      id: {
        in: candidateIds,
      },
    },
    include: {
      sources: {
        select: {
          id: true,
        },
      },
      savedJobs: {
        select: {
          id: true,
        },
      },
    },
  });

  const sorted = [...jobs].sort((left, right) => {
    const savedJobDelta = right.savedJobs.length - left.savedJobs.length;

    if (savedJobDelta !== 0) {
      return savedJobDelta;
    }

    const sourceDelta = right.sources.length - left.sources.length;

    if (sourceDelta !== 0) {
      return sourceDelta;
    }

    return left.createdAt.getTime() - right.createdAt.getTime();
  });

  return sorted[0]?.id ?? candidateIds[0] ?? null;
}

export function filterReusableCanonicalJobIds(candidateIds: string[], claimedCanonicalJobIds: Set<string>): string[] {
  return candidateIds.filter((candidateId) => !claimedCanonicalJobIds.has(candidateId));
}

export function shouldBatchLocalSingleConnectionCanonicalize(
  databaseUrl: string | undefined,
  activeListingCount: number,
): boolean {
  if (!isLocalSingleConnectionDatabaseUrl(databaseUrl) || activeListingCount <= LOCAL_PGLITE_CANONICALIZE_LISTING_LIMIT) {
    return false;
  }

  return true;
}

async function persistCanonicalizationBatches(
  db: PrismaClient,
  listingBatches: CanonicalizationListing[][],
): Promise<Omit<CanonicalizationRunSummary, "scannedListingCount">> {
  let clusterCount = 0;
  let createdCanonicalJobCount = 0;
  let updatedCanonicalJobCount = 0;
  let linkedSourceCount = 0;

  for (const listingBatch of listingBatches) {
    const clusters = buildCanonicalClusters(listingBatch);
    const batchSummary = await persistCanonicalClusters(db, clusters);
    clusterCount += clusters.length;
    createdCanonicalJobCount += batchSummary.createdCanonicalJobCount;
    updatedCanonicalJobCount += batchSummary.updatedCanonicalJobCount;
    linkedSourceCount += batchSummary.linkedSourceCount;
  }

  return {
    clusterCount,
    createdCanonicalJobCount,
    updatedCanonicalJobCount,
    linkedSourceCount,
  };
}

function isLocalSingleConnectionDatabaseUrl(databaseUrl: string | undefined): boolean {
  if (!databaseUrl) {
    return false;
  }

  try {
    const parsed = new URL(databaseUrl);
    return parsed.searchParams.get("connection_limit") === "1";
  } catch {
    return false;
  }
}

async function prepareCanonicalCompanies(
  db: PrismaClient,
  clusters: CanonicalCluster[],
): Promise<Map<string, string>> {
  const companySeeds = new Map<
    string,
    {
      displayName: string;
      careersUrl: string | null;
      sourceNames: Set<string>;
      observedCompanyNames: Set<string>;
    }
  >();

  for (const cluster of clusters) {
    const companyNames = uniqueValues(cluster.members.map((member) => member.listing.companyName.trim()).filter(Boolean));
    const primaryCompanyName = companyNames[0];

    if (!primaryCompanyName) {
      continue;
    }

    const normalizedName = normalizeCompanyName(primaryCompanyName);
    const canonicalSource = cluster.members.find((member) => {
      return member.listing.rawJobListingId === cluster.canonicalSourceListingId;
    })?.listing;
    const careersUrl = canonicalSource?.sourceType === SourceType.COMPANY_CAREERS
      ? normalizeUrlForMatching(canonicalSource.url)
      : null;
    const existing = companySeeds.get(normalizedName);

    if (existing) {
      if (!existing.careersUrl && careersUrl) {
        existing.careersUrl = careersUrl;
      }

      companyNames.forEach((companyName) => existing.observedCompanyNames.add(companyName));
      cluster.members.forEach((member) => existing.sourceNames.add(member.listing.sourceName));
      continue;
    }

    companySeeds.set(normalizedName, {
      displayName: primaryCompanyName,
      careersUrl,
      sourceNames: new Set(cluster.members.map((member) => member.listing.sourceName)),
      observedCompanyNames: new Set(companyNames),
    });
  }

  const companyIdsByNormalizedName = new Map<string, string>();

  for (const [normalizedName, seed] of companySeeds.entries()) {
    const company = await db.company.upsert({
      where: {
        normalizedName,
      },
      create: {
        displayName: seed.displayName,
        normalizedName,
        careersUrl: seed.careersUrl,
        careersUrlConfidence: seed.careersUrl ? 0.94 : null,
        primaryDomainConfidence: null,
        enrichmentEvidenceJson: seed.careersUrl
          ? {
              source: "canonicalization_company_careers_source",
              careersUrl: seed.careersUrl,
            }
          : undefined,
        metadataJson: {
          sourceNames: [...seed.sourceNames].sort(),
          observedCompanyNames: [...seed.observedCompanyNames].sort(),
        },
      },
      update: {
        displayName: seed.displayName,
        careersUrl: seed.careersUrl ?? undefined,
        careersUrlConfidence: seed.careersUrl ? 0.94 : undefined,
        enrichmentEvidenceJson: seed.careersUrl
          ? {
              source: "canonicalization_company_careers_source",
              careersUrl: seed.careersUrl,
            }
          : undefined,
        metadataJson: {
          sourceNames: [...seed.sourceNames].sort(),
          observedCompanyNames: [...seed.observedCompanyNames].sort(),
        },
      },
    });

    companyIdsByNormalizedName.set(normalizedName, company.id);
  }

  return companyIdsByNormalizedName;
}

function resolveCanonicalCompanyId(
  cluster: CanonicalCluster,
  companyIdsByNormalizedName: Map<string, string>,
): string | null {
  const primaryCompanyName = cluster.members
    .map((member) => member.listing.companyName.trim())
    .find(Boolean);

  if (!primaryCompanyName) {
    return null;
  }

  return companyIdsByNormalizedName.get(normalizeCompanyName(primaryCompanyName)) ?? null;
}

function scoreCanonicalSourceCandidate(listing: CanonicalizationListing): number {
  return (
    sourceTypePriority(listing.sourceType) +
    sourceTrustPriority(listing.sourceTrustLevel) +
    (listing.officialSourceUrl ? 8 : 0) +
    (listing.parseConfidence * 10) +
    (listing.descriptionRaw.trim() ? 3 : 0) +
    (listing.isActive ? 2 : 0)
  );
}

function sourceTypePriority(sourceType: SourceType): number {
  switch (sourceType) {
    case SourceType.COMPANY_CAREERS:
      return 100;
    case SourceType.GREENHOUSE:
    case SourceType.LEVER:
    case SourceType.ASHBY:
      return 90;
    case SourceType.STRUCTURED_PAGE:
      return 75;
    case SourceType.SUPPLEMENTAL:
      return 40;
  }
}

function sourceTrustPriority(trustLevel: SourceTrustLevel): number {
  switch (trustLevel) {
    case SourceTrustLevel.HIGH:
      return 20;
    case SourceTrustLevel.MEDIUM:
      return 10;
    case SourceTrustLevel.LOW:
      return 0;
  }
}

function sourceConfidenceMultiplier(sourceType: SourceType | undefined): number {
  switch (sourceType) {
    case SourceType.COMPANY_CAREERS:
      return 0.98;
    case SourceType.GREENHOUSE:
    case SourceType.LEVER:
    case SourceType.ASHBY:
      return 0.94;
    case SourceType.STRUCTURED_PAGE:
      return 0.82;
    case SourceType.SUPPLEMENTAL:
      return 0.58;
    default:
      return 0.5;
  }
}

function calculateTitleSimilarity(left: CanonicalizationListing, right: CanonicalizationListing): number {
  if (left.normalized.title === right.normalized.title) {
    return 1;
  }

  const leftTokens = tokenize(left.normalized.title);
  const rightTokens = tokenize(right.normalized.title);

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;

  return intersection / union;
}

function calculateLocationSimilarity(left: CanonicalizationListing, right: CanonicalizationListing): number {
  if (left.normalized.location && right.normalized.location) {
    if (left.normalized.location === right.normalized.location) {
      return 1;
    }

    if (
      left.normalized.location.includes(right.normalized.location) ||
      right.normalized.location.includes(left.normalized.location)
    ) {
      return 0.85;
    }

    return 0;
  }

  if (!left.normalized.location && !right.normalized.location) {
    return 0.75;
  }

  if (left.remoteType === RemoteType.REMOTE && right.remoteType === RemoteType.REMOTE) {
    return 0.7;
  }

  return 0.45;
}

function calculateRemoteCompatibility(left: CanonicalizationListing, right: CanonicalizationListing): number {
  if (left.remoteType === right.remoteType) {
    return 1;
  }

  if (left.remoteType === RemoteType.UNKNOWN || right.remoteType === RemoteType.UNKNOWN) {
    return 0.75;
  }

  if (
    (left.remoteType === RemoteType.REMOTE && right.remoteType === RemoteType.HYBRID) ||
    (left.remoteType === RemoteType.HYBRID && right.remoteType === RemoteType.REMOTE)
  ) {
    return 0.6;
  }

  return 0;
}

function calculateEmploymentCompatibility(left: CanonicalizationListing, right: CanonicalizationListing): number {
  if (left.employmentType === right.employmentType) {
    return 1;
  }

  if (left.employmentType === EmploymentType.UNKNOWN || right.employmentType === EmploymentType.UNKNOWN) {
    return 0.75;
  }

  return 0;
}

function buildOfficialUrlKey(listing: CanonicalizationListing): string | null {
  return listing.normalized.officialSourceUrl
    ? `${listing.normalized.companyName}::${listing.normalized.officialSourceUrl}`
    : null;
}

function buildRequisitionKey(listing: CanonicalizationListing): string | null {
  const requisitionId = listing.requisitionId;
  return isUsableRequisitionId(requisitionId) ? `${listing.normalized.companyName}::${requisitionId}` : null;
}

function buildInternalJobKey(listing: CanonicalizationListing): string | null {
  return listing.internalJobId !== null
    ? `${listing.sourceType}::${listing.normalized.companyName}::${listing.internalJobId}::${listing.normalized.title}`
    : null;
}

function hasProtectedTitleQualifierMismatch(leftTitle: string, rightTitle: string): boolean {
  const leftQualifiers = readProtectedTitleQualifiers(leftTitle);
  const rightQualifiers = readProtectedTitleQualifiers(rightTitle);

  if (leftQualifiers.hasIntern !== rightQualifiers.hasIntern) {
    return true;
  }

  if (leftQualifiers.hasAi !== rightQualifiers.hasAi) {
    return true;
  }

  if (leftQualifiers.seniority !== rightQualifiers.seniority) {
    return leftQualifiers.seniority !== null || rightQualifiers.seniority !== null;
  }

  if (!setsEqual(leftQualifiers.segmentQualifiers, rightQualifiers.segmentQualifiers)) {
    return true;
  }

  if (
    leftQualifiers.acronymQualifiers.size > 0 &&
    rightQualifiers.acronymQualifiers.size > 0 &&
    !setsEqual(leftQualifiers.acronymQualifiers, rightQualifiers.acronymQualifiers)
  ) {
    return true;
  }

  return leftQualifiers.experienceBand !== null &&
    rightQualifiers.experienceBand !== null &&
    leftQualifiers.experienceBand !== rightQualifiers.experienceBand;
}

function readProtectedTitleQualifiers(title: string): {
  hasIntern: boolean;
  hasAi: boolean;
  seniority: string | null;
  experienceBand: string | null;
  segmentQualifiers: Set<string>;
  acronymQualifiers: Set<string>;
} {
  const normalized = title.toLowerCase();
  const experienceBandMatch = normalized.match(/\b(\d+\s*(?:-\s*\d+|\+)\s*yoe)\b/);
  const seniorityMatch = normalized.match(/\b(junior|senior|staff|principal|lead|sr|jr)\b/)?.[1] ?? null;
  const seniority = seniorityMatch === "sr" ? "senior" : seniorityMatch === "jr" ? "junior" : seniorityMatch;
  const segmentQualifiers = new Set(
    ["commercial", "enterprise", "strategic", "partner", "federal", "public sector", "smb", "mid-market", "mid market"]
      .filter((qualifier) => normalized.includes(qualifier)),
  );
  const acronymQualifiers = new Set(
    (title.match(/\b[A-Z]+(?:[\/&][A-Z]+)*\b/g) ?? [])
      .map((token) => token.toLowerCase())
      .filter((token) => token !== "sr" && token !== "jr"),
  );

  return {
    hasIntern: /\bintern(ship)?\b/.test(normalized),
    hasAi: /\bai\b/.test(normalized),
    seniority,
    experienceBand: experienceBandMatch?.[1]?.replace(/\s+/g, " ").trim() ?? null,
    segmentQualifiers,
    acronymQualifiers,
  };
}

function isUsableRequisitionId(value: string | null): value is string {
  return Boolean(value?.trim()) && /\d/.test(value ?? "");
}

function indexClusterKeys(
  cluster: CanonicalCluster,
  clusterIndex: number,
  officialUrlIndex: Map<string, number>,
  requisitionIndex: Map<string, number>,
  internalJobIndex: Map<string, number>,
): void {
  for (const member of cluster.members) {
    const officialUrlKey = buildOfficialUrlKey(member.listing);
    const requisitionKey = buildRequisitionKey(member.listing);
    const internalJobKey = buildInternalJobKey(member.listing);

    if (officialUrlKey) {
      officialUrlIndex.set(officialUrlKey, clusterIndex);
    }

    if (requisitionKey) {
      requisitionIndex.set(requisitionKey, clusterIndex);
    }

    if (internalJobKey) {
      internalJobIndex.set(internalJobKey, clusterIndex);
    }
  }
}

function findIndexedCluster(index: Map<string, number>, key: string | null): number | null {
  if (!key) {
    return null;
  }

  return index.get(key) ?? null;
}

function tokenize(value: string): Set<string> {
  return new Set(
    value
      .split(" ")
      .map((token) => token.trim())
      .filter((token) => token.length > 1),
  );
}

function buildSearchSummary(descriptionText: string): string {
  const summary = descriptionText.replace(/\s+/g, " ").trim();
  return summary.length > 220 ? `${summary.slice(0, 217).trim()}...` : summary;
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

function minDate(values: Date[]): Date {
  return new Date(Math.min(...values.map((value) => value.getTime())));
}

function maxDate(values: Date[]): Date {
  return new Date(Math.max(...values.map((value) => value.getTime())));
}

function mostCommonValue(values: Array<string | null | undefined>): string | null {
  const counts = new Map<string, number>();

  for (const value of values) {
    if (!value) {
      continue;
    }

    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
}

function mostCommonEnumValue<TValue extends string>(values: TValue[]): TValue | null {
  const counts = new Map<TValue, number>();

  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
}

function uniqueValues<TValue>(values: TValue[]): TValue[] {
  return [...new Set(values)];
}

function setsEqual<TValue>(left: Set<TValue>, right: Set<TValue>): boolean {
  if (left.size !== right.size) {
    return false;
  }

  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }

  return true;
}

function chunkValues<TValue>(values: TValue[], chunkSize: number): TValue[][] {
  if (values.length === 0) {
    return [];
  }

  const chunks: TValue[][] = [];

  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }

  return chunks;
}

function parseRemoteType(value: string | null): RemoteType {
  switch (value) {
    case RemoteType.REMOTE:
      return RemoteType.REMOTE;
    case RemoteType.HYBRID:
      return RemoteType.HYBRID;
    case RemoteType.ONSITE:
      return RemoteType.ONSITE;
    default:
      return RemoteType.UNKNOWN;
  }
}

function parseEmploymentType(value: string | null): EmploymentType {
  switch (value) {
    case EmploymentType.FULL_TIME:
      return EmploymentType.FULL_TIME;
    case EmploymentType.PART_TIME:
      return EmploymentType.PART_TIME;
    case EmploymentType.CONTRACT:
      return EmploymentType.CONTRACT;
    case EmploymentType.TEMPORARY:
      return EmploymentType.TEMPORARY;
    case EmploymentType.INTERN:
      return EmploymentType.INTERN;
    case EmploymentType.FREELANCE:
      return EmploymentType.FREELANCE;
    default:
      return EmploymentType.UNKNOWN;
  }
}

function readNormalizedPayload(payload: Prisma.JsonValue): {
  location: string | null;
  remoteType: RemoteType | null;
  employmentType: EmploymentType | null;
  salary: CanonicalizationSalary | null;
  canonicalHints: {
    officialSourceUrl: string | null;
    requisitionId: string | null;
    internalJobId: number | null;
    departmentNames: string[];
    officeNames: string[];
  };
} {
  const normalized = isRecord(payload) && isRecord(payload.normalized) ? payload.normalized : null;
  const canonicalHints = normalized && isRecord(normalized.canonicalHints) ? normalized.canonicalHints : null;
  const salary = normalized && isRecord(normalized.salary) ? normalized.salary : null;

  return {
    location: readNullableString(normalized?.location),
    remoteType: readEnumValue(readNullableString(normalized?.remoteType), RemoteType),
    employmentType: readEnumValue(readNullableString(normalized?.employmentType), EmploymentType),
    salary: salary
      ? {
          currency: readNullableString(salary.currency),
          min: readNullableNumber(salary.min),
          max: readNullableNumber(salary.max),
          interval: readSalaryInterval(salary.interval),
        }
      : null,
    canonicalHints: {
      officialSourceUrl: readNullableString(canonicalHints?.officialSourceUrl),
      requisitionId: readNullableString(canonicalHints?.requisitionId),
      internalJobId: readNullableNumber(canonicalHints?.internalJobId),
      departmentNames: readStringArray(canonicalHints?.departmentNames),
      officeNames: readStringArray(canonicalHints?.officeNames),
    },
  };
}

function readSalaryInterval(value: unknown): CanonicalizationSalary["interval"] {
  switch (value) {
    case "YEAR":
    case "HOUR":
    case "UNKNOWN":
      return value;
    default:
      return "UNKNOWN";
  }
}

function readEnumValue<TEnum extends Record<string, string>>(
  value: string | null,
  enumObject: TEnum,
): TEnum[keyof TEnum] | null {
  if (!value) {
    return null;
  }

  return Object.values(enumObject).includes(value) ? (value as TEnum[keyof TEnum]) : null;
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
