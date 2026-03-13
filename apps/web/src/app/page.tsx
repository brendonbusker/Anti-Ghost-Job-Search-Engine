import Link from "next/link";

import { FilterSidebar } from "@/components/jobs/filter-sidebar";
import { JobCard } from "@/components/jobs/job-card";
import { SaveSearchForm } from "@/components/jobs/save-search-form";
import { buildSignInHref, getViewerLabel } from "@/lib/auth";
import { getSearchJobs } from "@/lib/jobs";
import { buildSearchHrefFromFilters } from "@/lib/search-filters";

export const dynamic = "force-dynamic";

type HomePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Home({ searchParams }: HomePageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const { jobs, filters, usingFallbackData, summary, viewer } = await getSearchJobs(resolvedSearchParams);
  const currentSearchHref = buildSearchHrefFromFilters(filters);
  const sampleDetailHref = jobs[0] ? `/jobs/${jobs[0].slug}` : "/saved";
  const filtersJson = JSON.stringify(filters);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col gap-6 px-5 py-6 md:px-8">
      <header className="panel-shadow rounded-[34px] border border-line bg-panel px-6 py-6 md:px-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-4xl">
            <p className="font-heading text-xs font-semibold uppercase tracking-[0.34em] text-muted">
              Anti-Ghost Job Search Engine
            </p>
            <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-tight text-foreground md:text-6xl">
              Decide faster which jobs deserve your application time.
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-8 text-muted md:text-lg">
              Search canonical jobs, see official-source routing plus trust and freshness evidence, then save the
              worthwhile ones into a shortlist for <span className="font-mono text-foreground">{getViewerLabel(viewer)}</span>.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 lg:max-w-4xl">
            <SummaryCard
              label="Visible now"
              value={String(summary.visibleJobs)}
              detail="Jobs that match the current filters and sort."
            />
            <SummaryCard
              label="Apply now"
              value={String(summary.applyNowJobs)}
              detail="Visible jobs the current scoring model treats as strongest-time-to-apply."
            />
            <SummaryCard
              label="Official route"
              value={String(summary.officialSourceJobs)}
              detail="Visible jobs that already resolve to an official page or trusted ATS."
            />
            <SummaryCard
              label="Shortlist"
              value={String(summary.savedJobsCount)}
              detail="Jobs currently saved under this signed-in session."
            />
            <SummaryCard
              label="Saved searches"
              value={String(summary.savedSearchesCount)}
              detail="Reusable search sessions currently saved for this user."
            />
          </div>
        </div>
      </header>

      {usingFallbackData ? (
        <section className="rounded-[24px] border border-warning/30 bg-warning-soft px-5 py-4 text-sm text-warning">
          Database-backed search is unavailable right now, so the web app is showing fallback sample data and the saved-job workflow is paused.
        </section>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <FilterSidebar filters={filters} />

        <div className="space-y-6">
          <section className="panel-shadow rounded-[30px] border border-line bg-panel p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Search workflow</p>
                <h2 className="mt-2 font-heading text-2xl font-semibold text-foreground">
                  Search, verify, save, return
                </h2>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-muted">
                  This phase now extends the user-facing `MVP` loop with lightweight authentication and saved-search scaffolding,
                  so search sessions can be reopened instead of rebuilt by hand.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link
                  href="/saved"
                  className="rounded-full border border-line-strong px-5 py-3 text-sm font-medium text-foreground transition hover:bg-panel"
                >
                  Open saved jobs
                </Link>
                <Link
                  href={sampleDetailHref}
                  className="rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background transition hover:opacity-90"
                >
                  Open top result
                </Link>
                {!viewer ? (
                  <Link
                    href={buildSignInHref(currentSearchHref)}
                    className="rounded-full border border-line-strong px-5 py-3 text-sm font-medium text-foreground transition hover:bg-panel"
                  >
                    Sign in
                  </Link>
                ) : null}
              </div>
            </div>

            <div className="mt-6 grid gap-4 rounded-[24px] border border-line bg-panel-strong p-4 lg:grid-cols-3">
              <QuickPoint
                label="Official route first"
                detail="Prefer company-owned pages or trusted ATS boards before spending time on a role."
              />
              <QuickPoint
                label="Badges explain themselves"
                detail="Trust, freshness, and priority are labels with reasons, not opaque numbers."
              />
              <QuickPoint
                label="Shortlist in one place"
                detail="Save jobs from the list or detail page and keep a quick note on why they matter."
              />
            </div>

            <div className="mt-6 rounded-[24px] border border-line bg-panel p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Save this search</p>
              <p className="mt-2 text-sm leading-6 text-muted">
                Keep the current filter set so you can reopen it later or turn it into alerts in a later phase.
              </p>
              <div className="mt-4">
                <SaveSearchForm filtersJson={filtersJson} returnTo={currentSearchHref} signedIn={viewer !== null} />
              </div>
            </div>
          </section>

          <section className="space-y-5">
            {jobs.length ? (
              jobs.map((job) => (
                <JobCard key={job.id} job={job} returnTo={currentSearchHref} signedIn={viewer !== null} />
              ))
            ) : (
              <div className="panel-shadow rounded-[30px] border border-line bg-panel p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">No matching jobs</p>
                <h2 className="mt-2 font-heading text-2xl font-semibold text-foreground">
                  Broaden the filters and try again
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-muted">
                  No current jobs matched this combination of query, trust, freshness, priority, location, salary, and official-route filters.
                </p>
              </div>
            )}
          </section>
        </div>
      </section>
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

function QuickPoint({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="rounded-[20px] border border-line bg-panel px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">{label}</p>
      <p className="mt-2 text-sm leading-6 text-foreground">{detail}</p>
    </div>
  );
}
