import type {
  EmploymentType,
  RemoteType,
  SourceTrustLevel,
  SourceType,
} from "@anti-ghost/database";

export type SourceSurfaceKind = "API_FEED" | "OFFICIAL_CAREERS" | "STRUCTURED_PAGE" | "SUPPLEMENTAL_PAGE";

export type ActivityEvidence = "ACTIVE" | "INACTIVE" | "UNKNOWN";

export type SourceDescriptor = {
  type: SourceType;
  name: string;
  baseUrl: string;
  trustLevel: SourceTrustLevel;
  metadata: Record<string, unknown>;
};

export type NormalizedCompensation = {
  currency: string | null;
  min: number | null;
  max: number | null;
  interval: "YEAR" | "HOUR" | "UNKNOWN";
};

export type NormalizedJobListing = {
  externalJobId: string | null;
  url: string;
  title: string;
  companyName: string;
  location: string | null;
  remoteType: RemoteType;
  employmentType: EmploymentType;
  salary: NormalizedCompensation | null;
  salaryRaw: string | null;
  descriptionRaw: string;
  postedAtRaw: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  isActive: boolean;
  parseConfidence: number;
  contentHash: string;
  payload: Record<string, unknown>;
  canonicalHints: {
    officialSourceUrl: string | null;
    requisitionId: string | null;
    internalJobId: number | null;
    departmentNames: string[];
    officeNames: string[];
  };
};

export type AdapterFetchResult<TPayload> = {
  observedAt: Date;
  payload: TPayload;
  retrievalState: "SUCCESS";
  sourceUrl: string;
};

export type AdapterParseResult = {
  source: SourceDescriptor;
  surfaceKind: SourceSurfaceKind;
  observedAt: Date;
  listings: NormalizedJobListing[];
};

export type AdapterPersistResult = {
  sourceId: string;
  createdCount: number;
  updatedCount: number;
  deactivatedCount: number;
};

export type EndpointCheckResult = {
  status: ActivityEvidence;
  statusCode: number | null;
};

export interface SourceAdapter<TConfig, TPayload> {
  readonly name: string;
  readonly surfaceKind: SourceSurfaceKind;
  fetch(config: TConfig): Promise<AdapterFetchResult<TPayload>>;
  parse(result: AdapterFetchResult<TPayload>): Promise<AdapterParseResult>;
  validate(result: AdapterParseResult): AdapterParseResult;
}
