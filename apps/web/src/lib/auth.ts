import "server-only";

import { randomBytes } from "node:crypto";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "@anti-ghost/database";

const SESSION_COOKIE_NAME = "anti_ghost_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export type AuthViewer = {
  id: string;
  email: string;
  name: string | null;
};

export async function getCurrentUser(): Promise<AuthViewer | null> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionToken) {
    return null;
  }

  try {
    const session = await prisma.userSession.findUnique({
      where: {
        sessionToken,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    if (!session) {
      await clearUserSessionToken(sessionToken);
      return null;
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      await clearUserSessionToken(sessionToken);
      return null;
    }

    await prisma.userSession.update({
      where: {
        id: session.id,
      },
      data: {
        lastSeenAt: new Date(),
      },
    });

    return session.user;
  } catch {
    return null;
  }
}

export async function requireCurrentUser(returnTo = "/"): Promise<AuthViewer> {
  const user = await getCurrentUser();

  if (!user) {
    redirect(buildSignInHref(returnTo));
  }

  return user;
}

export async function createOrUpdateSessionUser(input: { email: string; name?: string | null }) {
  const normalizedEmail = input.email.trim().toLowerCase();
  const normalizedName = input.name?.trim() || null;

  const existingUser = await prisma.user.findUnique({
    where: {
      email: normalizedEmail,
    },
    select: {
      id: true,
      email: true,
      name: true,
    },
  });

  if (!existingUser) {
    return prisma.user.create({
      data: {
        email: normalizedEmail,
        name: normalizedName,
      },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });
  }

  if (normalizedName && normalizedName !== existingUser.name) {
    return prisma.user.update({
      where: {
        id: existingUser.id,
      },
      data: {
        name: normalizedName,
      },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });
  }

  return existingUser;
}

export async function setUserSession(userId: string) {
  const cookieStore = await cookies();
  const sessionToken = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

  await prisma.userSession.create({
    data: {
      userId,
      sessionToken,
      expiresAt,
    },
  });

  cookieStore.set(SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearUserSession() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (sessionToken) {
    await clearUserSessionToken(sessionToken);
  }

  cookieStore.delete(SESSION_COOKIE_NAME);
}

export function getAlertRunSecret() {
  return getAlertRunSecrets()[0] ?? null;
}

export function isValidAlertRunSecret(candidate: string | null | undefined) {
  const configuredSecrets = getAlertRunSecrets();

  if (configuredSecrets.length === 0) {
    return false;
  }

  const normalizedCandidate = candidate?.trim();

  if (!normalizedCandidate) {
    return false;
  }

  return configuredSecrets.includes(normalizedCandidate);
}

export function buildSignInHref(returnTo = "/") {
  const params = new URLSearchParams();
  params.set("returnTo", sanitizeReturnTo(returnTo));
  return `/sign-in?${params.toString()}`;
}

export function sanitizeReturnTo(value: string | null | undefined) {
  if (!value || !value.startsWith("/")) {
    return "/";
  }

  return value;
}

export function getViewerLabel(user: AuthViewer | null) {
  if (!user) {
    return "Signed out";
  }

  return user.name?.trim() || user.email;
}

async function clearUserSessionToken(sessionToken: string) {
  await prisma.userSession.deleteMany({
    where: {
      sessionToken,
    },
  });
}

function getAlertRunSecrets() {
  return Array.from(
    new Set(
      [process.env.ANTI_GHOST_ALERT_RUN_SECRET, process.env.CRON_SECRET]
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
}
