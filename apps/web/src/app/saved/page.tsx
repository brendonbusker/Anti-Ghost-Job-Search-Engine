import Link from "next/link";

import { SavedJobNoteForm } from "@/components/jobs/saved-job-note-form";
import { SaveJobToggle } from "@/components/jobs/save-job-toggle";
import { Badge } from "@/components/ui/badge";
import { buildSignInHref, getViewerLabel } from "@/lib/auth";
import { formatRelativeDays, formatSalaryRange } from "@/lib/format";
import { getSavedJobsPageData } from "@/lib/jobs";
import {
  getFreshnessMetadata,
  getOfficialSourceMetadata,
  getPriorityMetadata,
  getTrustMetadata,
} from "@/lib/label-metadata";

export const dynamic = "force-dynamic";

export default async function SavedJobsPage() {
  const { viewer, jobs, usingFallbackData } = await getSavedJobsPageData();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col gap-6 px-5 py-6 md:px-8">
      <header className="panel-shadow rounded-[34px] border border-line bg-panel px-6 py-6 md:px-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-4xl">
            <p className="font-heading text-xs font-semibold uppercase tracking-[0.34em] text-muted">Saved jobs</p>
            <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-tight text-foreground md:text-6xl">
              Keep the shortlist tight and actionable.
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-8 text-muted md:text-lg">
              This is the current `MVP` shortlist flow for <span className="font-mono text-foreground">{getViewerLabel(viewer)}</span>:
              signed-in users can save promising roles, leave a quick note, and return straight to the official route when it is time to apply.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-3 lg:max-w-2xl">
            <SummaryCard label="Saved now" value={String(jobs.length)} detail="Current shortlist size for the local MVP user." />
            <SummaryCard
              label="Apply now"
              value={String(jobs.filter((job) => job.priorityLabel === "APPLY_NOW").length)}
              detail="Saved jobs the scorer currently treats as strongest-time-to-apply candidates."
            />
            <SummaryCard
              label="Official routes"
              value={String(jobs.filter((job) => job.officialSourceStatus !== "MISSING").length)}
              detail="Saved jobs that already route to an official page or trusted ATS destination."
            />
          </div>
        </div>
      </header>

      {usingFallbackData ? (
        <section className="rounded-[24px] border border-warning/30 bg-warning-soft px-5 py-4 text-sm text-warning">
          Database-backed saved jobs are unavailable right now, so the shortlist workflow cannot load.
        </section>
      ) : null}

      {!viewer ? (
        <section className="panel-shadow rounded-[30px] border border-line bg-panel p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Signed out</p>
          <h2 className="mt-2 font-heading text-2xl font-semibold text-foreground">Sign in to keep a shortlist</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-muted">
            Saved jobs now belong to a real signed-in user session, so you need to sign in before the app can keep your shortlist.
          </p>
          <Link
            href={buildSignInHref("/saved")}
            className="mt-5 inline-flex rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background transition hover:opacity-90"
          >
            Sign in
          </Link>
        </section>
      ) : jobs.length > 0 ? (
        <section className="space-y-5">
          {jobs.map((job) => {
            const trust = getTrustMetadata(job.trustLabel);
            const freshness = getFreshnessMetadata(job.freshnessLabel);
            const priority = getPriorityMetadata(job.priorityLabel);
            const official = getOfficialSourceMetadata(job.officialSourceStatus);

            return (
              <article key={job.id} className="panel-shadow rounded-[30px] border border-line bg-panel p-6">
                <div className="flex flex-col gap-6 xl:grid xl:grid-cols-[minmax(0,1.15fr)_360px]">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <Link href={`/jobs/${job.slug}`} className="font-heading text-2xl font-semibold text-foreground">
                        {job.title}
                      </Link>
                      <Badge tone={official.tone} detail={official.detail}>
                        {official.text}
                      </Badge>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
                      <span>{job.company}</span>
                      <span>{job.location}</span>
                      <span>{job.remoteType.toLowerCase()}</span>
                      <span>{formatSalaryRange(job.salary)}</span>
                    </div>

                    <p className="mt-4 max-w-4xl text-sm leading-7 text-foreground">{job.reasonSummary}</p>

                    <div className="mt-5 flex flex-wrap gap-2">
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

                    <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs uppercase tracking-[0.18em] text-muted">
                      <span>Saved {job.savedJob ? formatRelativeDays(job.savedJob.savedAt) : "just now"}</span>
                      <span>First seen {formatRelativeDays(job.firstSeenAt)}</span>
                      <span>Last checked {formatRelativeDays(job.lastSeenAt)}</span>
                      <span>{job.sources.length} sources</span>
                    </div>

                    <div className="mt-5 flex flex-wrap gap-3">
                      <SaveJobToggle canonicalJobId={job.id} isSaved returnTo="/saved" signedIn compact />
                      <Link
                        href={`/jobs/${job.slug}`}
                        className="rounded-full border border-line-strong px-4 py-2 text-sm font-medium text-foreground transition hover:bg-panel-strong"
                      >
                        Open detail
                      </Link>
                      {job.officialSourceUrl ? (
                        <a
                          href={job.officialSourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition hover:opacity-90"
                        >
                          Official apply
                        </a>
                      ) : null}
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-line bg-panel-strong p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Shortlist note</p>
                    <p className="mt-3 text-sm leading-6 text-muted">
                      Capture what made this worth saving, who referred it, or what still needs verification before you apply.
                    </p>
                    <div className="mt-5">
                      <SavedJobNoteForm canonicalJobId={job.id} note={job.savedJob?.note ?? null} returnTo="/saved" />
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      ) : (
        <section className="panel-shadow rounded-[30px] border border-line bg-panel p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">No saved jobs yet</p>
          <h2 className="mt-2 font-heading text-2xl font-semibold text-foreground">Start a shortlist from the search page</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-muted">
            Save the jobs that look trustworthy and timely, then come back here to track what to apply to first.
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
