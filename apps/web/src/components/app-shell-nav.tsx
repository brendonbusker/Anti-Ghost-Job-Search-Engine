import Link from "next/link";

import { signOutAction } from "@/app/actions/auth";
import { buildSignInHref, getCurrentUser, getViewerLabel } from "@/lib/auth";

const links = [
  {
    href: "/",
    label: "Search",
  },
  {
    href: "/saved",
    label: "Saved jobs",
  },
  {
    href: "/searches",
    label: "Saved searches",
  },
  {
    href: "/alerts",
    label: "Alerts",
  },
  {
    href: "/updates",
    label: "Updates",
  },
  {
    href: "/review/canonical",
    label: "Review",
  },
];

export async function AppShellNav() {
  const user = await getCurrentUser();

  return (
    <header className="sticky top-0 z-20 border-b border-line/80 bg-background/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-3 px-5 py-4 md:px-8 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="font-heading text-lg font-semibold tracking-tight text-foreground">
            Anti-Ghost Job Search Engine
          </Link>

          <div className="rounded-full border border-line bg-panel px-3 py-1.5 text-xs uppercase tracking-[0.18em] text-muted lg:hidden">
            {getViewerLabel(user)}
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <nav className="flex flex-wrap items-center gap-2">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-full border border-line bg-panel px-4 py-2 text-sm font-medium text-foreground transition hover:bg-panel-strong"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex flex-wrap items-center gap-2">
            <div className="hidden rounded-full border border-line bg-panel px-3 py-2 text-sm text-muted lg:block">
              {getViewerLabel(user)}
            </div>

            {user ? (
              <form action={signOutAction}>
                <input type="hidden" name="returnTo" value="/" />
                <button
                  type="submit"
                  className="rounded-full border border-line-strong px-4 py-2 text-sm font-medium text-foreground transition hover:bg-panel-strong"
                >
                  Sign out
                </button>
              </form>
            ) : (
              <Link
                href={buildSignInHref("/")}
                className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition hover:opacity-90"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
