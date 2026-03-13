"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@anti-ghost/database";

import { requireCurrentUser, sanitizeReturnTo } from "@/lib/auth";
import { getSearchResultsForFilters } from "@/lib/jobs";
import { buildSavedSearchName, parseStoredSearchFilters } from "@/lib/search-filters";

function readTrimmedString(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function createSavedSearchAction(formData: FormData) {
  const returnTo = sanitizeReturnTo(readTrimmedString(formData.get("returnTo")));
  const rawName = readTrimmedString(formData.get("name"));
  const rawFilters = readTrimmedString(formData.get("filters"));
  const user = await requireCurrentUser(returnTo);

  const parsedFilters = parseStoredSearchFilters(readFiltersJson(rawFilters));
  const name = rawName || buildSavedSearchName(parsedFilters);

  await prisma.savedSearch.create({
    data: {
      userId: user.id,
      name,
      queryParams: parsedFilters,
    },
  });

  revalidatePath("/");
  revalidatePath("/searches");
  redirect("/searches");
}

export async function deleteSavedSearchAction(formData: FormData) {
  const returnTo = sanitizeReturnTo(readTrimmedString(formData.get("returnTo")));
  const savedSearchId = readTrimmedString(formData.get("savedSearchId"));
  const user = await requireCurrentUser(returnTo);

  if (!savedSearchId) {
    redirect(returnTo);
  }

  await prisma.savedSearch.deleteMany({
    where: {
      id: savedSearchId,
      userId: user.id,
    },
  });

  revalidatePath("/searches");
  redirect(returnTo);
}

export async function checkSavedSearchAction(formData: FormData) {
  const returnTo = sanitizeReturnTo(readTrimmedString(formData.get("returnTo")));
  const savedSearchId = readTrimmedString(formData.get("savedSearchId"));
  const user = await requireCurrentUser(returnTo);

  if (!savedSearchId) {
    redirect(returnTo);
  }

  const savedSearch = await prisma.savedSearch.findFirst({
    where: {
      id: savedSearchId,
      userId: user.id,
    },
  });

  if (!savedSearch) {
    redirect(returnTo);
  }

  const filters = parseStoredSearchFilters(savedSearch.queryParams);
  const { jobs } = await getSearchResultsForFilters(filters, user.id);

  await prisma.savedSearchSnapshot.create({
    data: {
      savedSearchId: savedSearch.id,
      matchedJobCount: jobs.length,
      applyNowCount: jobs.filter((job) => job.priorityLabel === "APPLY_NOW").length,
      applySoonCount: jobs.filter((job) => job.priorityLabel === "APPLY_SOON").length,
      officialSourceCount: jobs.filter((job) => job.officialSourceStatus !== "MISSING").length,
      matchedJobIdsJson: jobs.map((job) => job.id),
    },
  });

  revalidatePath("/alerts");
  revalidatePath("/searches");
  redirect(returnTo);
}

function readFiltersJson(value: string) {
  if (!value) {
    return {};
  }

  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}
