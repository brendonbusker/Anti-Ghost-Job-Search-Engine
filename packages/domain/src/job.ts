import { z } from "zod";

export const remoteTypeValues = ["REMOTE", "HYBRID", "ONSITE", "UNKNOWN"] as const;
export const trustLabelValues = [
  "HIGH_CONFIDENCE_REAL",
  "MEDIUM_CONFIDENCE",
  "UNVERIFIED_SOURCE",
  "SUSPICIOUS_LOW_CONFIDENCE",
] as const;
export const freshnessLabelValues = [
  "NEW",
  "FRESH",
  "AGING",
  "POSSIBLY_STALE",
  "LIKELY_STALE",
  "REPOSTED_REPEATEDLY",
] as const;
export const priorityLabelValues = [
  "APPLY_NOW",
  "APPLY_SOON",
  "LOW_PRIORITY",
  "AVOID_FOR_NOW",
] as const;
export const officialSourceStatusValues = ["FOUND", "ATS_ONLY", "MISSING"] as const;
export const searchSortValues = ["priority", "freshness", "recent"] as const;

export type RemoteType = (typeof remoteTypeValues)[number];
export type TrustLabel = (typeof trustLabelValues)[number];
export type FreshnessLabel = (typeof freshnessLabelValues)[number];
export type PriorityLabel = (typeof priorityLabelValues)[number];
export type OfficialSourceStatus = (typeof officialSourceStatusValues)[number];
export type SearchSort = (typeof searchSortValues)[number];

export const salaryRangeSchema = z.object({
  currency: z.string().length(3),
  min: z.number().int().nullable(),
  max: z.number().int().nullable(),
  interval: z.enum(["YEAR", "HOUR"]).default("YEAR"),
});

export const jobSourceSchema = z.object({
  name: z.string(),
  kind: z.string(),
  url: z.string().url(),
});

export const savedJobStateSchema = z.object({
  savedAt: z.string(),
  note: z.string().nullable(),
});

export const jobSearchFiltersSchema = z.object({
  q: z.string().trim().optional().default(""),
  company: z.string().trim().optional().default(""),
  location: z.string().trim().optional().default(""),
  remoteType: z.enum(remoteTypeValues).optional(),
  trustLabel: z.enum(trustLabelValues).optional(),
  freshnessLabel: z.enum(freshnessLabelValues).optional(),
  priorityLabel: z.enum(priorityLabelValues).optional(),
  officialSourceStatus: z.enum(officialSourceStatusValues).optional(),
  officialSourceOnly: z.boolean().optional().default(false),
  salaryMin: z.number().int().nonnegative().optional(),
  sort: z.enum(searchSortValues).optional().default("priority"),
});

export const jobSearchResultSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  company: z.string(),
  location: z.string(),
  remoteType: z.enum(remoteTypeValues),
  salary: salaryRangeSchema.nullable(),
  officialSourceStatus: z.enum(officialSourceStatusValues),
  officialSourceUrl: z.string().url().nullable(),
  trustLabel: z.enum(trustLabelValues),
  freshnessLabel: z.enum(freshnessLabelValues),
  priorityLabel: z.enum(priorityLabelValues),
  reasonSummary: z.string(),
  trustReasons: z.array(z.string()),
  freshnessReasons: z.array(z.string()),
  priorityReasons: z.array(z.string()),
  redFlags: z.array(z.string()),
  sources: z.array(jobSourceSchema),
  firstSeenAt: z.string(),
  lastSeenAt: z.string(),
  repostCount: z.number().int().nonnegative(),
  savedJob: savedJobStateSchema.nullable(),
});

export const jobDetailSchema = jobSearchResultSchema.extend({
  overview: z.string(),
  listingHistory: z.array(z.string()),
});

export type SalaryRange = z.infer<typeof salaryRangeSchema>;
export type JobSource = z.infer<typeof jobSourceSchema>;
export type SavedJobState = z.infer<typeof savedJobStateSchema>;
export type JobSearchFilters = z.infer<typeof jobSearchFiltersSchema>;
export type JobSearchResult = z.infer<typeof jobSearchResultSchema>;
export type JobDetail = z.infer<typeof jobDetailSchema>;
