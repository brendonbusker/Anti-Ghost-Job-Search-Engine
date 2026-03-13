import type { ReactNode } from "react";
import Link from "next/link";

import { runAlertNowAction } from "@/app/actions/alerts";
import { AlertUpdateJobCard } from "@/components/jobs/alert-update-job-card";
import { buildSignInHref, getViewerLabel } from "@/lib/auth";
import { formatRelativeDays } from "@/lib/format";
import { getAlertsPageData, type AlertView } from "@/lib/alerts";

export const dynamic = "force-dynamic";

export default async function UpdatesPage() {
  const { viewer, alerts, usingFallbackData } = await getAlertsPageData();
  const actionableAlerts = alerts
    .filter((alert) => isActionableAlert(alert))
    .sort(compareActionableAlerts);
  const quietAlerts = alerts
    .filter((alert) => !isActionableAlert(alert))
    .sort(compareRecentAlerts);
  const totalNewMatches = alerts.reduce(
    (sum, alert) => sum + (alert.savedSearch.latestCheck?.comparison?.newMatchesCount ?? 0),
    0,
  );
  const autoRefreshIssues = alerts.filter(
    (alert) => alert.autoRefreshStatus === "OVERDUE" || alert.autoRefreshStatus === "FAILING",
  ).length;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col gap-6 px-5 py-6 md:px-8">
      <header className="panel-shadow rounded-[34px] border border-line bg-panel px-6 py-6 md:px-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-4xl">
            <p className="font-heading text-xs font-semibold uppercase tracking-[0.34em] text-muted">Updates</p>
            <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-tight text-foreground md:text-6xl">
              Review what changed before you spend more application time.
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-8 text-muted md:text-lg">
              This `MVP` updates feed turns alert history into a usable daily loop for{" "}
              <span className="font-mono text-foreground">{getViewerLabel(viewer)}</span>: see which monitored searches changed,
              open the new matches, and jump straight to the official route when a role looks worth it.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 lg:max-w-4xl">
            <SummaryCard label="Alerts" value={String(alerts.length)} detail="Monitored searches currently configured for this user." />
            <SummaryCard label="Need attention" value={String(actionableAlerts.length)} detail="Alerts with new matches, due runs, setup gaps, or errors." />
            <SummaryCard label="New matches" value={String(totalNewMatches)} detail="Net new jobs across the latest successful checks." />
            <SummaryCard label="Auto issues" value={String(autoRefreshIssues)} detail="Alerts whose automatic due-batch refresh is overdue or failing." />
          </div>
        </div>
      </header>

      {usingFallbackData ? (
        <section className="rounded-[24px] border border-warning/30 bg-warning-soft px-5 py-4 text-sm text-warning">
          Alert updates could not load from the database right now.
        </section>
      ) : null}

      {!viewer ? (
        <section className="panel-shadow rounded-[30px] border border-line bg-panel p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Signed out</p>
          <h2 className="mt-2 font-heading text-2xl font-semibold text-foreground">Sign in to review monitored-search updates</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-muted">
            Updates are now tied to the signed-in user session, so you need to sign in before the app can show which monitored searches changed.
          </p>
          <Link
            href={buildSignInHref("/updates")}
            className="mt-5 inline-flex rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background transition hover:opacity-90"
          >
            Sign in
          </Link>
        </section>
      ) : alerts.length === 0 ? (
        <section className="panel-shadow rounded-[30px] border border-line bg-panel p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">No monitors yet</p>
          <h2 className="mt-2 font-heading text-2xl font-semibold text-foreground">Create an alert from a saved search first</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-muted">
            Once a saved search becomes an alert, this page turns into the daily review queue for what is new, stable, or worth reopening.
          </p>
          <Link
            href="/searches"
            className="mt-5 inline-flex rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background transition hover:opacity-90"
          >
            Go to saved searches
          </Link>
        </section>
      ) : (
        <>
          {actionableAlerts.length > 0 ? (
            <section className="space-y-5">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Need attention</p>
                  <h2 className="mt-2 font-heading text-2xl font-semibold text-foreground">Start here</h2>
                </div>
                <Link
                  href="/alerts"
                  className="rounded-full border border-line-strong px-4 py-2 text-sm font-medium text-foreground transition hover:bg-panel"
                >
                  Open alert settings
                </Link>
              </div>

              {actionableAlerts.map((alert) => (
                <AlertUpdateSection key={alert.id} alert={alert} signedIn />
              ))}
            </section>
          ) : null}

          {quietAlerts.length > 0 ? (
            <section className="panel-shadow rounded-[30px] border border-line bg-panel p-6">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Quiet right now</p>
                  <h2 className="mt-2 font-heading text-2xl font-semibold text-foreground">Monitors without immediate changes</h2>
                </div>
                <p className="max-w-2xl text-sm leading-7 text-muted">
                  These alerts are configured and have recent history, but their latest successful checks do not currently show new matches or errors.
                </p>
              </div>

              <div className="mt-5 space-y-3">
                {quietAlerts.map((alert) => {
                  const comparison = alert.savedSearch.latestCheck?.comparison;

                  return (
                    <div
                      key={alert.id}
                      className="flex flex-col gap-3 rounded-[24px] border border-line bg-panel-strong p-4 lg:flex-row lg:items-center lg:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-heading text-xl font-semibold text-foreground">{alert.name}</p>
                          <StatusPill tone={alert.status === "ACTIVE" ? "success" : "default"}>
                            {alert.status.toLowerCase()}
                          </StatusPill>
                        </div>
                        <p className="mt-2 text-sm text-muted">
                          {comparison
                            ? `Latest check ${formatRelativeDays(alert.savedSearch.latestCheck!.checkedAt)}: ${comparison.newMatchesCount} new and ${comparison.droppedMatchesCount} dropped.`
                            : alert.savedSearch.latestCheck
                              ? `Latest check ${formatRelativeDays(alert.savedSearch.latestCheck.checkedAt)} recorded a baseline with ${alert.savedSearch.latestCheck.matchedJobCount} matches.`
                              : "No check recorded yet."}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-3">
                        <Link
                          href={alert.savedSearch.href}
                          className="rounded-full border border-line-strong px-4 py-2 text-sm font-medium text-foreground transition hover:bg-panel"
                        >
                          Open search
                        </Link>
                        <Link
                          href="/alerts"
                          className="rounded-full border border-line px-4 py-2 text-sm font-medium text-foreground transition hover:bg-panel"
                        >
                          Alert settings
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}
        </>
      )}
    </main>
  );
}

function AlertUpdateSection({
  alert,
  signedIn,
}: {
  alert: AlertView;
  signedIn: boolean;
}) {
  const latestCheck = alert.savedSearch.latestCheck;
  const comparison = latestCheck?.comparison;
  const newMatchesCount = comparison?.newMatchesCount ?? 0;
  const showingCount = latestCheck?.topNewMatches.length ?? 0;
  const latestRunFailed = alert.latestRun?.status === "ERROR";
  const needsFirstCheck = latestCheck === null;
  const autoRefreshIssue = alert.autoRefreshStatus === "OVERDUE" || alert.autoRefreshStatus === "FAILING";

  return (
    <article className="panel-shadow rounded-[30px] border border-line bg-panel p-6">
      <div className="flex flex-col gap-6 xl:grid xl:grid-cols-[minmax(0,1.2fr)_340px]">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <p className="font-heading text-2xl font-semibold text-foreground">{alert.name}</p>
            <StatusPill tone={alert.status === "ACTIVE" ? "success" : "default"}>{alert.status.toLowerCase()}</StatusPill>
            {alert.dueNow ? <StatusPill tone="warning">due now</StatusPill> : null}
            {latestRunFailed ? <StatusPill tone="danger">latest run failed</StatusPill> : null}
            {autoRefreshIssue ? <StatusPill tone="warning">auto refresh issue</StatusPill> : null}
            {newMatchesCount > 0 ? <StatusPill tone="success">{newMatchesCount} new</StatusPill> : null}
          </div>

          <p className="mt-3 text-sm leading-7 text-muted">
            Watching <span className="text-foreground">{alert.savedSearch.name}</span> on a {alert.cadenceLabel.toLowerCase()} cadence.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {alert.savedSearch.summary.length > 0 ? (
              alert.savedSearch.summary.map((item) => (
                <span key={item} className="rounded-full border border-line bg-panel-strong px-3 py-1 text-xs text-muted">
                  {item}
                </span>
              ))
            ) : (
              <span className="rounded-full border border-line bg-panel-strong px-3 py-1 text-xs text-muted">
                Default active-job search
              </span>
            )}
          </div>

          <div className="mt-5 rounded-[24px] border border-line bg-panel-strong p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Latest change</p>
            {needsFirstCheck ? (
              <p className="mt-3 text-sm leading-6 text-muted">
                This alert has not recorded a baseline yet. Run it once to capture the first snapshot and make future changes visible.
              </p>
            ) : autoRefreshIssue ? (
              <p className="mt-3 text-sm leading-6 text-warning">
                {alert.autoRefreshStatus === "FAILING"
                  ? "Automatic due-batch refresh is failing. The alert may still have manual history, but the scheduled monitor path needs attention."
                  : "Automatic due-batch refresh is overdue. Manual runs may be keeping this search fresh, but the scheduled monitor path has not kept up."}
              </p>
            ) : latestRunFailed ? (
              <p className="mt-3 text-sm leading-6 text-danger">
                The latest run failed {formatRelativeDays(alert.latestRun!.startedAt)}. Re-run it to restore fresh monitoring history.
              </p>
            ) : comparison ? (
              <>
                <p className="mt-3 text-sm leading-6 text-foreground">
                  Latest successful check {formatRelativeDays(latestCheck.checkedAt)} found {newMatchesCount} new matches and{" "}
                  {comparison.droppedMatchesCount} dropped since {formatRelativeDays(comparison.previousCheckedAt)}.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <MetricPill label={`${latestCheck.matchedJobCount} matches`} tone="default" />
                  <MetricPill label={`${newMatchesCount} new`} tone={newMatchesCount > 0 ? "success" : "default"} />
                  <MetricPill label={`${comparison.droppedMatchesCount} dropped`} tone={comparison.droppedMatchesCount > 0 ? "warning" : "default"} />
                  <MetricPill label={`${latestCheck.applyNowCount} apply now`} tone="success" />
                  <MetricPill label={`${latestCheck.officialSourceCount} official route`} tone="default" />
                </div>
              </>
            ) : (
              <>
                <p className="mt-3 text-sm leading-6 text-foreground">
                  Latest check {formatRelativeDays(latestCheck.checkedAt)} recorded a baseline with {latestCheck.matchedJobCount} matches.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <MetricPill label={`${latestCheck.matchedJobCount} matches`} tone="default" />
                  <MetricPill label={`${latestCheck.applyNowCount} apply now`} tone="success" />
                  <MetricPill label={`${latestCheck.officialSourceCount} official route`} tone="default" />
                </div>
              </>
            )}
          </div>
        </div>

        <div className="rounded-[24px] border border-line bg-panel-strong p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Next action</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href={alert.savedSearch.href}
              className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition hover:opacity-90"
            >
              Open search
            </Link>
            <form action={runAlertNowAction}>
              <input type="hidden" name="alertId" value={alert.id} />
              <input type="hidden" name="returnTo" value="/updates" />
              <button
                type="submit"
                className="rounded-full border border-line-strong px-4 py-2 text-sm font-medium text-foreground transition hover:bg-panel"
              >
                {needsFirstCheck || alert.dueNow || latestRunFailed ? "Run now" : "Refresh now"}
              </button>
            </form>
            <Link
              href="/alerts"
              className="rounded-full border border-line px-4 py-2 text-sm font-medium text-foreground transition hover:bg-panel"
            >
              Alert settings
            </Link>
          </div>
          <p className="mt-4 text-sm leading-6 text-muted">
            {newMatchesCount > 0
              ? "Open the new matches first, then save the best ones or jump straight to the official apply route."
              : autoRefreshIssue
                ? "Open alert settings, confirm the deployment scheduler is running, and use Run now if you need an immediate refresh."
              : latestRunFailed
                ? "This alert needs a successful run before its updates feed is trustworthy again."
                : needsFirstCheck
                  ? "Capture the first snapshot now so later runs can show what changed."
                  : "No new matches right now, but you can re-run the monitor whenever you want a fresh read."}
          </p>
        </div>
      </div>

      {newMatchesCount > 0 && latestCheck?.topNewMatches.length ? (
        <div className="mt-6 rounded-[24px] border border-line bg-panel-strong p-4">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">New matches</p>
              <p className="mt-2 text-sm leading-6 text-muted">
                Showing {showingCount} of {newMatchesCount} newly surfaced jobs from the latest successful check.
              </p>
            </div>
            <Link
              href={alert.savedSearch.href}
              className="rounded-full border border-line-strong px-4 py-2 text-sm font-medium text-foreground transition hover:bg-panel"
            >
              Open full search
            </Link>
          </div>

          <div className="mt-4 space-y-4">
            {latestCheck.topNewMatches.map((job) => (
              <AlertUpdateJobCard key={job.id} job={job} returnTo="/updates" signedIn={signedIn} />
            ))}
          </div>
        </div>
      ) : null}
    </article>
  );
}

function isActionableAlert(alert: AlertView): boolean {
  if (alert.latestRun?.status === "ERROR") {
    return true;
  }

  if (alert.autoRefreshStatus === "OVERDUE" || alert.autoRefreshStatus === "FAILING") {
    return true;
  }

  if (alert.savedSearch.latestCheck === null) {
    return true;
  }

  if ((alert.savedSearch.latestCheck.comparison?.newMatchesCount ?? 0) > 0) {
    return true;
  }

  return alert.dueNow;
}

function compareActionableAlerts(left: AlertView, right: AlertView): number {
  return (
    actionRank(right) - actionRank(left) ||
    (right.savedSearch.latestCheck?.comparison?.newMatchesCount ?? 0) -
      (left.savedSearch.latestCheck?.comparison?.newMatchesCount ?? 0) ||
    timestampForAlert(right) - timestampForAlert(left)
  );
}

function compareRecentAlerts(left: AlertView, right: AlertView): number {
  return timestampForAlert(right) - timestampForAlert(left);
}

function actionRank(alert: AlertView): number {
  if (alert.latestRun?.status === "ERROR") {
    return 4;
  }

  if (alert.autoRefreshStatus === "FAILING") {
    return 3;
  }

  if ((alert.savedSearch.latestCheck?.comparison?.newMatchesCount ?? 0) > 0) {
    return 2;
  }

  if (alert.autoRefreshStatus === "OVERDUE") {
    return 1;
  }

  if (alert.savedSearch.latestCheck === null) {
    return 1;
  }

  return 0;
}

function timestampForAlert(alert: AlertView): number {
  return new Date(
    alert.latestRun?.startedAt ??
      alert.savedSearch.latestCheck?.checkedAt ??
      alert.lastSentAt ??
      "1970-01-01T00:00:00.000Z",
  ).getTime();
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

function StatusPill({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "default" | "success" | "warning" | "danger";
}) {
  const className =
    tone === "success"
      ? "border-success/25 bg-success-soft text-success"
      : tone === "warning"
        ? "border-warning/20 bg-warning-soft text-warning"
        : tone === "danger"
          ? "border-danger/25 bg-danger-soft text-danger"
          : "border-line bg-panel-strong text-muted";

  return (
    <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em] ${className}`}>
      {children}
    </span>
  );
}

function MetricPill({
  label,
  tone,
}: {
  label: string;
  tone: "default" | "success" | "warning";
}) {
  const className =
    tone === "success"
      ? "border-success/25 bg-success-soft text-success"
      : tone === "warning"
        ? "border-warning/20 bg-warning-soft text-warning"
        : "border-line bg-panel text-muted";

  return (
    <span className={`rounded-full border px-3 py-1 text-xs uppercase tracking-[0.16em] ${className}`}>
      {label}
    </span>
  );
}
