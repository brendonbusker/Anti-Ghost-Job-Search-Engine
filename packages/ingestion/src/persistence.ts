import {
  prisma,
  SourceTrustLevel,
  SourceType,
  type PrismaClient,
} from "@anti-ghost/database";

import type {
  AdapterParseResult,
  AdapterPersistResult,
  NormalizedJobListing,
  SourceDescriptor,
} from "./contracts";

type PersistOptions = {
  db?: PrismaClient;
};

const DATABASE_RETRY_ATTEMPTS = 3;
const DATABASE_RETRY_DELAY_MS = 750;

export async function persistAdapterResult(
  result: AdapterParseResult,
  options: PersistOptions = {},
): Promise<AdapterPersistResult> {
  const db = options.db ?? prisma;
  const sourceRecord = await withDatabaseRetry(() => upsertSourceDescriptor(db, result.source, result.observedAt));
  const existingListings = await withDatabaseRetry(() =>
    loadExistingRawListings(db, sourceRecord.id, result.listings),
  );
  const newListings: NormalizedJobListing[] = [];
  const updates: Array<{
    listing: NormalizedJobListing;
    existing: {
      id: string;
      firstSeenAt: Date;
    };
  }> = [];

  for (const listing of result.listings) {
    const existing = readExistingRawListing(existingListings, listing);

    if (existing) {
      updates.push({
        listing,
        existing,
      });
    } else {
      newListings.push(listing);
    }
  }

  const createdCount = await withDatabaseRetry(() => createRawListings(db, sourceRecord.id, newListings));
  const updatedCount = await withDatabaseRetry(() => updateRawListings(db, sourceRecord.id, updates));
  const deactivatedCount = await withDatabaseRetry(() =>
    deactivateMissingListings(db, sourceRecord.id, result.listings),
  );

  return {
    sourceId: sourceRecord.id,
    createdCount,
    updatedCount,
    deactivatedCount,
  };
}

async function upsertSourceDescriptor(
  db: PrismaClient,
  source: SourceDescriptor,
  observedAt: Date,
) {
  const metadataJson = {
    ...source.metadata,
    lastObservedAt: observedAt.toISOString(),
  };

  return db.source.upsert({
    where: {
      sourceType_sourceName: {
        sourceType: source.type,
        sourceName: source.name,
      },
    },
    create: {
      sourceType: source.type,
      sourceName: source.name,
      baseUrl: source.baseUrl,
      trustLevel: source.trustLevel,
      metadataJson,
    },
    update: {
      baseUrl: source.baseUrl,
      trustLevel: source.trustLevel,
      metadataJson,
    },
  });
}

async function loadExistingRawListings(
  db: PrismaClient,
  sourceId: string,
  listings: NormalizedJobListing[],
) {
  const externalIds = listings.flatMap((listing) => (listing.externalJobId ? [listing.externalJobId] : []));
  const urls = listings.map((listing) => listing.url);
  const existingRows = await db.rawJobListing.findMany({
    where: {
      sourceId,
      OR: [
        ...(externalIds.length > 0 ? [{ externalJobId: { in: externalIds } }] : []),
        ...(urls.length > 0 ? [{ url: { in: urls } }] : []),
      ],
    },
    select: {
      id: true,
      externalJobId: true,
      url: true,
      firstSeenAt: true,
    },
  });

  return {
    byExternalJobId: new Map(
      existingRows
        .filter((row) => row.externalJobId)
        .map((row) => [row.externalJobId as string, { id: row.id, firstSeenAt: row.firstSeenAt }]),
    ),
    byUrl: new Map(existingRows.map((row) => [row.url, { id: row.id, firstSeenAt: row.firstSeenAt }])),
  };
}

function readExistingRawListing(
  existingListings: {
    byExternalJobId: Map<string, { id: string; firstSeenAt: Date }>;
    byUrl: Map<string, { id: string; firstSeenAt: Date }>;
  },
  listing: NormalizedJobListing,
) {
  if (listing.externalJobId) {
    const existingByExternalId = existingListings.byExternalJobId.get(listing.externalJobId);
    if (existingByExternalId) {
      return existingByExternalId;
    }
  }

  return existingListings.byUrl.get(listing.url) ?? null;
}

async function createRawListings(
  db: PrismaClient,
  sourceId: string,
  listings: NormalizedJobListing[],
): Promise<number> {
  for (const listing of listings) {
    await db.rawJobListing.create({
      data: {
        sourceId,
        externalJobId: listing.externalJobId,
        url: listing.url,
        titleRaw: listing.title,
        companyNameRaw: listing.companyName,
        locationRaw: listing.location,
        remoteTypeRaw: listing.remoteType,
        employmentTypeRaw: listing.employmentType,
        salaryRaw: listing.salaryRaw,
        descriptionRaw: listing.descriptionRaw,
        postedAtRaw: listing.postedAtRaw,
        firstSeenAt: listing.firstSeenAt,
        lastSeenAt: listing.lastSeenAt,
        isActive: listing.isActive,
        parseConfidence: listing.parseConfidence,
        payloadJson: buildPayloadJson(listing),
        contentHash: listing.contentHash,
      },
    });
  }

  return listings.length;
}

async function updateRawListings(
  db: PrismaClient,
  sourceId: string,
  updates: Array<{
    listing: NormalizedJobListing;
    existing: {
      id: string;
      firstSeenAt: Date;
    };
  }>,
): Promise<number> {
  for (const update of updates) {
    await db.rawJobListing.update({
      where: {
        id: update.existing.id,
      },
      data: {
        sourceId,
        externalJobId: update.listing.externalJobId,
        url: update.listing.url,
        titleRaw: update.listing.title,
        companyNameRaw: update.listing.companyName,
        locationRaw: update.listing.location,
        remoteTypeRaw: update.listing.remoteType,
        employmentTypeRaw: update.listing.employmentType,
        salaryRaw: update.listing.salaryRaw,
        descriptionRaw: update.listing.descriptionRaw,
        postedAtRaw: update.listing.postedAtRaw,
        firstSeenAt: update.existing.firstSeenAt,
        lastSeenAt: update.listing.lastSeenAt,
        isActive: update.listing.isActive,
        parseConfidence: update.listing.parseConfidence,
        payloadJson: buildPayloadJson(update.listing),
        contentHash: update.listing.contentHash,
      },
    });
  }

  return updates.length;
}

async function deactivateMissingListings(
  db: PrismaClient,
  sourceId: string,
  listings: NormalizedJobListing[],
): Promise<number> {
  const externalIds = listings.flatMap((listing) => (listing.externalJobId ? [listing.externalJobId] : []));
  const urls = listings.map((listing) => listing.url);

  const activeSelectors = [];

  if (externalIds.length) {
    activeSelectors.push({ externalJobId: { in: externalIds } });
  }

  if (urls.length) {
    activeSelectors.push({ url: { in: urls } });
  }

  const whereClause =
    activeSelectors.length > 0
      ? {
          sourceId,
          isActive: true,
          NOT: {
            OR: activeSelectors,
          },
        }
      : {
          sourceId,
          isActive: true,
        };

  const result = await db.rawJobListing.updateMany({
    where: whereClause,
    data: {
      isActive: false,
    },
  });

  return result.count;
}

export function createSourceDescriptor(input: Omit<SourceDescriptor, "trustLevel" | "type"> & {
  type?: SourceType;
  trustLevel?: SourceTrustLevel;
}): SourceDescriptor {
  return {
    type: input.type ?? SourceType.STRUCTURED_PAGE,
    trustLevel: input.trustLevel ?? SourceTrustLevel.MEDIUM,
    ...input,
  };
}

function buildPayloadJson(listing: NormalizedJobListing) {
  return {
    ...listing.payload,
    normalized: {
      location: listing.location,
      remoteType: listing.remoteType,
      employmentType: listing.employmentType,
      salary: listing.salary,
      canonicalHints: listing.canonicalHints,
    },
  };
}

async function withDatabaseRetry<TValue>(runValue: () => Promise<TValue>): Promise<TValue> {
  let attempt = 0;
  let lastError: unknown = null;

  while (attempt < DATABASE_RETRY_ATTEMPTS) {
    try {
      return await runValue();
    } catch (error) {
      lastError = error;
      attempt += 1;

      if (attempt >= DATABASE_RETRY_ATTEMPTS || !isTransientDatabaseError(error)) {
        throw error;
      }

      await sleep(DATABASE_RETRY_DELAY_MS * attempt);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Unknown database retry failure.");
}

function isTransientDatabaseError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  return (
    normalized.includes("can't reach database server") ||
    normalized.includes("connection error") ||
    normalized.includes("timeout expired")
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
