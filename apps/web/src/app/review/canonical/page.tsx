import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { createCanonicalReviewAnnotation } from "@/app/review/canonical/actions";
import { formatRelativeDays } from "@/lib/format";
import {
  type CanonicalReviewAnnotation,
  getCanonicalReviewData,
  type CanonicalReviewScore,
  parseCanonicalReviewFilters,
  type CanonicalReviewJob,
} from "@/lib/canonical-review";
import {
  getFreshnessMetadata,
  getPriorityMetadata,
  getTrustMetadata,
} from "@/lib/label-metadata";

export const dynamic = "force-dynamic";

type CanonicalReviewPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CanonicalReviewPage({ searchParams }: CanonicalReviewPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const filters = parseCanonicalReviewFilters(resolvedSearchParams);
  const data = await getCanonicalReviewData(filters);
  const currentReviewHref = buildReviewHref(resolvedSearchParams);
  const queuePresets = [
    {
      label: "Review backlog",
      count: data.reviewBacklogJobs,
      href: "/review/canonical?backlogOnly=true",
      active: filters.backlogOnly,
      detail: "The annotation-aware queue: follow-up items plus risky clusters that still need their first real human pass.",
    },
    {
      label: "Needs first pass",
      count: data.firstPassReviewJobs,
      href: "/review/canonical?firstPassOnly=true",
      active: filters.firstPassOnly,
      detail: "Clusters with meaningful review risk but no saved annotation history yet.",
    },
    {
      label: "Reviewer follow-up",
      count: data.followUpReviewJobs,
      href: "/review/canonical?backlogOnly=true&reviewedOnly=true&needsFollowUpOnly=true",
      active: filters.needsFollowUpOnly,
      detail: "Clusters a reviewer explicitly marked for another pass before the heuristics or source evidence move on.",
    },
    {
      label: "Calibration candidates",
      count: data.calibrationCandidateJobs,
      href: "/review/canonical?calibrationCandidatesOnly=true&scoreReviewOnly=true",
      active: filters.calibrationCandidatesOnly,
      detail: "The unresolved but still plausible jobs that deserve the final tuning pass for this phase.",
    },
    {
      label: "Enrichment backfilled",
      count: data.enrichmentBackfilledJobs,
      href: "/review/canonical?enrichmentBackfilledOnly=true",
      active: filters.enrichmentBackfilledOnly,
      detail: "Jobs whose official source now comes from conservative company-domain enrichment evidence.",
    },
    {
      label: "Missing official, still actionable",
      count: data.missingOfficialActionableJobs,
      href: "/review/canonical?missingOfficialActionableOnly=true&scoreReviewOnly=true",
      active: filters.missingOfficialActionableOnly,
      detail: "Jobs that still look worth considering but need official-source resolution before we trust them more.",
    },
    {
      label: "Ambiguous candidates",
      count: data.ambiguousReviewCandidateJobs,
      href: "/review/canonical?ambiguousReviewCandidatesOnly=true&multiSourceOnly=true",
      active: filters.ambiguousReviewCandidatesOnly,
      detail: "Ambiguous clusters that still look plausible enough to tune rather than discard.",
    },
    {
      label: "Ambiguous already rejected",
      count: data.ambiguousRejectedJobs,
      href: "/review/canonical?ambiguousRejectedOnly=true&multiSourceOnly=true&scoreReviewOnly=true",
      active: filters.ambiguousRejectedOnly,
      detail: "Ambiguous clusters that are already suspicious, stale, or avoid-for-now under the current heuristics.",
    },
    {
      label: "Score review",
      count: data.scoreFlaggedJobs,
      href: "/review/canonical?scoreReviewOnly=true",
      active: filters.scoreReviewOnly,
      detail: "Any job whose latest scoring output still needs human inspection.",
    },
  ];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col gap-6 px-5 py-6 md:px-8">
      <header className="panel-shadow rounded-[34px] border border-line bg-panel px-6 py-6 md:px-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-4xl">
            <p className="font-heading text-xs font-semibold uppercase tracking-[0.34em] text-muted">
              Internal Review
            </p>
            <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-tight text-foreground md:text-6xl">
              Inspect canonical clusters before scoring trusts them.
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-8 text-muted md:text-lg">
              Lightweight `MVP` review surface for canonical jobs, merge rationale, canonical-source choice, and the
              latest trust, freshness, and priority readouts that need tuning before the heuristics expand further.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 lg:max-w-4xl">
            <SummaryCard
              label="Visible jobs"
              value={String(data.filteredJobsCount)}
              detail="Full count after the current review filters are applied, before page limiting."
            />
            <SummaryCard
              label="Flagged now"
              value={String(data.flaggedJobs)}
              detail="Jobs with missing official source, low confidence, or ambiguous links."
            />
            <SummaryCard
              label="Backlog now"
              value={String(data.reviewBacklogJobs)}
              detail="Annotation-aware review backlog: follow-up items plus risky jobs still waiting on a first pass."
            />
            <SummaryCard
              label="First pass"
              value={String(data.firstPassReviewJobs)}
              detail="Jobs that still need their first real reviewer note despite current risk signals."
            />
            <SummaryCard
              label="Reviewed"
              value={String(data.reviewedJobs)}
              detail="Jobs that already have at least one saved reviewer annotation."
            />
            <SummaryCard
              label="Follow-up notes"
              value={String(data.followUpReviewJobs)}
              detail="Jobs that a reviewer explicitly marked as needing another pass."
            />
            <SummaryCard
              label="Reviewed stable"
              value={String(data.reviewedResolvedJobs)}
              detail="Jobs with annotation history that are no longer sitting in the active review backlog."
            />
            <SummaryCard
              label="Score review"
              value={String(data.scoreFlaggedJobs)}
              detail="Jobs whose latest score or missing score needs extra inspection."
            />
            <SummaryCard
              label="Unscored"
              value={String(data.unscoredJobs)}
              detail="Visible jobs that still need the scoring pipeline to run."
            />
            <SummaryCard
              label="Calibration targets"
              value={String(data.calibrationCandidateJobs)}
              detail="Plausible unresolved jobs that still deserve tuning attention."
            />
            <SummaryCard
              label="Backfilled official"
              value={String(data.enrichmentBackfilledJobs)}
              detail="Jobs whose official source now comes from company-domain enrichment evidence."
            />
            <SummaryCard
              label="Missing official"
              value={String(data.missingOfficialActionableJobs)}
              detail="Actionable jobs that still need official-source resolution."
            />
            <SummaryCard
              label="Ambiguous candidates"
              value={String(data.ambiguousReviewCandidateJobs)}
              detail="Plausible ambiguous clusters that still deserve human review."
            />
            <SummaryCard
              label="Ambiguous rejected"
              value={String(data.ambiguousRejectedJobs)}
              detail="Ambiguous clusters already downgraded by current scoring."
            />
            <SummaryCard
              label="Dataset jobs"
              value={String(data.totalJobs)}
              detail="Current canonical jobs inspected from the database for this review readout."
            />
          </div>
        </div>
      </header>

      <section className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="panel-shadow h-fit rounded-[28px] border border-line bg-panel p-6">
          <div className="rounded-[24px] border border-line bg-panel-strong p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">Employer mix</p>
            <div className="mt-4 space-y-3">
              {data.topCompanies.slice(0, 6).map((company) => {
                const companyHref = `/review/canonical?company=${encodeURIComponent(company.company)}`;
                return (
                  <Link
                    key={company.company}
                    href={companyHref}
                    className={`block rounded-[18px] border px-4 py-4 transition ${
                      filters.company === company.company
                        ? "border-line-strong bg-panel text-foreground"
                        : "border-line bg-panel text-foreground hover:bg-panel"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium">{company.company}</span>
                      <span className="rounded-full border border-line bg-panel-strong px-2.5 py-1 text-xs text-muted">
                        {company.activeCanonicalJobs}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted">
                      {company.backlogJobs} backlog, {company.firstPassJobs} first-pass, {company.followUpJobs} follow-up.
                    </p>
                    {company.latestReviewSummary ? (
                      <p className="mt-2 text-sm leading-6 text-muted">
                        Latest note: {company.latestReviewSummary}
                      </p>
                    ) : (
                      <p className="mt-2 text-sm leading-6 text-muted">
                        {company.reviewedResolvedJobs} reviewed stable, {company.scoreReviewJobs} score-review jobs.
                      </p>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="rounded-[24px] border border-line bg-panel-strong p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">Review queues</p>
            <div className="mt-4 space-y-3">
              {queuePresets.map((preset) => (
                <Link
                  key={preset.label}
                  href={preset.href}
                  className={`block rounded-[20px] border px-4 py-4 transition ${
                    preset.active
                      ? "border-line-strong bg-panel text-foreground"
                      : "border-line bg-panel text-foreground hover:bg-panel"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium">{preset.label}</span>
                    <span className="rounded-full border border-line bg-panel-strong px-2.5 py-1 text-xs text-muted">
                      {preset.count}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted">{preset.detail}</p>
                </Link>
              ))}
            </div>
          </div>

          <div>
            <p className="mt-6 text-xs font-semibold uppercase tracking-[0.22em] text-muted">Review filters</p>
            <h2 className="mt-2 font-heading text-2xl font-semibold text-foreground">Focus on risky clusters</h2>
            <p className="mt-3 text-sm leading-6 text-muted">
              Filter toward missing official sources, lower-confidence links, reviewer follow-up notes, and
              multi-source clusters where merge logic is more likely to need inspection, then narrow further by trust,
              freshness, priority, or missing score state.
            </p>
          </div>

          <form method="get" className="mt-6 space-y-5">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Search</span>
              <input
                type="text"
                name="q"
                defaultValue={filters.q}
                placeholder="Title, company, source..."
                className="mt-2 w-full rounded-2xl border border-line bg-panel-strong px-4 py-3 text-sm text-foreground outline-none transition focus:border-line-strong"
              />
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Company</span>
              <select
                name="company"
                defaultValue={filters.company}
                className="mt-2 w-full rounded-2xl border border-line bg-panel-strong px-4 py-3 text-sm text-foreground outline-none transition focus:border-line-strong"
              >
                <option value="">Any company</option>
                {data.availableCompanies.map((company) => (
                  <option key={company} value={company}>
                    {company}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Official method</span>
              <select
                name="officialSourceMethod"
                defaultValue={filters.officialSourceMethod}
                className="mt-2 w-full rounded-2xl border border-line bg-panel-strong px-4 py-3 text-sm text-foreground outline-none transition focus:border-line-strong"
              >
                <option value="">Any method</option>
                {Object.entries(data.officialSourceMethodCounts).map(([method, count]) => (
                  <option key={method} value={method === "UNSET" ? "UNSET" : method}>
                    {`${method.toLowerCase().replaceAll("_", " ")} (${count})`}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-start gap-3 rounded-2xl border border-line bg-panel-strong p-4">
              <input
                type="checkbox"
                name="backlogOnly"
                value="true"
                defaultChecked={filters.backlogOnly}
                className="mt-1 h-4 w-4 accent-[var(--accent)]"
              />
              <span>
                <span className="block text-sm font-medium text-foreground">Review backlog only</span>
                <span className="mt-1 block text-sm leading-6 text-muted">
                  Show only jobs the annotation-aware queue says deserve attention now.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-3 rounded-2xl border border-line bg-panel-strong p-4">
              <input
                type="checkbox"
                name="firstPassOnly"
                value="true"
                defaultChecked={filters.firstPassOnly}
                className="mt-1 h-4 w-4 accent-[var(--accent)]"
              />
              <span>
                <span className="block text-sm font-medium text-foreground">Needs first pass only</span>
                <span className="mt-1 block text-sm leading-6 text-muted">
                  Keep only risky clusters that have no saved reviewer note yet.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-3 rounded-2xl border border-line bg-panel-strong p-4">
              <input
                type="checkbox"
                name="reviewedOnly"
                value="true"
                defaultChecked={filters.reviewedOnly}
                className="mt-1 h-4 w-4 accent-[var(--accent)]"
              />
              <span>
                <span className="block text-sm font-medium text-foreground">Reviewed only</span>
                <span className="mt-1 block text-sm leading-6 text-muted">
                  Keep only jobs that already have at least one reviewer annotation attached.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-3 rounded-2xl border border-line bg-panel-strong p-4">
              <input
                type="checkbox"
                name="needsFollowUpOnly"
                value="true"
                defaultChecked={filters.needsFollowUpOnly}
                className="mt-1 h-4 w-4 accent-[var(--accent)]"
              />
              <span>
                <span className="block text-sm font-medium text-foreground">Reviewer follow-up only</span>
                <span className="mt-1 block text-sm leading-6 text-muted">
                  Focus on jobs that a reviewer explicitly marked for a later merge, source, or score follow-up.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-3 rounded-2xl border border-line bg-panel-strong p-4">
              <input
                type="checkbox"
                name="calibrationCandidatesOnly"
                value="true"
                defaultChecked={filters.calibrationCandidatesOnly}
                className="mt-1 h-4 w-4 accent-[var(--accent)]"
              />
              <span>
                <span className="block text-sm font-medium text-foreground">Calibration candidates only</span>
                <span className="mt-1 block text-sm leading-6 text-muted">
                  Keep only the unresolved but still plausible jobs that matter for the last read-only tuning pass.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-3 rounded-2xl border border-line bg-panel-strong p-4">
              <input
                type="checkbox"
                name="enrichmentBackfilledOnly"
                value="true"
                defaultChecked={filters.enrichmentBackfilledOnly}
                className="mt-1 h-4 w-4 accent-[var(--accent)]"
              />
              <span>
                <span className="block text-sm font-medium text-foreground">Enrichment-backfilled only</span>
                <span className="mt-1 block text-sm leading-6 text-muted">
                  Inspect the jobs whose official-source state now depends on conservative company-page evidence.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-3 rounded-2xl border border-line bg-panel-strong p-4">
              <input
                type="checkbox"
                name="missingOfficialOnly"
                value="true"
                defaultChecked={filters.missingOfficialOnly}
                className="mt-1 h-4 w-4 accent-[var(--accent)]"
              />
              <span>
                <span className="block text-sm font-medium text-foreground">Missing official source only</span>
                <span className="mt-1 block text-sm leading-6 text-muted">
                  Show clusters that still do not resolve to a trusted destination.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-3 rounded-2xl border border-line bg-panel-strong p-4">
              <input
                type="checkbox"
                name="missingOfficialActionableOnly"
                value="true"
                defaultChecked={filters.missingOfficialActionableOnly}
                className="mt-1 h-4 w-4 accent-[var(--accent)]"
              />
              <span>
                <span className="block text-sm font-medium text-foreground">Missing official but actionable</span>
                <span className="mt-1 block text-sm leading-6 text-muted">
                  Isolate jobs that still have application value but should not be trusted more until an official path is found.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-3 rounded-2xl border border-line bg-panel-strong p-4">
              <input
                type="checkbox"
                name="lowConfidenceOnly"
                value="true"
                defaultChecked={filters.lowConfidenceOnly}
                className="mt-1 h-4 w-4 accent-[var(--accent)]"
              />
              <span>
                <span className="block text-sm font-medium text-foreground">Low confidence only</span>
                <span className="mt-1 block text-sm leading-6 text-muted">
                  Focus on weaker canonical-source confidence or weaker source-link confidence.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-3 rounded-2xl border border-line bg-panel-strong p-4">
              <input
                type="checkbox"
                name="ambiguousClustersOnly"
                value="true"
                defaultChecked={filters.ambiguousClustersOnly}
                className="mt-1 h-4 w-4 accent-[var(--accent)]"
              />
              <span>
                <span className="block text-sm font-medium text-foreground">Ambiguous clusters only</span>
                <span className="mt-1 block text-sm leading-6 text-muted">
                  Focus on fuzzy matches and internal title or location disagreement before scoring logic expands further.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-3 rounded-2xl border border-line bg-panel-strong p-4">
              <input
                type="checkbox"
                name="ambiguousReviewCandidatesOnly"
                value="true"
                defaultChecked={filters.ambiguousReviewCandidatesOnly}
                className="mt-1 h-4 w-4 accent-[var(--accent)]"
              />
              <span>
                <span className="block text-sm font-medium text-foreground">Ambiguous review candidates</span>
                <span className="mt-1 block text-sm leading-6 text-muted">
                  Keep only ambiguous clusters that are still plausible enough to calibrate carefully.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-3 rounded-2xl border border-line bg-panel-strong p-4">
              <input
                type="checkbox"
                name="ambiguousRejectedOnly"
                value="true"
                defaultChecked={filters.ambiguousRejectedOnly}
                className="mt-1 h-4 w-4 accent-[var(--accent)]"
              />
              <span>
                <span className="block text-sm font-medium text-foreground">Ambiguous already rejected</span>
                <span className="mt-1 block text-sm leading-6 text-muted">
                  Show ambiguous clusters that the current scores already push into suspicious, stale, or avoid-for-now territory.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-3 rounded-2xl border border-line bg-panel-strong p-4">
              <input
                type="checkbox"
                name="multiSourceOnly"
                value="true"
                defaultChecked={filters.multiSourceOnly}
                className="mt-1 h-4 w-4 accent-[var(--accent)]"
              />
              <span>
                <span className="block text-sm font-medium text-foreground">Multi-source clusters only</span>
                <span className="mt-1 block text-sm leading-6 text-muted">
                  Useful when checking dedupe quality and canonical-source precedence decisions.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-3 rounded-2xl border border-line bg-panel-strong p-4">
              <input
                type="checkbox"
                name="scoreReviewOnly"
                value="true"
                defaultChecked={filters.scoreReviewOnly}
                className="mt-1 h-4 w-4 accent-[var(--accent)]"
              />
              <span>
                <span className="block text-sm font-medium text-foreground">Score review only</span>
                <span className="mt-1 block text-sm leading-6 text-muted">
                  Focus on missing scores plus cautionary trust, freshness, priority, and flag outcomes.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-3 rounded-2xl border border-line bg-panel-strong p-4">
              <input
                type="checkbox"
                name="unscoredOnly"
                value="true"
                defaultChecked={filters.unscoredOnly}
                className="mt-1 h-4 w-4 accent-[var(--accent)]"
              />
              <span>
                <span className="block text-sm font-medium text-foreground">Unscored only</span>
                <span className="mt-1 block text-sm leading-6 text-muted">
                  Useful after canonicalization runs but before the latest scoring pass lands.
                </span>
              </span>
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Trust label</span>
              <select
                name="trustLabel"
                defaultValue={filters.trustLabel ?? ""}
                className="mt-2 w-full rounded-2xl border border-line bg-panel-strong px-4 py-3 text-sm text-foreground outline-none transition focus:border-line-strong"
              >
                <option value="">Any</option>
                <option value="HIGH_CONFIDENCE_REAL">High confidence real</option>
                <option value="MEDIUM_CONFIDENCE">Medium confidence</option>
                <option value="UNVERIFIED_SOURCE">Unverified source</option>
                <option value="SUSPICIOUS_LOW_CONFIDENCE">Suspicious / low confidence</option>
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Freshness label</span>
              <select
                name="freshnessLabel"
                defaultValue={filters.freshnessLabel ?? ""}
                className="mt-2 w-full rounded-2xl border border-line bg-panel-strong px-4 py-3 text-sm text-foreground outline-none transition focus:border-line-strong"
              >
                <option value="">Any</option>
                <option value="NEW">New</option>
                <option value="FRESH">Fresh</option>
                <option value="AGING">Aging</option>
                <option value="POSSIBLY_STALE">Possibly stale</option>
                <option value="LIKELY_STALE">Likely stale</option>
                <option value="REPOSTED_REPEATEDLY">Reposted repeatedly</option>
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Priority label</span>
              <select
                name="priorityLabel"
                defaultValue={filters.priorityLabel ?? ""}
                className="mt-2 w-full rounded-2xl border border-line bg-panel-strong px-4 py-3 text-sm text-foreground outline-none transition focus:border-line-strong"
              >
                <option value="">Any</option>
                <option value="APPLY_NOW">Apply now</option>
                <option value="APPLY_SOON">Apply soon</option>
                <option value="LOW_PRIORITY">Low priority</option>
                <option value="AVOID_FOR_NOW">Avoid for now</option>
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Limit</span>
              <select
                name="limit"
                defaultValue={String(filters.limit)}
                className="mt-2 w-full rounded-2xl border border-line bg-panel-strong px-4 py-3 text-sm text-foreground outline-none transition focus:border-line-strong"
              >
                <option value="12">12 jobs</option>
                <option value="24">24 jobs</option>
                <option value="36">36 jobs</option>
                <option value="50">50 jobs</option>
              </select>
            </label>

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                className="rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background transition hover:opacity-90"
              >
                Apply filters
              </button>
              <Link
                href="/review/canonical"
                className="rounded-full border border-line-strong px-5 py-3 text-sm font-medium text-foreground transition hover:bg-panel-strong"
              >
                Reset
              </Link>
            </div>
          </form>
        </aside>

        <section className="space-y-5">
            <div className="rounded-[24px] border border-line bg-panel px-5 py-4">
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
              <span>{data.filteredJobsCount} jobs match the current filters.</span>
              {filters.company ? <span>Company: {filters.company}</span> : null}
              {filters.officialSourceMethod ? (
                <span>Official method: {filters.officialSourceMethod.toLowerCase().replaceAll("_", " ")}</span>
              ) : null}
              {filters.backlogOnly ? <span>Review backlog only</span> : null}
              {filters.firstPassOnly ? <span>Needs first pass only</span> : null}
              {filters.reviewedOnly ? <span>Reviewed only</span> : null}
              {filters.needsFollowUpOnly ? <span>Reviewer follow-up only</span> : null}
            </div>
          </div>

          {data.jobs.length === 0 ? (
            <div className="panel-shadow rounded-[30px] border border-line bg-panel p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">No canonical jobs found</p>
              <h2 className="mt-2 font-heading text-2xl font-semibold text-foreground">
                Run ingestion and canonicalization first
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-muted">
                This page reads directly from `canonical_jobs` and `canonical_job_sources`. If the database is still
                empty, run the sync plus canonicalization flow, then reload this review surface.
              </p>
            </div>
          ) : (
            data.jobs.map((job) => <CanonicalReviewCard key={job.id} job={job} returnTo={currentReviewHref} />)
          )}
        </section>
      </section>
    </main>
  );
}

function SummaryCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-[24px] border border-line bg-panel-strong p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">{label}</p>
      <p className="mt-2 font-heading text-xl font-semibold text-foreground">{value}</p>
      <p className="mt-2 text-sm leading-6 text-muted">{detail}</p>
    </div>
  );
}

function CanonicalReviewCard({ job, returnTo }: { job: CanonicalReviewJob; returnTo: string }) {
  const reviewTone = job.needsReview ? "warning" : "positive";
  const reviewLabel = job.needsReview ? "Needs review" : "Looks stable";
  const sourceTone = job.missingOfficialSource ? "warning" : "positive";
  const sourceLabel = job.missingOfficialSource ? "Official source missing" : "Official source linked";
  const confidenceTone = job.lowConfidence ? "warning" : "accent";
  const confidenceLabel = job.lowConfidence ? "Low confidence cluster" : "Confident cluster";
  const scoreTone = job.score === null ? "warning" : job.needsScoreReview ? "warning" : "positive";
  const scoreLabel = job.score === null ? "Unscored" : job.needsScoreReview ? "Score needs review" : "Score looks stable";
  const reviewStatusTone =
    job.reviewStatus === "FOLLOW_UP" || job.reviewStatus === "NEEDS_FIRST_PASS"
      ? "warning"
      : job.reviewStatus === "REVIEWED_RESOLVED"
        ? "accent"
        : "positive";

  return (
    <article className="panel-shadow rounded-[30px] border border-line bg-panel p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-4xl">
          <div className="flex flex-wrap items-center gap-3">
            <p className="font-heading text-2xl font-semibold text-foreground">{job.title}</p>
            <Badge tone={reviewTone} detail={job.reviewReasons.join(". ") || "No obvious review concerns detected."}>
              {reviewLabel}
            </Badge>
            <Badge tone={sourceTone} detail="Canonical official-source resolution state for this cluster.">
              {sourceLabel}
            </Badge>
            <Badge tone={confidenceTone} detail="Derived from canonical-source confidence plus linked source confidence.">
              {confidenceLabel}
            </Badge>
            <Badge tone={scoreTone} detail="Latest heuristic score state for this canonical cluster.">
              {scoreLabel}
            </Badge>
            <Badge tone={reviewStatusTone} detail={job.reviewPriorityReasons.join(". ") || "No active backlog priority reasons."}>
              {formatReviewStatus(job.reviewStatus)}
            </Badge>
            {job.calibrationCandidate ? (
              <Badge tone="accent" detail="This job is still plausible enough to be a real calibration target for the current scoring phase.">
                Calibration target
              </Badge>
            ) : null}
            {job.enrichmentBackfilled ? (
              <Badge tone="accent" detail="This official source was backfilled from company-domain enrichment evidence rather than only from the raw source row.">
                Enrichment backfilled
              </Badge>
            ) : null}
            {job.careersPageFallback ? (
              <Badge tone="warning" detail="This cluster resolves only to a company careers hub, not a job-specific official page.">
                Careers-page fallback
              </Badge>
            ) : null}
            {job.missingOfficialActionable ? (
              <Badge tone="warning" detail="This job still looks actionable, but it needs official-source resolution before we trust the ranking more.">
                Missing official, actionable
              </Badge>
            ) : null}
            {job.ambiguousCluster ? (
              <Badge tone="warning" detail="This cluster has fuzzy or conflicting evidence and should be reviewed before we widen merge confidence.">
                Ambiguous cluster
              </Badge>
            ) : null}
            {job.ambiguousReviewCandidate ? (
              <Badge tone="accent" detail="This ambiguous cluster still looks plausible enough to be a calibration target.">
                Ambiguous candidate
              </Badge>
            ) : null}
            {job.ambiguousRejected ? (
              <Badge tone="warning" detail="This ambiguous cluster is already being pushed down by the current heuristics.">
                Ambiguous rejected
              </Badge>
            ) : null}
            {job.hasReviewAnnotations ? (
              <Badge tone="accent" detail="A reviewer has already left feedback on this canonical cluster.">
                Reviewed
              </Badge>
            ) : null}
            {job.needsFollowUpReview ? (
              <Badge tone="warning" detail="A reviewer explicitly marked this job for another pass.">
                Follow-up needed
              </Badge>
            ) : null}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
            <span>{job.company}</span>
            <span>{job.location ?? "Location unknown"}</span>
            <span>{job.remoteType.toLowerCase()}</span>
            <span>{job.status.toLowerCase()}</span>
            {job.officialSourceMethod ? <span>{job.officialSourceMethod.toLowerCase().replaceAll("_", " ")}</span> : null}
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {job.reviewReasons.length > 0 ? (
              job.reviewReasons.map((reason) => (
                <span key={reason} className="rounded-full border border-line bg-panel-strong px-3 py-1 text-xs text-muted">
                  {reason}
                </span>
              ))
            ) : (
              <span className="rounded-full border border-line bg-panel-strong px-3 py-1 text-xs text-muted">
                No immediate review flags
              </span>
            )}
            {job.reviewPriorityReasons.map((reason) => (
              <span key={reason} className="rounded-full border border-warning/20 bg-warning-soft px-3 py-1 text-xs text-warning">
                {reason}
              </span>
            ))}
          </div>
        </div>

        <div className="min-w-[250px] rounded-[24px] border border-line bg-panel-strong p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Cluster snapshot</p>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm leading-6">
            <dt className="text-muted">Sources</dt>
            <dd className="text-foreground">
              {job.activeSourceCount} active / {job.sourceCount} total
            </dd>
            <dt className="text-muted">Official confidence</dt>
            <dd className="text-foreground">{formatConfidence(job.officialSourceConfidence)}</dd>
            <dt className="text-muted">Official method</dt>
            <dd className="text-foreground">{formatEvidenceValue(job.officialSourceMethod)}</dd>
            <dt className="text-muted">Company domain</dt>
            <dd className="text-foreground">{job.companyPrimaryDomain ?? "n/a"}</dd>
            <dt className="text-muted">Careers URL</dt>
            <dd className="text-foreground">{job.companyCareersUrl ?? "n/a"}</dd>
            <dt className="text-muted">First seen</dt>
            <dd className="text-foreground">{formatRelativeDays(job.firstSeenAt)}</dd>
            <dt className="text-muted">Last seen</dt>
            <dd className="text-foreground">{formatRelativeDays(job.lastSeenAt)}</dd>
            <dt className="text-muted">Reviewer notes</dt>
            <dd className="text-foreground">{job.reviews.length}</dd>
            <dt className="text-muted">Review status</dt>
            <dd className="text-foreground">{formatReviewStatus(job.reviewStatus)}</dd>
            <dt className="text-muted">Queue priority</dt>
            <dd className="text-foreground">{job.reviewPriorityScore}</dd>
          </dl>

          {job.officialSourceUrl ? (
            <a
              href={job.officialSourceUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition hover:opacity-90"
            >
              Open canonical source
            </a>
          ) : null}
        </div>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <ScoreSnapshotPanel score={job.score} scoreReviewReasons={job.scoreReviewReasons} />
        <ScoreExplanationPanel score={job.score} />
      </div>

      <ReviewerAnnotationsPanel job={job} returnTo={returnTo} />

      <div className="mt-6 overflow-hidden rounded-[24px] border border-line">
        <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_120px_140px] gap-4 border-b border-line bg-panel-strong px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
          <span>Source</span>
          <span>Match rationale</span>
          <span>Confidence</span>
          <span>Status</span>
        </div>

        <div className="divide-y divide-line">
          {job.sources.map((source) => (
            <div
              key={source.id}
              className={`grid grid-cols-1 gap-4 px-4 py-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_120px_140px] ${
                source.isCanonicalSource ? "bg-accent-soft" : "bg-panel"
              }`}
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-foreground">{source.title}</p>
                  {source.isCanonicalSource ? (
                    <Badge tone="accent" detail="This source currently wins canonical-source precedence for the cluster.">
                      Canonical source
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-muted">
                  {source.sourceName} - {source.sourceType.toLowerCase().replaceAll("_", " ")}
                </p>
                <p className="mt-2 text-sm leading-6 text-foreground">
                  {source.companyName} - {source.location ?? "Location unknown"}
                </p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted">
                  <span>rank {source.precedenceRank ?? "n/a"}</span>
                  <span>{source.isActive ? "active" : "inactive"}</span>
                  <a href={source.url} target="_blank" rel="noreferrer" className="underline underline-offset-4">
                    raw listing
                  </a>
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-foreground">{formatRule(source.mergeRationale.rule)}</p>
                <p className="mt-1 text-sm leading-6 text-muted">
                  Matched on{" "}
                  {source.mergeRationale.matchedOn.length
                    ? source.mergeRationale.matchedOn.join(", ")
                    : "unspecified evidence"}
                  .
                </p>
                <p className="mt-2 text-xs text-muted">
                  Cluster confidence {formatConfidence(source.mergeRationale.clusterConfidence)}
                </p>
              </div>

              <div className="text-sm text-foreground">{formatConfidence(source.linkConfidence)}</div>

              <div className="flex items-start">
                <Badge
                  tone={source.isActive ? "positive" : "warning"}
                  detail={source.isActive ? "Source row is still active." : "Source row is currently inactive."}
                >
                  {source.isActive ? "Active" : "Inactive"}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

function ReviewerAnnotationsPanel({
  job,
  returnTo,
}: {
  job: CanonicalReviewJob;
  returnTo: string;
}) {
  return (
    <section className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div className="rounded-[24px] border border-line bg-panel-strong p-5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Reviewer annotations</p>
          <Badge
            tone={job.needsFollowUpReview ? "warning" : job.hasReviewAnnotations ? "accent" : "positive"}
            detail="Saved reviewer context for this canonical job."
          >
            {job.needsFollowUpReview
              ? "Follow-up active"
              : job.hasReviewAnnotations
                ? "Has review history"
                : "No review notes yet"}
          </Badge>
        </div>

        {job.reviews.length > 0 ? (
          <div className="mt-4 space-y-3">
            {job.latestReview ? (
              <div className="rounded-[20px] border border-line-strong bg-panel p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Latest reviewer decision</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Badge tone={job.reviewStatus === "FOLLOW_UP" ? "warning" : "accent"} detail="Most recent review outcome for this canonical job.">
                    {formatReviewStatus(job.reviewStatus)}
                  </Badge>
                  <Badge tone="accent" detail="Feedback type captured on the latest note.">
                    {formatReviewType(job.latestReview.reviewType)}
                  </Badge>
                </div>
                <p className="mt-3 text-sm font-medium text-foreground">{job.latestReview.summary}</p>
                {job.latestReview.details ? (
                  <p className="mt-2 text-sm leading-6 text-muted">{job.latestReview.details}</p>
                ) : null}
              </div>
            ) : null}
            {job.reviews.map((review) => (
              <div key={review.id} className="rounded-[20px] border border-line bg-panel p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={review.disposition === "NEEDS_FOLLOW_UP" ? "warning" : review.disposition === "INCORRECT" ? "warning" : "positive"} detail="Reviewer disposition for this note.">
                    {formatReviewDisposition(review.disposition)}
                  </Badge>
                  <Badge tone="accent" detail="Type of feedback captured for this note.">
                    {formatReviewType(review.reviewType)}
                  </Badge>
                </div>
                <p className="mt-3 text-sm font-medium text-foreground">{review.summary}</p>
                {review.details ? (
                  <p className="mt-2 text-sm leading-6 text-muted">{review.details}</p>
                ) : null}
                <p className="mt-3 text-xs uppercase tracking-[0.16em] text-muted">
                  {review.reviewerName ?? "Internal reviewer"} • {formatRelativeDays(review.createdAt)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm leading-6 text-muted">
            No reviewer notes saved yet. Use the lightweight controls here to mark a bad merge, questionable official
            source, score-calibration concern, or general observation without overriding the engine.
          </p>
        )}
      </div>

      <div className="rounded-[24px] border border-line bg-panel-strong p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Add reviewer note</p>
        <h3 className="mt-2 font-heading text-xl font-semibold text-foreground">Capture the decision while the evidence is in view</h3>
        <p className="mt-3 text-sm leading-6 text-muted">
          This is `MVP` review capture: append-only annotations with explicit type and disposition so evaluation can
          improve without silently mutating canonical or scoring state.
        </p>

        <form action={createCanonicalReviewAnnotation} className="mt-5 space-y-4">
          <input type="hidden" name="canonicalJobId" value={job.id} />
          <input type="hidden" name="returnTo" value={returnTo} />

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Review type</span>
              <select
                name="reviewType"
                defaultValue={job.missingOfficialSource ? "OFFICIAL_SOURCE" : job.ambiguousCluster ? "MERGE_QUALITY" : "GENERAL_NOTE"}
                className="mt-2 w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none transition focus:border-line-strong"
              >
                <option value="MERGE_QUALITY">Merge quality</option>
                <option value="OFFICIAL_SOURCE">Official source</option>
                <option value="SCORE_CALIBRATION">Score calibration</option>
                <option value="GENERAL_NOTE">General note</option>
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Disposition</span>
              <select
                name="disposition"
                defaultValue={job.needsReview ? "NEEDS_FOLLOW_UP" : "CONFIRMED"}
                className="mt-2 w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none transition focus:border-line-strong"
              >
                <option value="CONFIRMED">Confirmed</option>
                <option value="INCORRECT">Incorrect</option>
                <option value="NEEDS_FOLLOW_UP">Needs follow-up</option>
              </select>
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Short summary</span>
            <input
              type="text"
              name="summary"
              required
              maxLength={160}
              placeholder="Example: Merge looks wrong across regions."
              className="mt-2 w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none transition focus:border-line-strong"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Details</span>
            <textarea
              name="details"
              rows={4}
              maxLength={2000}
              placeholder="What evidence supports the note?"
              className="mt-2 w-full rounded-[24px] border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none transition focus:border-line-strong"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Reviewer</span>
            <input
              type="text"
              name="reviewerName"
              maxLength={80}
              placeholder="Optional name"
              className="mt-2 w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none transition focus:border-line-strong"
            />
          </label>

          <button
            type="submit"
            className="rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background transition hover:opacity-90"
          >
            Save reviewer note
          </button>
        </form>
      </div>
    </section>
  );
}

function ScoreSnapshotPanel({
  score,
  scoreReviewReasons,
}: {
  score: CanonicalReviewScore | null;
  scoreReviewReasons: string[];
}) {
  if (!score) {
    return (
      <section className="rounded-[24px] border border-line bg-panel-strong p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Latest scoring snapshot</p>
        <h3 className="mt-2 font-heading text-xl font-semibold text-foreground">No score available yet</h3>
        <p className="mt-3 text-sm leading-6 text-muted">
          Run the scoring pipeline to populate trust, freshness, priority, reasons, flags, and evidence for this
          canonical job.
        </p>
        <code className="mt-4 block rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground">
          npm run score:jobs
        </code>
      </section>
    );
  }

  const trust = getTrustMetadata(score.trustLabel);
  const freshness = getFreshnessMetadata(score.freshnessLabel);
  const priority = getPriorityMetadata(score.priorityLabel);

  return (
    <section className="rounded-[24px] border border-line bg-panel-strong p-5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Latest scoring snapshot</p>
        <Badge tone={scoreReviewReasons.length > 0 ? "warning" : "positive"} detail="High-level score tuning state.">
          {scoreReviewReasons.length > 0 ? "Needs tuning" : "Stable readout"}
        </Badge>
      </div>

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

      <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm leading-6">
        <dt className="text-muted">Trust</dt>
        <dd className="text-foreground">{score.trustScore} / 100</dd>
        <dt className="text-muted">Freshness</dt>
        <dd className="text-foreground">{score.freshnessScore} / 100</dd>
        <dt className="text-muted">Priority</dt>
        <dd className="text-foreground">{score.priorityScore} / 100</dd>
        <dt className="text-muted">Scored</dt>
        <dd className="text-foreground">{formatRelativeDays(score.scoredAt)}</dd>
        <dt className="text-muted">Model</dt>
        <dd className="text-foreground">{score.modelVersion}</dd>
        <dt className="text-muted">Endpoint</dt>
        <dd className="text-foreground">{formatEvidenceValue(score.evidence.endpointStatus)}</dd>
        <dt className="text-muted">Canonical type</dt>
        <dd className="text-foreground">{formatEvidenceValue(score.evidence.canonicalSourceType)}</dd>
        <dt className="text-muted">Official method</dt>
        <dd className="text-foreground">{formatEvidenceValue(score.evidence.officialSourceMethod)}</dd>
        <dt className="text-muted">Fuzzy links</dt>
        <dd className="text-foreground">{score.evidence.fuzzyMatchSourceCount ?? 0}</dd>
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        {scoreReviewReasons.length > 0 ? (
          scoreReviewReasons.map((reason) => (
            <span key={reason} className="rounded-full border border-warning/20 bg-warning-soft px-3 py-1 text-xs text-warning">
              {reason}
            </span>
          ))
        ) : (
          <span className="rounded-full border border-line bg-panel px-3 py-1 text-xs text-muted">
            No score-specific review prompts
          </span>
        )}
      </div>
    </section>
  );
}

function ScoreExplanationPanel({ score }: { score: CanonicalReviewScore | null }) {
  return (
    <section className="rounded-[24px] border border-line bg-panel-strong p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Score explanations</p>
      {score ? (
        <>
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <ReasonBlock label="Trust reasons" reasons={score.reasons.trustReasons} />
            <ReasonBlock label="Freshness reasons" reasons={score.reasons.freshnessReasons} />
            <ReasonBlock label="Priority reasons" reasons={score.reasons.priorityReasons} />
          </div>

          <div className="mt-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Flags</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {score.flags.length > 0 ? (
                score.flags.map((flag) => (
                  <span key={flag} className="rounded-full border border-danger/20 bg-danger-soft px-3 py-1 text-xs text-danger">
                    {flag}
                  </span>
                ))
              ) : (
                <span className="rounded-full border border-line bg-panel px-3 py-1 text-xs text-muted">
                  No active score flags
                </span>
              )}
            </div>
          </div>
        </>
      ) : (
        <p className="mt-3 text-sm leading-6 text-muted">
          Reasons and flags will appear here after the first scoring pass writes `job_scores`.
        </p>
      )}
    </section>
  );
}

function ReasonBlock({ label, reasons }: { label: string; reasons: string[] }) {
  return (
    <div className="rounded-[20px] border border-line bg-panel p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{label}</p>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-foreground">
        {reasons.length > 0 ? (
          reasons.map((reason) => <li key={reason}>{reason}</li>)
        ) : (
          <li className="text-muted">No reasons recorded.</li>
        )}
      </ul>
    </div>
  );
}

function formatConfidence(value: number | null): string {
  if (value === null) {
    return "n/a";
  }

  return `${Math.round(value * 100)}%`;
}

function formatRule(value: string): string {
  switch (value) {
    case "official_source_url":
      return "Official URL match";
    case "requisition_id":
      return "Requisition ID match";
    case "internal_job_id":
      return "Internal job ID match";
    case "fuzzy_title_location":
      return "Fuzzy title/location match";
    case "seed":
      return "Cluster seed";
    default:
      return value.replaceAll("_", " ");
  }
}

function formatEvidenceValue(value: string | null): string {
  return value ? value.toLowerCase().replaceAll("_", " ") : "n/a";
}

function formatReviewType(value: CanonicalReviewAnnotation["reviewType"]): string {
  switch (value) {
    case "MERGE_QUALITY":
      return "Merge quality";
    case "OFFICIAL_SOURCE":
      return "Official source";
    case "SCORE_CALIBRATION":
      return "Score calibration";
    case "GENERAL_NOTE":
      return "General note";
  }
}

function formatReviewDisposition(value: CanonicalReviewAnnotation["disposition"]): string {
  switch (value) {
    case "CONFIRMED":
      return "Confirmed";
    case "INCORRECT":
      return "Incorrect";
    case "NEEDS_FOLLOW_UP":
      return "Needs follow-up";
  }
}

function formatReviewStatus(value: CanonicalReviewJob["reviewStatus"]): string {
  switch (value) {
    case "FOLLOW_UP":
      return "Follow-up";
    case "NEEDS_FIRST_PASS":
      return "Needs first pass";
    case "REVIEWED_RESOLVED":
      return "Reviewed and stable";
    case "UNREVIEWED_STABLE":
      return "Unreviewed stable";
  }
}

function buildReviewHref(searchParams: Record<string, string | string[] | undefined>): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        params.append(key, entry);
      }

      continue;
    }

    if (typeof value === "string") {
      params.set(key, value);
    }
  }

  const query = params.toString();
  return query.length > 0 ? `/review/canonical?${query}` : "/review/canonical";
}
