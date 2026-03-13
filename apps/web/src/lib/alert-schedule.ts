export const alertCadenceOptions = [
  {
    value: "DAILY_MORNING",
    label: "Daily morning",
    cron: "0 9 * * *",
  },
  {
    value: "WEEKDAYS_MORNING",
    label: "Weekdays morning",
    cron: "0 9 * * 1-5",
  },
  {
    value: "WEEKLY_MONDAY",
    label: "Every Monday",
    cron: "0 9 * * 1",
  },
] as const;

export type AlertCadence = (typeof alertCadenceOptions)[number]["value"];

export function cadenceToSchedule(cadence: string | null | undefined) {
  return alertCadenceOptions.find((option) => option.value === cadence)?.cron ?? alertCadenceOptions[0].cron;
}

export function cadenceFromSchedule(scheduleCron: string | null): AlertCadence {
  return (
    alertCadenceOptions.find((option) => option.cron === scheduleCron)?.value ??
    alertCadenceOptions[0].value
  );
}

export function isAlertDue({
  scheduleCron,
  createdAt,
  lastSentAt,
  now = new Date(),
}: {
  scheduleCron: string | null;
  createdAt: Date;
  lastSentAt: Date | null;
  now?: Date;
}): boolean {
  const cadence = cadenceFromSchedule(scheduleCron);
  const latestWindowStart = getLatestWindowStart(cadence, now);

  if (!latestWindowStart) {
    return false;
  }

  const referenceTime = lastSentAt ?? createdAt;
  return latestWindowStart.getTime() > referenceTime.getTime();
}

export function isAlertDueSinceReference({
  scheduleCron,
  referenceAt,
  now = new Date(),
}: {
  scheduleCron: string | null;
  referenceAt: Date;
  now?: Date;
}): boolean {
  const cadence = cadenceFromSchedule(scheduleCron);
  const latestWindowStart = getLatestWindowStart(cadence, now);

  if (!latestWindowStart) {
    return false;
  }

  return latestWindowStart.getTime() > referenceAt.getTime();
}

function getLatestWindowStart(cadence: AlertCadence, now: Date): Date | null {
  switch (cadence) {
    case "DAILY_MORNING":
      return getLatestDailyCheckpoint(now);
    case "WEEKDAYS_MORNING":
      return getLatestWeekdayCheckpoint(now);
    case "WEEKLY_MONDAY":
      return getLatestMondayCheckpoint(now);
  }
}

function getLatestDailyCheckpoint(now: Date): Date {
  const todayCheckpoint = withMorningHour(now);
  if (now.getTime() >= todayCheckpoint.getTime()) {
    return todayCheckpoint;
  }

  const previousDay = new Date(todayCheckpoint);
  previousDay.setDate(previousDay.getDate() - 1);
  return previousDay;
}

function getLatestWeekdayCheckpoint(now: Date): Date | null {
  const cursor = withMorningHour(now);

  if (isWeekday(cursor) && now.getTime() >= cursor.getTime()) {
    return cursor;
  }

  for (let attempts = 0; attempts < 7; attempts += 1) {
    cursor.setDate(cursor.getDate() - 1);
    if (isWeekday(cursor)) {
      return cursor;
    }
  }

  return null;
}

function getLatestMondayCheckpoint(now: Date): Date {
  const cursor = withMorningHour(now);

  while (cursor.getDay() !== 1 || now.getTime() < cursor.getTime()) {
    cursor.setDate(cursor.getDate() - 1);
    if (cursor.getDay() === 1 && now.getTime() >= cursor.getTime()) {
      break;
    }
  }

  return cursor;
}

function withMorningHour(value: Date): Date {
  const result = new Date(value);
  result.setHours(9, 0, 0, 0);
  return result;
}

function isWeekday(value: Date): boolean {
  return value.getDay() >= 1 && value.getDay() <= 5;
}
