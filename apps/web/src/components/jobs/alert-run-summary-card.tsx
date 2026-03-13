import type { AlertRunSummary } from "@/lib/alert-execution";
import { formatRelativeDays } from "@/lib/format";

type AlertRunSummaryCardProps = {
  latestRun: AlertRunSummary | null;
  latestDueRun: AlertRunSummary | null;
  recentRuns: AlertRunSummary[];
  dueNow: boolean;
  autoRefreshStatus: "HEALTHY" | "WAITING" | "OVERDUE" | "FAILING" | "PAUSED";
};

export function AlertRunSummaryCard({
  latestRun,
  latestDueRun,
  recentRuns,
  dueNow,
  autoRefreshStatus,
}: AlertRunSummaryCardProps) {
  return (
    <div className="rounded-[24px] border border-line bg-panel p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Latest run</p>
        <span
          className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em] ${
            dueNow
              ? "border-warning/20 bg-warning-soft text-warning"
              : "border-line bg-panel-strong text-muted"
          }`}
        >
          {dueNow ? "Due now" : "Up to date"}
        </span>
      </div>

      <div className="mt-3 rounded-[20px] border border-line bg-panel-strong p-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Automatic refresh</p>
          <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em] ${getAutoRefreshClasses(autoRefreshStatus)}`}>
            {getAutoRefreshLabel(autoRefreshStatus)}
          </span>
        </div>
        <p className="mt-3 text-sm leading-6 text-muted">
          {getAutoRefreshDetail(autoRefreshStatus, latestDueRun)}
        </p>
      </div>

      {latestRun ? (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em] ${
                latestRun.status === "SUCCESS"
                  ? "border-success/25 bg-success-soft text-success"
                  : "border-danger/25 bg-danger-soft text-danger"
              }`}
            >
              {latestRun.status.toLowerCase()}
            </span>
            <span className="rounded-full border border-line bg-panel-strong px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-muted">
              {latestRun.trigger === "MANUAL" ? "manual run" : "due batch"}
            </span>
          </div>

          <p className="mt-3 text-sm leading-6 text-foreground">
            Ran {formatRelativeDays(latestRun.startedAt)} with {latestRun.matchedJobCount} matches, {latestRun.newMatchesCount} new, and{" "}
            {latestRun.droppedMatchesCount} dropped.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <MetricPill label={`${latestRun.applyNowCount} apply now`} tone="success" />
            <MetricPill label={`${latestRun.applySoonCount} apply soon`} tone="default" />
            <MetricPill label={`${latestRun.officialSourceCount} official route`} tone="default" />
          </div>

          {latestRun.errorMessage ? (
            <p className="mt-4 text-sm leading-6 text-danger">{latestRun.errorMessage}</p>
          ) : null}
        </>
      ) : (
        <p className="mt-3 text-sm leading-6 text-muted">
          No alert run has been recorded yet. Use Run now or the due-run command to start execution history.
        </p>
      )}

      {recentRuns.length > 1 ? (
        <div className="mt-5 rounded-[20px] border border-line bg-panel-strong p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Recent runs</p>
          <div className="mt-4 space-y-3">
            {recentRuns.map((run) => (
              <div
                key={run.id}
                className="flex flex-col gap-2 rounded-[18px] border border-line bg-panel p-4 lg:flex-row lg:items-center lg:justify-between"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {run.trigger === "MANUAL" ? "Manual run" : "Due batch"} {formatRelativeDays(run.startedAt)}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {run.matchedJobCount} matches · {run.newMatchesCount} new · {run.droppedMatchesCount} dropped
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span
                    className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em] ${
                      run.status === "SUCCESS"
                        ? "border-success/25 bg-success-soft text-success"
                        : "border-danger/25 bg-danger-soft text-danger"
                    }`}
                  >
                    {run.status.toLowerCase()}
                  </span>
                  <MetricPill label={`${run.applyNowCount} apply now`} tone="success" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MetricPill({
  label,
  tone,
}: {
  label: string;
  tone: "default" | "success";
}) {
  const className =
    tone === "success"
      ? "border-success/25 bg-success-soft text-success"
      : "border-line bg-panel-strong text-muted";

  return (
    <span className={`rounded-full border px-3 py-1 text-xs uppercase tracking-[0.16em] ${className}`}>
      {label}
    </span>
  );
}

function getAutoRefreshLabel(status: AlertRunSummaryCardProps["autoRefreshStatus"]) {
  switch (status) {
    case "HEALTHY":
      return "healthy";
    case "WAITING":
      return "waiting";
    case "OVERDUE":
      return "overdue";
    case "FAILING":
      return "failing";
    case "PAUSED":
      return "paused";
  }
}

function getAutoRefreshClasses(status: AlertRunSummaryCardProps["autoRefreshStatus"]) {
  switch (status) {
    case "HEALTHY":
      return "border-success/25 bg-success-soft text-success";
    case "WAITING":
      return "border-line bg-panel text-muted";
    case "OVERDUE":
      return "border-warning/20 bg-warning-soft text-warning";
    case "FAILING":
      return "border-danger/25 bg-danger-soft text-danger";
    case "PAUSED":
      return "border-line bg-panel text-muted";
  }
}

function getAutoRefreshDetail(
  status: AlertRunSummaryCardProps["autoRefreshStatus"],
  latestDueRun: AlertRunSummary | null,
) {
  switch (status) {
    case "HEALTHY":
      return latestDueRun
        ? `Latest due batch succeeded ${formatRelativeDays(latestDueRun.startedAt)}.`
        : "Automatic refresh is keeping this alert current.";
    case "WAITING":
      return "No due batch has needed to run yet. The alert is active and waiting for its first schedule window.";
    case "OVERDUE":
      return latestDueRun
        ? `The latest due batch ran ${formatRelativeDays(latestDueRun.startedAt)}, and another scheduled refresh is now due.`
        : "No automatic due batch has been recorded yet even though the alert has reached a scheduled window.";
    case "FAILING":
      return latestDueRun
        ? `The latest due batch failed ${formatRelativeDays(latestDueRun.startedAt)}.`
        : "The latest automatic refresh failed.";
    case "PAUSED":
      return "This alert is paused, so automatic refresh is intentionally inactive.";
  }
}
