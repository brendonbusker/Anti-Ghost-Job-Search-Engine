import { createHash } from "node:crypto";

import { EmploymentType, RemoteType } from "@anti-ghost/database";

export function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function fetchJsonWithRetry<T>(url: string, retries = 2): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "anti-ghost-job-search-engine/0.1",
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status} for ${url}`);
      }

      return (await response.json()) as T;
    } catch (error) {
      lastError = error;

      if (attempt < retries) {
        await sleep(300 * (attempt + 1));
      }
    }
  }

  throw lastError;
}

export function collectUniqueText(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean))] as string[];
}

export function inferRemoteTypeFromText(values: Array<string | null | undefined>): RemoteType {
  const joined = values.filter(Boolean).join(" ").toLowerCase();

  if (!joined) {
    return RemoteType.UNKNOWN;
  }

  if (joined.includes("remote")) {
    return RemoteType.REMOTE;
  }

  if (joined.includes("hybrid")) {
    return RemoteType.HYBRID;
  }

  if (joined.includes("on-site") || joined.includes("onsite") || joined.includes("on site")) {
    return RemoteType.ONSITE;
  }

  return RemoteType.UNKNOWN;
}

export function inferEmploymentTypeFromText(values: Array<string | null | undefined>): EmploymentType {
  const joined = values.filter(Boolean).join(" ").toLowerCase();

  if (!joined) {
    return EmploymentType.UNKNOWN;
  }

  if (joined.includes("full-time") || joined.includes("full time")) {
    return EmploymentType.FULL_TIME;
  }

  if (joined.includes("part-time") || joined.includes("part time")) {
    return EmploymentType.PART_TIME;
  }

  if (joined.includes("contract")) {
    return EmploymentType.CONTRACT;
  }

  if (joined.includes("temporary") || joined.includes("temp")) {
    return EmploymentType.TEMPORARY;
  }

  if (joined.includes("intern")) {
    return EmploymentType.INTERN;
  }

  if (joined.includes("freelance")) {
    return EmploymentType.FREELANCE;
  }

  return EmploymentType.UNKNOWN;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
