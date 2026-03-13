import Link from "next/link";
import { notFound } from "next/navigation";

import { SaveJobToggle } from "@/components/jobs/save-job-toggle";
import { Badge } from "@/components/ui/badge";
import { getCurrentUser } from "@/lib/auth";
import { formatRelativeDays, formatSalaryRange } from "@/lib/format";
import { getJobDetailBySlug } from "@/lib/jobs";
import {
  getFreshnessMetadata,
  getOfficialSourceMetadata,
  getPriorityMetadata,
  getTrustMetadata,
} from "@/lib/label-metadata";

export const dynamic = "force-dynamic";

type JobDetailPageProps = {
  params: Promise<{
    jobId: string;
  }>;
};

export default async function JobDetailPage({ params }: JobDetailPageProps) {
  const { jobId } = await params;
  const viewer = await getCurrentUser();
  const { job, usingFallbackData } = await getJobDetailBySlug(jobId);

  if (!job) {
    notFound();
  }

  const trust = getTrustMetadata(job.trustLabel);
  const freshness = getFreshnessMetadata(job.freshnessLabel);
  const priority = getPriorityMetadata(job.priorityLabel);
  const official = getOfficialSourceMetadata(job.officialSourceStatus);
  const detailPath = `/jobs/${jobId}`;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-5 py-8 md:px-8">
      {usingFallbackData ? (
        <section className="rounded-[24px] border border-warning/30 bg-warning-soft px-5 py-4 text-sm text-warning">
          Database-backed detail data is unavailable right now, so this page is showing fallback sample data and save actions are paused.
        </section>
      ) : null}

      <header className="panel-shadow rounded-[30px] border border-line bg-panel p-6">
        <Link
          href="/"
          className="text-xs font-semibold uppercase tracking-[0.22em] text-muted transition hover:text-foreground"
        >
          Back to search
        </Link>

        <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-4xl">
            <p className="font-heading text-3xl font-semibold text-foreground">{job.title}</p>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
              <span>{job.company}</span>
              <span>{job.location}</span>
              <span>{job.remoteType.toLowerCase()}</span>
              <span>{formatSalaryRange(job.salary)}</span>
            </div>
            <p className="mt-4 text-sm leading-7 text-foreground">{job.overview}</p>
            {job.savedJob ? (
              <p className="mt-4 text-sm text-muted">
                Saved {formatRelativeDays(job.savedJob.savedAt)}
                {job.savedJob.note ? ` - ${job.savedJob.note}` : "."}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-3">
            {!usingFallbackData ? (
              <SaveJobToggle
                canonicalJobId={job.id}
                isSaved={job.savedJob !== null}
                returnTo={detailPath}
                signedIn={viewer !== null}
              />
            ) : null}
            {job.officialSourceUrl ? (
              <a
                href={job.officialSourceUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background transition hover:opacity-90"
              >
                Open official application
              </a>
            ) : (
              <span className="rounded-full border border-warning/30 bg-warning-soft px-5 py-3 text-sm font-medium text-warning">
                Official route still missing
              </span>
            )}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Badge tone={official.tone} detail={official.detail}>
            {official.text}
          </Badge>
          <Badge tone={trust.tone} detail={trust.detail}>
            {trust.text}
          </Badge>
          <Badge tone={freshness.tone} detail={freshness.detail}>
            {freshness.text}
          </Badge>
          <Badge tone={priority.tone} detail={priority.detail}>
            {priority.text}
          </Badge>
        </div>
      </header>

      <section className="grid gap-6 lg:grid-cols-[1.3fr_0.9fr]">
        <div className="space-y-6">
          <article className="panel-shadow rounded-[28px] border border-line bg-panel p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Decision snapshot</p>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <SnapshotBlock label="Why trust it" value={job.trustReasons[0] ?? "No trust reason recorded yet."} />
              <SnapshotBlock label="Why now" value={job.priorityReasons[0] ?? "No priority reason recorded yet."} />
              <SnapshotBlock
                label="What to verify"
                value={job.redFlags[0] ?? (job.officialSourceStatus === "MISSING" ? "Official route still needs confirmation." : "No major caution flag is visible right now.")}
              />
            </div>
          </article>

          <article className="panel-shadow rounded-[28px] border border-line bg-panel p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Trust evidence</p>
            <ul className="mt-4 space-y-3 text-sm leading-7 text-foreground">
              {job.trustReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </article>

          <article className="panel-shadow rounded-[28px] border border-line bg-panel p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Freshness evidence</p>
            <ul className="mt-4 space-y-3 text-sm leading-7 text-foreground">
              {job.freshnessReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </article>

          <article className="panel-shadow rounded-[28px] border border-line bg-panel p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Listing history</p>
            <div className="mt-4 flex flex-wrap gap-3 text-xs uppercase tracking-[0.18em] text-muted">
              <span>First seen {formatRelativeDays(job.firstSeenAt)}</span>
              <span>Last checked {formatRelativeDays(job.lastSeenAt)}</span>
              <span>{job.repostCount} repost cycles</span>
            </div>
            <ul className="mt-4 space-y-3 text-sm leading-7 text-foreground">
              {job.listingHistory.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        </div>

        <div className="space-y-6">
          <article className="panel-shadow rounded-[28px] border border-line bg-panel p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Source routing</p>
            <p className="mt-4 text-sm leading-7 text-foreground">
              {job.officialSourceStatus === "FOUND"
                ? "An official company-owned route is available."
                : job.officialSourceStatus === "ATS_ONLY"
                  ? "A trusted ATS route is available, but the company page was not confirmed separately."
                  : "No official route has been confirmed yet."}
            </p>
            {job.officialSourceUrl ? (
              <a
                href={job.officialSourceUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex rounded-full border border-line-strong px-4 py-2 text-sm font-medium text-foreground transition hover:bg-panel-strong"
              >
                Open official route
              </a>
            ) : null}
          </article>

          <article className="panel-shadow rounded-[28px] border border-line bg-panel p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Seen on</p>
            <ul className="mt-4 space-y-4">
              {job.sources.map((source) => (
                <li key={source.url} className="rounded-2xl border border-line bg-panel-strong p-4">
                  <p className="font-medium text-foreground">{source.name}</p>
                  <p className="mt-1 text-sm text-muted">{source.kind}</p>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex text-sm font-medium text-accent"
                  >
                    Open source
                  </a>
                </li>
              ))}
            </ul>
          </article>

          <article className="panel-shadow rounded-[28px] border border-line bg-panel p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Priority reasons</p>
            <ul className="mt-4 space-y-3 text-sm leading-7 text-foreground">
              {job.priorityReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </article>

          <article className="panel-shadow rounded-[28px] border border-line bg-panel p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Red flags</p>
            {job.redFlags.length ? (
              <ul className="mt-4 space-y-3 text-sm leading-7 text-danger">
                {job.redFlags.map((flag) => (
                  <li key={flag}>{flag}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm leading-7 text-muted">No major caution flags are visible in this current record.</p>
            )}
          </article>
        </div>
      </section>
    </main>
  );
}

function SnapshotBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-line bg-panel-strong p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{label}</p>
      <p className="mt-3 text-sm leading-6 text-foreground">{value}</p>
    </div>
  );
}
