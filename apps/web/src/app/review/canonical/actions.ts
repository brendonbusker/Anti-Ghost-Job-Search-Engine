"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma, type CanonicalReviewDisposition, type CanonicalReviewType } from "@anti-ghost/database";

const REVIEW_PATH = "/review/canonical";
const REVIEW_TYPES = new Set<CanonicalReviewType>([
  "MERGE_QUALITY",
  "OFFICIAL_SOURCE",
  "SCORE_CALIBRATION",
  "GENERAL_NOTE",
]);
const REVIEW_DISPOSITIONS = new Set<CanonicalReviewDisposition>([
  "CONFIRMED",
  "INCORRECT",
  "NEEDS_FOLLOW_UP",
]);

export async function createCanonicalReviewAnnotation(formData: FormData) {
  const canonicalJobId = readTrimmedString(formData.get("canonicalJobId"));
  const reviewType = readTrimmedString(formData.get("reviewType"));
  const disposition = readTrimmedString(formData.get("disposition"));
  const summary = readTrimmedString(formData.get("summary"));
  const details = readTrimmedString(formData.get("details"));
  const reviewerName = readTrimmedString(formData.get("reviewerName"));
  const returnTo = normalizeReturnTo(readTrimmedString(formData.get("returnTo")));

  if (!canonicalJobId || !reviewType || !summary || !disposition) {
    redirect(returnTo);
  }

  if (!isCanonicalReviewType(reviewType) || !isCanonicalReviewDisposition(disposition)) {
    redirect(returnTo);
  }

  await prisma.canonicalJobReview.create({
    data: {
      canonicalJobId,
      reviewType,
      disposition,
      summary: summary.slice(0, 160),
      details: details ? details.slice(0, 2_000) : null,
      reviewerName: reviewerName ? reviewerName.slice(0, 80) : null,
    },
  });

  revalidatePath(REVIEW_PATH);
  redirect(returnTo);
}

function readTrimmedString(value: FormDataEntryValue | null): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeReturnTo(value: string | null): string {
  if (!value || !value.startsWith(REVIEW_PATH)) {
    return REVIEW_PATH;
  }

  return value;
}

function isCanonicalReviewType(value: string): value is CanonicalReviewType {
  return REVIEW_TYPES.has(value as CanonicalReviewType);
}

function isCanonicalReviewDisposition(value: string): value is CanonicalReviewDisposition {
  return REVIEW_DISPOSITIONS.has(value as CanonicalReviewDisposition);
}
