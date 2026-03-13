import { NextResponse } from "next/server";

import { executeDueAlerts } from "@/lib/alert-execution";
import { getAlertRunSecret, isValidAlertRunSecret } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleRunRequest(request);
}

export async function POST(request: Request) {
  return handleRunRequest(request);
}

async function handleRunRequest(request: Request) {
  const configuredSecret = getAlertRunSecret();

  if (!configuredSecret) {
    return NextResponse.json(
      {
        error: "ANTI_GHOST_ALERT_RUN_SECRET or CRON_SECRET is not configured.",
      },
      {
        status: 503,
      },
    );
  }

  const providedSecret = readRunSecret(request);

  if (!isValidAlertRunSecret(providedSecret)) {
    return NextResponse.json(
      {
        error: "Unauthorized.",
      },
      {
        status: 401,
      },
    );
  }

  const url = new URL(request.url);
  const userId = url.searchParams.get("userId")?.trim() || undefined;
  const summary = await executeDueAlerts(
    userId
      ? {
          userId,
        }
      : {},
  );

  return NextResponse.json(summary);
}

function readRunSecret(request: Request) {
  const authHeader = request.headers.get("authorization");

  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length);
  }

  return request.headers.get("x-alert-run-secret");
}
