import Link from "next/link";

import { SearchAlertForm } from "@/components/jobs/search-alert-form";
import { SavedSearchCheckCard } from "@/components/jobs/saved-search-check-card";
import { deleteSavedSearchAction } from "@/app/actions/saved-searches";
import { buildSignInHref, getViewerLabel } from "@/lib/auth";
import { formatRelativeDays } from "@/lib/format";
import { getSavedSearchesPageData } from "@/lib/saved-searches";

export const dynamic = "force-dynamic";

export default async function SavedSearchesPage() {
  const { viewer, searches, usingFallbackData } = await getSavedSearchesPageData();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col gap-6 px-5 py-6 md:px-8">
      <header className="panel-shadow rounded-[34px] border border-line bg-panel px-6 py-6 md:px-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-4xl">
            <p className="font-heading text-xs font-semibold uppercase tracking-[0.34em] text-muted">Saved searches</p>
            <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-tight text-foreground md:text-6xl">
              Reopen the exact search session you care about.
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-8 text-muted md:text-lg">
              Lightweight `MVP` scaffolding for <span className="font-mono text-foreground">{getViewerLabel(viewer)}</span>:
              keep the useful filter combinations, reopen them fast, and avoid rebuilding the same search session by hand.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2 lg:max-w-xl">
            <SummaryCard label="Saved" value={String(searches.length)} detail="Current saved searches in this session." />
            <SummaryCard
              label="Checked"
              value={String(searches.filter((search) => search.latestCheck !== null).length)}
              detail="Saved searches with a recorded baseline or follow-up check."
            />
          </div>
        </div>
      </header>

      {usingFallbackData ? (
        <section className="rounded-[24px] border border-warning/30 bg-warning-soft px-5 py-4 text-sm text-warning">
          Saved-search data is unavailable right now because the database-backed workflow could not load.
        </section>
      ) : null}

      {!viewer ? (
        <section className="panel-shadow rounded-[30px] border border-line bg-panel p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Signed out</p>
          <h2 className="mt-2 font-heading text-2xl font-semibold text-foreground">Sign in to keep searches</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-muted">
            The saved-search workflow is now attached to a real user session, so you need to sign in before the app can keep your filter sets.
          </p>
          <Link
            href={buildSignInHref("/searches")}
            className="mt-5 inline-flex rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background transition hover:opacity-90"
          >
            Sign in
          </Link>
        </section>
      ) : searches.length > 0 ? (
        <section className="space-y-5">
          {searches.map((search) => (
            <article key={search.id} className="panel-shadow rounded-[30px] border border-line bg-panel p-6">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                <div className="max-w-4xl">
                  <p className="font-heading text-2xl font-semibold text-foreground">{search.name}</p>
                  <p className="mt-3 text-sm text-muted">Saved {formatRelativeDays(search.createdAt)}</p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {search.summary.length > 0 ? (
                      search.summary.map((item) => (
                        <span
                          key={item}
                          className="rounded-full border border-line bg-panel-strong px-3 py-1 text-xs text-muted"
                        >
                          {item}
                        </span>
                      ))
                    ) : (
                      <span className="rounded-full border border-line bg-panel-strong px-3 py-1 text-xs text-muted">
                        No filters saved beyond the default active-job search
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Link
                    href={search.href}
                    className="rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background transition hover:opacity-90"
                  >
                    Open search
                  </Link>
                  <form action={deleteSavedSearchAction}>
                    <input type="hidden" name="savedSearchId" value={search.id} />
                    <input type="hidden" name="returnTo" value="/searches" />
                    <button
                      type="submit"
                      className="rounded-full border border-line-strong px-5 py-3 text-sm font-medium text-foreground transition hover:bg-panel-strong"
                    >
                      Delete
                    </button>
                  </form>
                </div>
              </div>

              <div className="mt-6">
                <SavedSearchCheckCard savedSearchId={search.id} returnTo="/searches" latestCheck={search.latestCheck} />
              </div>

              <div className="mt-6 rounded-[24px] border border-line bg-panel-strong p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Alert</p>
                {search.alert ? (
                  <>
                    <p className="mt-2 text-sm leading-6 text-foreground">
                      {search.alert.status === "ACTIVE" ? "Active" : search.alert.status === "PAUSED" ? "Paused" : "Disabled"} on a{" "}
                      {search.alert.cadenceLabel.toLowerCase()} cadence.
                    </p>
                    <p className="mt-2 text-sm leading-6 text-muted">
                      Alerts now sit on top of saved-search checks, so this monitored search can already feed the updates page with baseline and change context before delivery lands.
                    </p>
                    <div className="mt-4">
                      <SearchAlertForm
                        savedSearchId={search.id}
                        returnTo="/searches"
                        currentCadence={search.alert.cadence}
                        actionLabel="Update alert"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <p className="mt-2 text-sm leading-6 text-muted">
                      Turn this saved search into a monitored alert. Delivery is still pending, but the cadence, state, and check history are now real product data.
                    </p>
                    <div className="mt-4">
                      <SearchAlertForm savedSearchId={search.id} returnTo="/searches" />
                    </div>
                  </>
                )}
              </div>
            </article>
          ))}
        </section>
      ) : (
        <section className="panel-shadow rounded-[30px] border border-line bg-panel p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">No saved searches yet</p>
          <h2 className="mt-2 font-heading text-2xl font-semibold text-foreground">Save a filter set from search</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-muted">
            Search for roles the way you actually work, then save that filter combination so you can reopen it in one click later.
          </p>
          <Link
            href="/"
            className="mt-5 inline-flex rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background transition hover:opacity-90"
          >
            Go to search
          </Link>
        </section>
      )}
    </main>
  );
}

function SummaryCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-[24px] border border-line bg-panel-strong p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">{label}</p>
      <p className="mt-2 font-heading text-xl font-semibold text-foreground">{value}</p>
      <p className="mt-2 text-sm leading-6 text-muted">{detail}</p>
    </div>
  );
}
