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

type JobCardProps = {
  job: JobSearchResult;
  returnTo: string;
  signedIn: boolean;
};

export function JobCard({ job, returnTo, signedIn }: JobCardProps) {
  const trust = getTrustMetadata(job.trustLabel);
  const freshness = getFreshnessMetadata(job.freshnessLabel);
  const priority = getPriorityMetadata(job.priorityLabel);
  const official = getOfficialSourceMetadata(job.officialSourceStatus);
  const topFlags = job.redFlags.slice(0, 1);

  return (
    <article className="panel-shadow rounded-[30px] border border-line bg-panel p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-3">
            <p className="font-heading text-2xl font-semibold text-foreground">{job.title}</p>
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

          <p className="mt-4 max-w-3xl text-sm leading-7 text-foreground">{job.reasonSummary}</p>

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

          {job.savedJob ? (
            <p className="mt-4 text-sm text-muted">
              Saved {formatRelativeDays(job.savedJob.savedAt)}
              {job.savedJob.note ? ` - ${job.savedJob.note}` : "."}
            </p>
          ) : null}
        </div>

        <div className="min-w-[220px] rounded-[24px] border border-line bg-panel-strong p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Why it matters</p>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-foreground">
            {job.trustReasons.slice(0, 2).map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
            {topFlags[0] ? <li className="text-danger">{topFlags[0]}</li> : null}
          </ul>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-4 border-t border-line pt-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs uppercase tracking-[0.18em] text-muted">
          <span>First seen {formatRelativeDays(job.firstSeenAt)}</span>
          <span>Last checked {formatRelativeDays(job.lastSeenAt)}</span>
          <span>{job.repostCount} repost cycles</span>
          <span>{job.sources.length} sources</span>
        </div>

        <div className="flex flex-wrap gap-3">
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
      </div>
    </article>
  );
}
