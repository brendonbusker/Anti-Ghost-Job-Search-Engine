"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  clearUserSession,
  createOrUpdateSessionUser,
  sanitizeReturnTo,
  setUserSession,
} from "@/lib/auth";

function readTrimmedString(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function signInAction(formData: FormData) {
  const email = readTrimmedString(formData.get("email")).toLowerCase();
  const name = readTrimmedString(formData.get("name"));
  const returnTo = sanitizeReturnTo(readTrimmedString(formData.get("returnTo")));

  if (!email) {
    redirect(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
  }

  const user = await createOrUpdateSessionUser({
    email,
    name,
  });

  await setUserSession(user.id);

  revalidatePath("/");
  revalidatePath("/saved");
  revalidatePath("/searches");
  revalidatePath("/alerts");
  redirect(returnTo);
}

export async function signOutAction(formData: FormData) {
  const returnTo = sanitizeReturnTo(readTrimmedString(formData.get("returnTo")));

  await clearUserSession();

  revalidatePath("/");
  revalidatePath("/saved");
  revalidatePath("/searches");
  revalidatePath("/alerts");
  redirect(returnTo || "/");
}
