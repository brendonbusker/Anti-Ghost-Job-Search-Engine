import Link from "next/link";

import { deleteAlertAction, runAlertNowAction, runDueAlertsAction, updateAlertStatusAction } from "@/app/actions/alerts";
import { AlertRunSummaryCard } from "@/components/jobs/alert-run-summary-card";
import { SavedSearchCheckCard } from "@/components/jobs/saved-search-check-card";
import { buildSignInHref, getViewerLabel } from "@/lib/auth";
import { formatRelativeDays } from "@/lib/format";
import { getAlertsPageData } from "@/lib/alerts";

export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  const { viewer, alerts, usingFallbackData } = await getAlertsPageData();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col gap-6 px-5 py-6 md:px-8">
      <header className="panel-shadow rounded-[34px] border border-line bg-panel px-6 py-6 md:px-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-4xl">
            <p className="font-heading text-xs font-semibold uppercase tracking-[0.34em] text-muted">Alerts</p>
            <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-tight text-foreground md:text-6xl">
              Monitor saved searches without rebuilding them.
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-8 text-muted md:text-lg">
              This first `MVP` alert slice is configuration-first for <span className="font-mono text-foreground">{getViewerLabel(viewer)}</span>:
              turn a saved search into a monitored alert, choose its cadence, and manage whether it is active or paused before reviewing what changed on the updates page.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-4 lg:max-w-4xl">
            <SummaryCard label="Alerts" value={String(alerts.length)} detail="Saved-search alerts currently configured for this user." />
            <SummaryCard
              label="Due now"
              value={String(alerts.filter((alert) => alert.dueNow).length)}
              detail="Active alerts whose next scheduled run window has opened."
            />
            <SummaryCard
              label="Auto healthy"
              value={String(alerts.filter((alert) => alert.autoRefreshStatus === "HEALTHY").length)}
              detail="Alerts with a recent successful due-batch refresh and no missed scheduled window."
            />
            <SummaryCard
              label="Auto issues"
              value={String(alerts.filter((alert) => alert.autoRefreshStatus === "OVERDUE" || alert.autoRefreshStatus === "FAILING").length)}
              detail="Alerts whose automatic refresh is currently overdue or failing."
            />
          </div>
        </div>
      </header>

      {usingFallbackData ? (
        <section className="rounded-[24px] border border-warning/30 bg-warning-soft px-5 py-4 text-sm text-warning">
          Alert configuration could not load from the database right now.
        </section>
      ) : null}

      {!viewer ? (
        <section className="panel-shadow rounded-[30px] border border-line bg-panel p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Signed out</p>
          <h2 className="mt-2 font-heading text-2xl font-semibold text-foreground">Sign in to manage alerts</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-muted">
            Alerts are now tied to the signed-in user session, so you need to sign in before the app can keep monitored searches.
          </p>
          <Link
            href={buildSignInHref("/alerts")}
            className="mt-5 inline-flex rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background transition hover:opacity-90"
          >
            Sign in
          </Link>
        </section>
      ) : alerts.length > 0 ? (
        <section className="space-y-5">
          <div className="flex flex-wrap justify-end gap-3">
            <Link
              href="/updates"
              className="rounded-full border border-line-strong px-5 py-3 text-sm font-medium text-foreground transition hover:bg-panel"
            >
              Open updates
            </Link>
            <form action={runDueAlertsAction}>
              <input type="hidden" name="returnTo" value="/alerts" />
              <button
                type="submit"
                className="rounded-full border border-line-strong px-5 py-3 text-sm font-medium text-foreground transition hover:bg-panel"
              >
                Run due alerts now
              </button>
            </form>
          </div>

          {alerts.map((alert) => (
            <article key={alert.id} className="panel-shadow rounded-[30px] border border-line bg-panel p-6">
              <div className="flex flex-col gap-6 xl:grid xl:grid-cols-[minmax(0,1.2fr)_360px]">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="font-heading text-2xl font-semibold text-foreground">{alert.name}</p>
                    <span
                      className={`rounded-full border px-3 py-1 text-xs uppercase tracking-[0.16em] ${
                        alert.status === "ACTIVE"
                          ? "border-success/25 bg-success-soft text-success"
                          : alert.status === "PAUSED"
                            ? "border-warning/20 bg-warning-soft text-warning"
                            : "border-line bg-panel-strong text-muted"
                      }`}
                    >
                      {alert.status.toLowerCase()}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-muted">
                    Watching <span className="text-foreground">{alert.savedSearch.name}</span> on a {alert.cadenceLabel.toLowerCase()} cadence.
                  </p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {alert.savedSearch.summary.length > 0 ? (
                      alert.savedSearch.summary.map((item) => (
                        <span
                          key={item}
                          className="rounded-full border border-line bg-panel-strong px-3 py-1 text-xs text-muted"
                        >
                          {item}
                        </span>
                      ))
                    ) : (
                      <span className="rounded-full border border-line bg-panel-strong px-3 py-1 text-xs text-muted">
                        Default active-job search
                      </span>
                    )}
                  </div>

                  <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs uppercase tracking-[0.18em] text-muted">
                    <span>{alert.cadenceLabel}</span>
                    <span>
                      {alert.lastSentAt ? `Last run ${formatRelativeDays(alert.lastSentAt)}` : "No alert run recorded yet"}
                    </span>
                  </div>
                </div>

                <div className="rounded-[24px] border border-line bg-panel-strong p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Manage alert</p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <Link
                      href={alert.savedSearch.href}
                      className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition hover:opacity-90"
                    >
                      Open search
                    </Link>
                    <form action={runAlertNowAction}>
                      <input type="hidden" name="alertId" value={alert.id} />
                      <input type="hidden" name="returnTo" value="/alerts" />
                      <button
                        type="submit"
                        className="rounded-full border border-line-strong px-4 py-2 text-sm font-medium text-foreground transition hover:bg-panel"
                      >
                        Run now
                      </button>
                    </form>
                    <form action={updateAlertStatusAction}>
                      <input type="hidden" name="alertId" value={alert.id} />
                      <input type="hidden" name="returnTo" value="/alerts" />
                      <input type="hidden" name="status" value={alert.status === "ACTIVE" ? "PAUSED" : "ACTIVE"} />
                      <button
                        type="submit"
                        className="rounded-full border border-line-strong px-4 py-2 text-sm font-medium text-foreground transition hover:bg-panel"
                      >
                        {alert.status === "ACTIVE" ? "Pause" : "Resume"}
                      </button>
                    </form>
                    <form action={deleteAlertAction}>
                      <input type="hidden" name="alertId" value={alert.id} />
                      <input type="hidden" name="returnTo" value="/alerts" />
                      <button
                        type="submit"
                        className="rounded-full border border-line px-4 py-2 text-sm font-medium text-foreground transition hover:bg-panel"
                      >
                        Delete
                      </button>
                    </form>
                  </div>
                  <p className="mt-4 text-sm leading-6 text-muted">
                    This `MVP` alert slice now drives the updates page through real append-only execution history. Production deployments can refresh due alerts automatically through the same internal route and run records.
                  </p>
                </div>
              </div>

              <div className="mt-5">
                <AlertRunSummaryCard
                  latestRun={alert.latestRun}
                  latestDueRun={alert.latestDueRun}
                  recentRuns={alert.recentRuns}
                  dueNow={alert.dueNow}
                  autoRefreshStatus={alert.autoRefreshStatus}
                />
              </div>

              <div className="mt-5">
                <SavedSearchCheckCard
                  savedSearchId={alert.savedSearch.id}
                  returnTo="/alerts"
                  latestCheck={alert.savedSearch.latestCheck}
                  compact
                />
              </div>
            </article>
          ))}
        </section>
      ) : (
        <section className="panel-shadow rounded-[30px] border border-line bg-panel p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">No alerts yet</p>
          <h2 className="mt-2 font-heading text-2xl font-semibold text-foreground">Create one from a saved search</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-muted">
            Save a search first, then turn it into a monitored alert with a simple cadence so the product can evolve toward delivery later.
          </p>
          <Link
            href="/searches"
            className="mt-5 inline-flex rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background transition hover:opacity-90"
          >
            Go to saved searches
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
