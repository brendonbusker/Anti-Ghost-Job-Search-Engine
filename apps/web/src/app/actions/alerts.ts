"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@anti-ghost/database";

import { executeAlertRunById, executeDueAlerts } from "@/lib/alert-execution";
import { cadenceToSchedule } from "@/lib/alert-schedule";
import { requireCurrentUser, sanitizeReturnTo } from "@/lib/auth";

function readTrimmedString(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function createOrUpdateAlertAction(formData: FormData) {
  const returnTo = sanitizeReturnTo(readTrimmedString(formData.get("returnTo")));
  const savedSearchId = readTrimmedString(formData.get("savedSearchId"));
  const cadence = readTrimmedString(formData.get("cadence"));
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

  const existingAlert = await prisma.alert.findFirst({
    where: {
      userId: user.id,
      savedSearchId,
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  const data = {
    name: savedSearch.name?.trim() || "Search alert",
    channel: "email",
    scheduleCron: cadenceToSchedule(cadence),
    status: "ACTIVE" as const,
  };

  if (existingAlert) {
    await prisma.alert.update({
      where: {
        id: existingAlert.id,
      },
      data,
    });
  } else {
    await prisma.alert.create({
      data: {
        userId: user.id,
        savedSearchId,
        ...data,
      },
    });
  }

  revalidatePath("/alerts");
  revalidatePath("/searches");
  redirect(returnTo);
}

export async function updateAlertStatusAction(formData: FormData) {
  const returnTo = sanitizeReturnTo(readTrimmedString(formData.get("returnTo")));
  const alertId = readTrimmedString(formData.get("alertId"));
  const status = readTrimmedString(formData.get("status"));
  const user = await requireCurrentUser(returnTo);

  if (!alertId || !["ACTIVE", "PAUSED", "DISABLED"].includes(status)) {
    redirect(returnTo);
  }

  await prisma.alert.updateMany({
    where: {
      id: alertId,
      userId: user.id,
    },
    data: {
      status: status as "ACTIVE" | "PAUSED" | "DISABLED",
    },
  });

  revalidatePath("/alerts");
  revalidatePath("/searches");
  redirect(returnTo);
}

export async function deleteAlertAction(formData: FormData) {
  const returnTo = sanitizeReturnTo(readTrimmedString(formData.get("returnTo")));
  const alertId = readTrimmedString(formData.get("alertId"));
  const user = await requireCurrentUser(returnTo);

  if (!alertId) {
    redirect(returnTo);
  }

  await prisma.alert.deleteMany({
    where: {
      id: alertId,
      userId: user.id,
    },
  });

  revalidatePath("/alerts");
  revalidatePath("/searches");
  redirect(returnTo);
}

export async function runAlertNowAction(formData: FormData) {
  const returnTo = sanitizeReturnTo(readTrimmedString(formData.get("returnTo")));
  const alertId = readTrimmedString(formData.get("alertId"));
  const user = await requireCurrentUser(returnTo);

  if (!alertId) {
    redirect(returnTo);
  }

  const alert = await prisma.alert.findFirst({
    where: {
      id: alertId,
      userId: user.id,
    },
    select: {
      id: true,
    },
  });

  if (!alert) {
    redirect(returnTo);
  }

  await executeAlertRunById(alert.id, {
    trigger: "MANUAL",
    force: true,
  });

  revalidatePath("/alerts");
  revalidatePath("/searches");
  redirect(returnTo);
}

export async function runDueAlertsAction(formData: FormData) {
  const returnTo = sanitizeReturnTo(readTrimmedString(formData.get("returnTo")));
  const user = await requireCurrentUser(returnTo);

  await executeDueAlerts({
    userId: user.id,
  });

  revalidatePath("/alerts");
  revalidatePath("/searches");
  redirect(returnTo);
}
