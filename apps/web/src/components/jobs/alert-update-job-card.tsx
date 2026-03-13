import Link from "next/link";

import type { JobSearchResult } from "@anti-ghost/domain";

import { SaveJobToggle } from "@/components/jobs/save-job-toggle";
import { Badge } from "@/components/ui/badge";
import { formatRelativeDays, formatSalaryRange } from "@/lib/format";
import {
  getFreshnessMetadata,
  getOfficialSourceMetadata,
  getPriorityMetadata,
  getTrustMetadata,
} from "@/lib/label-metadata";

type AlertUpdateJobCardProps = {
  job: JobSearchResult;
  returnTo: string;
  signedIn: boolean;
};

export function AlertUpdateJobCard({
  job,
  returnTo,
  signedIn,
}: AlertUpdateJobCardProps) {
  const trust = getTrustMetadata(job.trustLabel);
  const freshness = getFreshnessMetadata(job.freshnessLabel);
  const priority = getPriorityMetadata(job.priorityLabel);
  const official = getOfficialSourceMetadata(job.officialSourceStatus);

  return (
    <article className="rounded-[24px] border border-line bg-panel p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/jobs/${job.slug}`}
              className="font-heading text-xl font-semibold text-foreground transition hover:text-accent"
            >
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

          <p className="mt-4 text-sm leading-7 text-foreground">{job.reasonSummary}</p>

          <div className="mt-4 flex flex-wrap gap-2">
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

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs uppercase tracking-[0.18em] text-muted">
            <span>First seen {formatRelativeDays(job.firstSeenAt)}</span>
            <span>Last checked {formatRelativeDays(job.lastSeenAt)}</span>
            <span>{job.sources.length} sources</span>
          </div>

          {job.savedJob?.note ? (
            <p className="mt-4 text-sm text-muted">Saved note: {job.savedJob.note}</p>
          ) : null}
        </div>

        <div className="min-w-[220px] rounded-[20px] border border-line bg-panel-strong p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Why open this</p>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-foreground">
            {job.priorityReasons.slice(0, 1).map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
            {job.trustReasons.slice(0, 1).map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
            {job.redFlags.slice(0, 1).map((flag) => (
              <li key={flag} className="text-danger">
                {flag}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-3 border-t border-line pt-5">
        <SaveJobToggle
          canonicalJobId={job.id}
          isSaved={job.savedJob !== null}
          returnTo={returnTo}
          signedIn={signedIn}
          compact
        />
        <Link
          href={`/jobs/${job.slug}`}
          className="rounded-full border border-line-strong px-4 py-2 text-sm font-medium text-foreground transition hover:bg-panel-strong"
        >
          View details
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
        ) : (
          <span className="rounded-full border border-warning/30 bg-warning-soft px-4 py-2 text-sm font-medium text-warning">
            Official route missing
          </span>
        )}
      </div>
    </article>
  );
}
