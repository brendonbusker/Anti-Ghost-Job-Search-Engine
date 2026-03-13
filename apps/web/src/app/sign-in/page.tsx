import Link from "next/link";

import { signInAction } from "@/app/actions/auth";
import { sanitizeReturnTo } from "@/lib/auth";

export const dynamic = "force-dynamic";

type SignInPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const returnToValue = Array.isArray(resolvedSearchParams.returnTo)
    ? resolvedSearchParams.returnTo[0]
    : resolvedSearchParams.returnTo;
  const returnTo = sanitizeReturnTo(typeof returnToValue === "string" ? returnToValue : "/");

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[960px] flex-col gap-6 px-5 py-8 md:px-8">
      <section className="panel-shadow rounded-[34px] border border-line bg-panel px-6 py-6 md:px-8">
        <p className="font-heading text-xs font-semibold uppercase tracking-[0.34em] text-muted">Lightweight sign-in</p>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-foreground md:text-6xl">
          Save jobs and searches under a real user session.
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-8 text-muted md:text-lg">
          This is the current `MVP` auth step: a simple email-based sign-in with a persisted server-side session so saved jobs,
          searches, and alerts belong to a real signed-in user instead of a hardcoded shortcut or a raw user-id cookie.
        </p>
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <article className="panel-shadow rounded-[30px] border border-line bg-panel p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Why this is `MVP`</p>
          <div className="mt-4 space-y-4 text-sm leading-7 text-foreground">
            <p>Saved jobs and saved searches are now tied to a signed-in user session.</p>
            <p>The flow stays intentionally lightweight so we can keep shipping product value before full provider-based auth lands.</p>
            <p>It is stronger than the first local pass: sessions are now persisted server-side instead of trusting a raw user identifier in the browser cookie.</p>
          </div>
          <Link
            href={returnTo}
            className="mt-6 inline-flex rounded-full border border-line-strong px-5 py-3 text-sm font-medium text-foreground transition hover:bg-panel-strong"
          >
            Back
          </Link>
        </article>

        <article className="panel-shadow rounded-[30px] border border-line bg-panel p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Sign in</p>
          <h2 className="mt-2 font-heading text-2xl font-semibold text-foreground">Start a session</h2>
          <p className="mt-3 text-sm leading-7 text-muted">
            Enter an email to continue. If the user already exists, this session will attach to that account; otherwise the app will create it.
          </p>

          <form action={signInAction} className="mt-6 space-y-4">
            <input type="hidden" name="returnTo" value={returnTo} />

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Email</span>
              <input
                type="email"
                name="email"
                required
                placeholder="you@example.com"
                className="mt-2 w-full rounded-2xl border border-line bg-panel-strong px-4 py-3 text-sm text-foreground outline-none transition focus:border-line-strong"
              />
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Name</span>
              <input
                type="text"
                name="name"
                placeholder="Optional display name"
                className="mt-2 w-full rounded-2xl border border-line bg-panel-strong px-4 py-3 text-sm text-foreground outline-none transition focus:border-line-strong"
              />
            </label>

            <button
              type="submit"
              className="rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background transition hover:opacity-90"
            >
              Continue
            </button>
          </form>
        </article>
      </section>
    </main>
  );
}
