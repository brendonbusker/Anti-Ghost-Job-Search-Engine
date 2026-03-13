"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@anti-ghost/database";

import { requireCurrentUser } from "@/lib/auth";

function readTrimmedString(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function readReturnTo(formData: FormData): string {
  const returnTo = readTrimmedString(formData.get("returnTo"));
  return returnTo.length > 0 ? returnTo : "/";
}

export async function saveJobAction(formData: FormData) {
  const canonicalJobId = readTrimmedString(formData.get("canonicalJobId"));
  const returnTo = readReturnTo(formData);

  if (!canonicalJobId) {
    redirect(returnTo);
  }

  const user = await requireCurrentUser(returnTo);

  await prisma.savedJob.upsert({
    where: {
      userId_canonicalJobId: {
        userId: user.id,
        canonicalJobId,
      },
    },
    update: {},
    create: {
      userId: user.id,
      canonicalJobId,
    },
  });

  revalidatePath("/");
  revalidatePath("/saved");
  revalidatePath(returnTo);
  redirect(returnTo);
}

export async function removeSavedJobAction(formData: FormData) {
  const canonicalJobId = readTrimmedString(formData.get("canonicalJobId"));
  const returnTo = readReturnTo(formData);

  if (!canonicalJobId) {
    redirect(returnTo);
  }

  const user = await requireCurrentUser(returnTo);

  await prisma.savedJob.deleteMany({
    where: {
      userId: user.id,
      canonicalJobId,
    },
  });

  revalidatePath("/");
  revalidatePath("/saved");
  revalidatePath(returnTo);
  redirect(returnTo);
}

export async function updateSavedJobNoteAction(formData: FormData) {
  const canonicalJobId = readTrimmedString(formData.get("canonicalJobId"));
  const note = readTrimmedString(formData.get("note"));
  const returnTo = readReturnTo(formData);

  if (!canonicalJobId) {
    redirect(returnTo);
  }

  const user = await requireCurrentUser(returnTo);

  await prisma.savedJob.updateMany({
    where: {
      userId: user.id,
      canonicalJobId,
    },
    data: {
      notes: note.length > 0 ? note : null,
    },
  });

  revalidatePath("/saved");
  revalidatePath(returnTo);
  redirect(returnTo);
}
