-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('GREENHOUSE', 'LEVER', 'ASHBY', 'COMPANY_CAREERS', 'STRUCTURED_PAGE', 'SUPPLEMENTAL');

-- CreateEnum
CREATE TYPE "SourceTrustLevel" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "RemoteType" AS ENUM ('REMOTE', 'HYBRID', 'ONSITE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'TEMPORARY', 'INTERN', 'FREELANCE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "CanonicalJobStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ApplicationEndpointStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'UNKNOWN', 'ERROR');

-- CreateEnum
CREATE TYPE "TrustLabel" AS ENUM ('HIGH_CONFIDENCE_REAL', 'MEDIUM_CONFIDENCE', 'UNVERIFIED_SOURCE', 'SUSPICIOUS_LOW_CONFIDENCE');

-- CreateEnum
CREATE TYPE "FreshnessLabel" AS ENUM ('NEW', 'FRESH', 'AGING', 'POSSIBLY_STALE', 'LIKELY_STALE', 'REPOSTED_REPEATEDLY');

-- CreateEnum
CREATE TYPE "PriorityLabel" AS ENUM ('APPLY_NOW', 'APPLY_SOON', 'LOW_PRIORITY', 'AVOID_FOR_NOW');

-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('EMAIL', 'GOOGLE', 'GITHUB', 'OTHER');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('ACTIVE', 'PAUSED', 'DISABLED');

-- CreateEnum
CREATE TYPE "CanonicalReviewType" AS ENUM ('MERGE_QUALITY', 'OFFICIAL_SOURCE', 'SCORE_CALIBRATION', 'GENERAL_NOTE');

-- CreateEnum
CREATE TYPE "CanonicalReviewDisposition" AS ENUM ('CONFIRMED', 'INCORRECT', 'NEEDS_FOLLOW_UP');

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "primary_domain" TEXT,
    "primary_domain_confidence" DOUBLE PRECISION,
    "careers_url" TEXT,
    "careers_url_confidence" DOUBLE PRECISION,
    "enrichment_evidence_json" JSONB,
    "metadata_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sources" (
    "id" TEXT NOT NULL,
    "source_type" "SourceType" NOT NULL,
    "source_name" TEXT NOT NULL,
    "base_url" TEXT,
    "trust_level" "SourceTrustLevel" NOT NULL DEFAULT 'MEDIUM',
    "metadata_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_job_listings" (
    "id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "external_job_id" TEXT,
    "url" TEXT NOT NULL,
    "title_raw" TEXT NOT NULL,
    "company_name_raw" TEXT NOT NULL,
    "location_raw" TEXT,
    "remote_type_raw" TEXT,
    "employment_type_raw" TEXT,
    "salary_raw" TEXT,
    "description_raw" TEXT NOT NULL,
    "posted_at_raw" TEXT,
    "first_seen_at" TIMESTAMP(3) NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "parse_confidence" DOUBLE PRECISION,
    "payload_json" JSONB NOT NULL,
    "content_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "raw_job_listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canonical_jobs" (
    "id" TEXT NOT NULL,
    "canonical_title" TEXT NOT NULL,
    "canonical_company_id" TEXT,
    "canonical_location" TEXT,
    "remote_type" "RemoteType" NOT NULL DEFAULT 'UNKNOWN',
    "employment_type" "EmploymentType",
    "salary_currency" TEXT,
    "salary_min" INTEGER,
    "salary_max" INTEGER,
    "description_text" TEXT,
    "search_summary" TEXT,
    "official_source_url" TEXT,
    "official_source_confidence" DOUBLE PRECISION,
    "official_source_method" TEXT,
    "official_source_evidence_json" JSONB,
    "first_seen_at" TIMESTAMP(3) NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL,
    "repost_count" INTEGER NOT NULL DEFAULT 0,
    "current_status" "CanonicalJobStatus" NOT NULL DEFAULT 'UNKNOWN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "canonical_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canonical_job_sources" (
    "id" TEXT NOT NULL,
    "canonical_job_id" TEXT NOT NULL,
    "raw_job_listing_id" TEXT NOT NULL,
    "link_confidence" DOUBLE PRECISION,
    "precedence_rank" INTEGER,
    "is_canonical_source" BOOLEAN NOT NULL DEFAULT false,
    "merge_rationale_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "canonical_job_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_snapshots" (
    "id" TEXT NOT NULL,
    "canonical_job_id" TEXT NOT NULL,
    "snapshot_at" TIMESTAMP(3) NOT NULL,
    "source_count" INTEGER NOT NULL,
    "active_source_count" INTEGER NOT NULL,
    "official_source_present" BOOLEAN NOT NULL,
    "application_endpoint_status" "ApplicationEndpointStatus" NOT NULL DEFAULT 'UNKNOWN',
    "description_hash" TEXT,
    "metadata_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_scores" (
    "id" TEXT NOT NULL,
    "canonical_job_id" TEXT NOT NULL,
    "scored_at" TIMESTAMP(3) NOT NULL,
    "trust_score" INTEGER NOT NULL,
    "freshness_score" INTEGER NOT NULL,
    "priority_score" INTEGER NOT NULL,
    "trust_label" "TrustLabel" NOT NULL,
    "freshness_label" "FreshnessLabel" NOT NULL,
    "priority_label" "PriorityLabel" NOT NULL,
    "reasons_json" JSONB NOT NULL,
    "flags_json" JSONB,
    "evidence_json" JSONB,
    "model_version" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canonical_job_reviews" (
    "id" TEXT NOT NULL,
    "canonical_job_id" TEXT NOT NULL,
    "review_type" "CanonicalReviewType" NOT NULL,
    "disposition" "CanonicalReviewDisposition" NOT NULL,
    "summary" TEXT NOT NULL,
    "details" TEXT,
    "reviewer_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "canonical_job_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "auth_provider" "AuthProvider",
    "auth_provider_user_id" TEXT,
    "preferences_json" JSONB,
    "target_roles_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_jobs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "canonical_job_id" TEXT NOT NULL,
    "saved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "saved_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_searches" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT,
    "query_params" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_searches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "saved_search_id" TEXT,
    "name" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'email',
    "schedule_cron" TEXT,
    "status" "AlertStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "companies_normalized_name_key" ON "companies"("normalized_name");

-- CreateIndex
CREATE UNIQUE INDEX "companies_primary_domain_key" ON "companies"("primary_domain");

-- CreateIndex
CREATE INDEX "sources_source_type_trust_level_idx" ON "sources"("source_type", "trust_level");

-- CreateIndex
CREATE UNIQUE INDEX "sources_source_type_source_name_key" ON "sources"("source_type", "source_name");

-- CreateIndex
CREATE INDEX "raw_job_listings_first_seen_at_idx" ON "raw_job_listings"("first_seen_at");

-- CreateIndex
CREATE INDEX "raw_job_listings_last_seen_at_idx" ON "raw_job_listings"("last_seen_at");

-- CreateIndex
CREATE INDEX "raw_job_listings_is_active_idx" ON "raw_job_listings"("is_active");

-- CreateIndex
CREATE INDEX "raw_job_listings_content_hash_idx" ON "raw_job_listings"("content_hash");

-- CreateIndex
CREATE UNIQUE INDEX "raw_job_listings_source_id_url_key" ON "raw_job_listings"("source_id", "url");

-- CreateIndex
CREATE UNIQUE INDEX "raw_job_listings_source_id_external_job_id_key" ON "raw_job_listings"("source_id", "external_job_id");

-- CreateIndex
CREATE INDEX "canonical_jobs_canonical_company_id_idx" ON "canonical_jobs"("canonical_company_id");

-- CreateIndex
CREATE INDEX "canonical_jobs_remote_type_idx" ON "canonical_jobs"("remote_type");

-- CreateIndex
CREATE INDEX "canonical_jobs_current_status_last_seen_at_idx" ON "canonical_jobs"("current_status", "last_seen_at");

-- CreateIndex
CREATE INDEX "canonical_jobs_salary_min_salary_max_idx" ON "canonical_jobs"("salary_min", "salary_max");

-- CreateIndex
CREATE INDEX "canonical_job_sources_raw_job_listing_id_idx" ON "canonical_job_sources"("raw_job_listing_id");

-- CreateIndex
CREATE INDEX "canonical_job_sources_is_canonical_source_precedence_rank_idx" ON "canonical_job_sources"("is_canonical_source", "precedence_rank");

-- CreateIndex
CREATE UNIQUE INDEX "canonical_job_sources_canonical_job_id_raw_job_listing_id_key" ON "canonical_job_sources"("canonical_job_id", "raw_job_listing_id");

-- CreateIndex
CREATE INDEX "job_snapshots_canonical_job_id_snapshot_at_idx" ON "job_snapshots"("canonical_job_id", "snapshot_at" DESC);

-- CreateIndex
CREATE INDEX "job_scores_canonical_job_id_scored_at_idx" ON "job_scores"("canonical_job_id", "scored_at" DESC);

-- CreateIndex
CREATE INDEX "job_scores_trust_label_freshness_label_priority_label_idx" ON "job_scores"("trust_label", "freshness_label", "priority_label");

-- CreateIndex
CREATE INDEX "canonical_job_reviews_canonical_job_id_created_at_idx" ON "canonical_job_reviews"("canonical_job_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "canonical_job_reviews_review_type_disposition_created_at_idx" ON "canonical_job_reviews"("review_type", "disposition", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_auth_provider_auth_provider_user_id_idx" ON "users"("auth_provider", "auth_provider_user_id");

-- CreateIndex
CREATE INDEX "saved_jobs_saved_at_idx" ON "saved_jobs"("saved_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "saved_jobs_user_id_canonical_job_id_key" ON "saved_jobs"("user_id", "canonical_job_id");

-- CreateIndex
CREATE INDEX "saved_searches_user_id_created_at_idx" ON "saved_searches"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "alerts_user_id_status_idx" ON "alerts"("user_id", "status");

-- AddForeignKey
ALTER TABLE "raw_job_listings" ADD CONSTRAINT "raw_job_listings_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canonical_jobs" ADD CONSTRAINT "canonical_jobs_canonical_company_id_fkey" FOREIGN KEY ("canonical_company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canonical_job_sources" ADD CONSTRAINT "canonical_job_sources_canonical_job_id_fkey" FOREIGN KEY ("canonical_job_id") REFERENCES "canonical_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canonical_job_sources" ADD CONSTRAINT "canonical_job_sources_raw_job_listing_id_fkey" FOREIGN KEY ("raw_job_listing_id") REFERENCES "raw_job_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_snapshots" ADD CONSTRAINT "job_snapshots_canonical_job_id_fkey" FOREIGN KEY ("canonical_job_id") REFERENCES "canonical_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_scores" ADD CONSTRAINT "job_scores_canonical_job_id_fkey" FOREIGN KEY ("canonical_job_id") REFERENCES "canonical_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canonical_job_reviews" ADD CONSTRAINT "canonical_job_reviews_canonical_job_id_fkey" FOREIGN KEY ("canonical_job_id") REFERENCES "canonical_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_jobs" ADD CONSTRAINT "saved_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_jobs" ADD CONSTRAINT "saved_jobs_canonical_job_id_fkey" FOREIGN KEY ("canonical_job_id") REFERENCES "canonical_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_saved_search_id_fkey" FOREIGN KEY ("saved_search_id") REFERENCES "saved_searches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
