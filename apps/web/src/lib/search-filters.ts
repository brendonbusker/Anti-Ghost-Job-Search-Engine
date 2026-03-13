import {
  jobSearchFiltersSchema,
  type JobSearchFilters,
} from "@anti-ghost/domain";

const priorityLabels: Record<NonNullable<JobSearchFilters["priorityLabel"]>, string> = {
  APPLY_NOW: "Apply now",
  APPLY_SOON: "Apply soon",
  LOW_PRIORITY: "Low priority",
  AVOID_FOR_NOW: "Avoid for now",
};

const freshnessLabels: Record<NonNullable<JobSearchFilters["freshnessLabel"]>, string> = {
  NEW: "New",
  FRESH: "Fresh",
  AGING: "Aging",
  POSSIBLY_STALE: "Possibly stale",
  LIKELY_STALE: "Likely stale",
  REPOSTED_REPEATEDLY: "Reposted repeatedly",
};

const trustLabels: Record<NonNullable<JobSearchFilters["trustLabel"]>, string> = {
  HIGH_CONFIDENCE_REAL: "High confidence real",
  MEDIUM_CONFIDENCE: "Medium confidence",
  UNVERIFIED_SOURCE: "Unverified source",
  SUSPICIOUS_LOW_CONFIDENCE: "Suspicious / low confidence",
};

const officialRouteLabels: Record<NonNullable<JobSearchFilters["officialSourceStatus"]>, string> = {
  FOUND: "Official source found",
  ATS_ONLY: "Trusted ATS only",
  MISSING: "Official source missing",
};

export function buildSearchHrefFromFilters(filters: JobSearchFilters) {
  const params = new URLSearchParams();

  if (filters.q) {
    params.set("q", filters.q);
  }

  if (filters.company) {
    params.set("company", filters.company);
  }

  if (filters.location) {
    params.set("location", filters.location);
  }

  if (filters.remoteType) {
    params.set("remoteType", filters.remoteType);
  }

  if (filters.trustLabel) {
    params.set("trustLabel", filters.trustLabel);
  }

  if (filters.freshnessLabel) {
    params.set("freshnessLabel", filters.freshnessLabel);
  }

  if (filters.priorityLabel) {
    params.set("priorityLabel", filters.priorityLabel);
  }

  if (filters.officialSourceStatus) {
    params.set("officialSourceStatus", filters.officialSourceStatus);
  }

  if (filters.officialSourceOnly) {
    params.set("officialSourceOnly", "true");
  }

  if (filters.salaryMin !== undefined) {
    params.set("salaryMin", String(filters.salaryMin));
  }

  if (filters.sort && filters.sort !== "priority") {
    params.set("sort", filters.sort);
  }

  const query = params.toString();
  return query.length > 0 ? `/?${query}` : "/";
}

export function parseStoredSearchFilters(value: unknown): JobSearchFilters {
  const parsed = jobSearchFiltersSchema.safeParse(value);

  if (parsed.success) {
    return parsed.data;
  }

  return jobSearchFiltersSchema.parse({});
}

export function summarizeSearchFilters(filters: JobSearchFilters): string[] {
  const summary: string[] = [];

  if (filters.q) {
    summary.push(`Query: ${filters.q}`);
  }

  if (filters.company) {
    summary.push(`Company: ${filters.company}`);
  }

  if (filters.location) {
    summary.push(`Location: ${filters.location}`);
  }

  if (filters.remoteType) {
    summary.push(`Setup: ${filters.remoteType.toLowerCase()}`);
  }

  if (filters.trustLabel) {
    summary.push(`Trust: ${trustLabels[filters.trustLabel]}`);
  }

  if (filters.freshnessLabel) {
    summary.push(`Freshness: ${freshnessLabels[filters.freshnessLabel]}`);
  }

  if (filters.priorityLabel) {
    summary.push(`Priority: ${priorityLabels[filters.priorityLabel]}`);
  }

  if (filters.officialSourceStatus) {
    summary.push(`Route: ${officialRouteLabels[filters.officialSourceStatus]}`);
  }

  if (filters.officialSourceOnly) {
    summary.push("Official routes only");
  }

  if (filters.salaryMin !== undefined) {
    summary.push(`Salary: $${Math.round(filters.salaryMin / 1000)}k+`);
  }

  if (filters.sort !== "priority") {
    summary.push(`Sort: ${filters.sort}`);
  }

  return summary;
}

export function buildSavedSearchName(filters: JobSearchFilters) {
  if (filters.q) {
    return `Search: ${filters.q}`;
  }

  if (filters.company) {
    return `${filters.company} roles`;
  }

  if (filters.location) {
    return `${filters.location} jobs`;
  }

  if (filters.priorityLabel) {
    return `${priorityLabels[filters.priorityLabel]} jobs`;
  }

  return "Saved search";
}
