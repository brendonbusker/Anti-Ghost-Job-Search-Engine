import Link from "next/link";

import { checkSavedSearchAction } from "@/app/actions/saved-searches";
import { Badge } from "@/components/ui/badge";
import { formatRelativeDays } from "@/lib/format";
import { getOfficialSourceMetadata, getPriorityMetadata } from "@/lib/label-metadata";
import type { SavedSearchCheckSummary } from "@/lib/saved-search-checks";

type SavedSearchCheckCardProps = {
  savedSearchId: string;
  returnTo: string;
  latestCheck: SavedSearchCheckSummary | null;
  compact?: boolean;
};

export function SavedSearchCheckCard({
  savedSearchId,
  returnTo,
  latestCheck,
  compact = false,
}: SavedSearchCheckCardProps) {
  return (
    <div className="rounded-[24px] border border-line bg-panel-strong p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Check status</p>
          {latestCheck ? (
            <>
              <p className="mt-2 text-sm leading-6 text-foreground">
                Last checked {formatRelativeDays(latestCheck.checkedAt)} with {latestCheck.matchedJobCount} matching jobs.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <MetricPill label={`${latestCheck.matchedJobCount} matches`} tone="default" />
                <MetricPill label={`${latestCheck.applyNowCount} apply now`} tone="success" />
                <MetricPill label={`${latestCheck.applySoonCount} apply soon`} tone="default" />
                <MetricPill label={`${latestCheck.officialSourceCount} official route`} tone="default" />
                {latestCheck.trend ? (
                  <MetricPill
                    label={`${latestCheck.trend.direction} across ${latestCheck.trend.windowChecks} checks`}
                    tone={
                      latestCheck.trend.direction === "growing"
                        ? "success"
                        : latestCheck.trend.direction === "shrinking"
                          ? "warning"
                          : "default"
                    }
                  />
                ) : null}
                {latestCheck.comparison ? (
                  <>
                    <MetricPill label={`${latestCheck.comparison.newMatchesCount} new`} tone="success" />
                    <MetricPill label={`${latestCheck.comparison.droppedMatchesCount} dropped`} tone="warning" />
                  </>
                ) : (
                  <MetricPill label="Baseline recorded" tone="default" />
                )}
              </div>
              <p className="mt-4 text-sm leading-6 text-muted">
                {latestCheck.comparison
                  ? `Compared with the check from ${formatRelativeDays(latestCheck.comparison.previousCheckedAt)}.`
                  : "This is the first recorded baseline for this saved search."}
              </p>
              {latestCheck.trend ? (
                <p className="mt-2 text-sm leading-6 text-muted">
                  Over the last {latestCheck.trend.windowChecks} checks, matches changed by {formatSignedNumber(latestCheck.trend.deltaMatches)}
                  , apply-now roles by {formatSignedNumber(latestCheck.trend.deltaApplyNow)}, and official routes by{" "}
                  {formatSignedNumber(latestCheck.trend.deltaOfficialSourceCount)}.
                </p>
              ) : null}
            </>
          ) : (
            <>
              <p className="mt-2 text-sm leading-6 text-muted">
                No check has been recorded yet. Run one now to capture a baseline and make later alert changes visible.
              </p>
            </>
          )}
        </div>

        <form action={checkSavedSearchAction}>
          <input type="hidden" name="savedSearchId" value={savedSearchId} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <button
            type="submit"
            className="rounded-full border border-line-strong px-5 py-3 text-sm font-medium text-foreground transition hover:bg-panel"
          >
            {latestCheck ? "Check again" : "Run first check"}
          </button>
        </form>
      </div>

      {!compact && latestCheck?.topNewMatches.length ? (
        <div className="mt-5 rounded-[20px] border border-line bg-panel p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">New matches since the last check</p>
          <div className="mt-4 space-y-3">
            {latestCheck.topNewMatches.map((job) => {
              const priority = getPriorityMetadata(job.priorityLabel);
              const official = getOfficialSourceMetadata(job.officialSourceStatus);

              return (
                <div
                  key={job.id}
                  className="flex flex-col gap-3 rounded-[18px] border border-line bg-panel-strong p-4 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/jobs/${job.slug}`}
                      className="font-medium text-foreground transition hover:text-accent"
                    >
                      {job.title}
                    </Link>
                    <p className="mt-1 text-sm text-muted">
                      {job.company} - {job.location}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={priority.tone} detail={priority.detail}>
                      {priority.text}
                    </Badge>
                    <Badge tone={official.tone} detail={official.detail}>
                      {official.text}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {!compact && latestCheck && latestCheck.recentChecks.length > 1 ? (
        <div className="mt-5 rounded-[20px] border border-line bg-panel p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Recent history</p>
          <div className="mt-4 space-y-3">
            {latestCheck.recentChecks.map((check) => (
              <div
                key={check.checkedAt}
                className="flex flex-col gap-2 rounded-[18px] border border-line bg-panel-strong p-4 lg:flex-row lg:items-center lg:justify-between"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">Checked {formatRelativeDays(check.checkedAt)}</p>
                  <p className="mt-1 text-sm text-muted">
                    {check.matchedJobCount} matches · {check.applyNowCount} apply now · {check.officialSourceCount} official route
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <MetricPill label={`${check.matchedJobCount} matches`} tone="default" />
                  <MetricPill label={`${check.applyNowCount} apply now`} tone="success" />
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

function formatSignedNumber(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}
