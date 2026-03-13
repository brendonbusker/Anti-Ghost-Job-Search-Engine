import type { JobSearchFilters } from "@anti-ghost/domain";

type FilterSidebarProps = {
  filters: JobSearchFilters;
};

export function FilterSidebar({ filters }: FilterSidebarProps) {
  return (
    <aside className="panel-shadow flex h-fit flex-col gap-5 rounded-[28px] border border-line bg-panel p-6">
      <div>
        <p className="font-heading text-xs font-semibold uppercase tracking-[0.3em] text-muted">
          Filters
        </p>
        <h2 className="mt-2 text-xl font-semibold text-foreground">Search quality first</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          V1 should push users toward trustworthy, actionable jobs instead of maximizing raw listing volume.
        </p>
      </div>

      <div className="rounded-2xl border border-line bg-panel-strong p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">MVP</p>
        <p className="mt-2 text-sm leading-6 text-foreground">
          Keyword, company, salary, freshness, trust, priority, and official-route filters all belong in V1 because
          they change whether a job is worth opening now.
        </p>
      </div>

      <form method="get" className="space-y-5">
        <label className="block border-t border-line pt-5">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Keyword</span>
          <input
            type="text"
            name="q"
            defaultValue={filters.q}
            placeholder="Title, company, reason..."
            className="mt-3 w-full rounded-2xl border border-line bg-white/70 px-3 py-2 text-sm text-foreground outline-none transition focus:border-line-strong"
          />
        </label>

        <label className="block border-t border-line pt-5">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Company</span>
          <input
            type="text"
            name="company"
            defaultValue={filters.company}
            placeholder="Employer name"
            className="mt-3 w-full rounded-2xl border border-line bg-white/70 px-3 py-2 text-sm text-foreground outline-none transition focus:border-line-strong"
          />
        </label>

        <label className="block border-t border-line pt-5">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Location</span>
          <input
            type="text"
            name="location"
            defaultValue={filters.location}
            placeholder="City, state, remote..."
            className="mt-3 w-full rounded-2xl border border-line bg-white/70 px-3 py-2 text-sm text-foreground outline-none transition focus:border-line-strong"
          />
        </label>

        <label className="block border-t border-line pt-5">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Work setup</span>
          <select
            name="remoteType"
            defaultValue={filters.remoteType ?? ""}
            className="mt-3 w-full rounded-2xl border border-line bg-white/70 px-3 py-2 text-sm text-foreground outline-none transition focus:border-line-strong"
          >
            <option value="">Any</option>
            <option value="REMOTE">Remote</option>
            <option value="HYBRID">Hybrid</option>
            <option value="ONSITE">On-site</option>
          </select>
        </label>

        <label className="block border-t border-line pt-5">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Trust</span>
          <select
            name="trustLabel"
            defaultValue={filters.trustLabel ?? ""}
            className="mt-3 w-full rounded-2xl border border-line bg-white/70 px-3 py-2 text-sm text-foreground outline-none transition focus:border-line-strong"
          >
            <option value="">Any</option>
            <option value="HIGH_CONFIDENCE_REAL">High confidence real</option>
            <option value="MEDIUM_CONFIDENCE">Medium confidence</option>
            <option value="UNVERIFIED_SOURCE">Unverified source</option>
            <option value="SUSPICIOUS_LOW_CONFIDENCE">Suspicious</option>
          </select>
        </label>

        <label className="block border-t border-line pt-5">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Freshness</span>
          <select
            name="freshnessLabel"
            defaultValue={filters.freshnessLabel ?? ""}
            className="mt-3 w-full rounded-2xl border border-line bg-white/70 px-3 py-2 text-sm text-foreground outline-none transition focus:border-line-strong"
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

        <label className="block border-t border-line pt-5">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Priority</span>
          <select
            name="priorityLabel"
            defaultValue={filters.priorityLabel ?? ""}
            className="mt-3 w-full rounded-2xl border border-line bg-white/70 px-3 py-2 text-sm text-foreground outline-none transition focus:border-line-strong"
          >
            <option value="">Any</option>
            <option value="APPLY_NOW">Apply now</option>
            <option value="APPLY_SOON">Apply soon</option>
            <option value="LOW_PRIORITY">Low priority</option>
            <option value="AVOID_FOR_NOW">Avoid for now</option>
          </select>
        </label>

        <label className="block border-t border-line pt-5">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Official routing</span>
          <select
            name="officialSourceStatus"
            defaultValue={filters.officialSourceStatus ?? ""}
            className="mt-3 w-full rounded-2xl border border-line bg-white/70 px-3 py-2 text-sm text-foreground outline-none transition focus:border-line-strong"
          >
            <option value="">Any</option>
            <option value="FOUND">Official source found</option>
            <option value="ATS_ONLY">Trusted ATS only</option>
            <option value="MISSING">Official source missing</option>
          </select>
        </label>

        <label className="block border-t border-line pt-5">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Minimum salary</span>
          <select
            name="salaryMin"
            defaultValue={filters.salaryMin?.toString() ?? ""}
            className="mt-3 w-full rounded-2xl border border-line bg-white/70 px-3 py-2 text-sm text-foreground outline-none transition focus:border-line-strong"
          >
            <option value="">Any salary</option>
            <option value="80000">$80k+</option>
            <option value="120000">$120k+</option>
            <option value="160000">$160k+</option>
            <option value="200000">$200k+</option>
          </select>
        </label>

        <label className="flex items-start gap-3 border-t border-line pt-5">
          <input
            type="checkbox"
            name="officialSourceOnly"
            value="true"
            defaultChecked={filters.officialSourceOnly}
            className="mt-1 h-4 w-4 accent-[var(--accent)]"
          />
          <span>
            <span className="block text-sm font-medium text-foreground">Hide missing official routes</span>
            <span className="mt-1 block text-sm leading-6 text-muted">
              Keep only jobs that route to a company-owned page or a trusted ATS destination.
            </span>
          </span>
        </label>

        <label className="block border-t border-line pt-5">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Sort</span>
          <select
            name="sort"
            defaultValue={filters.sort}
            className="mt-3 w-full rounded-2xl border border-line bg-white/70 px-3 py-2 text-sm text-foreground outline-none transition focus:border-line-strong"
          >
            <option value="priority">Priority</option>
            <option value="freshness">Freshness</option>
            <option value="recent">Recent</option>
          </select>
        </label>

        <div className="flex flex-wrap gap-3 border-t border-line pt-5">
          <button
            type="submit"
            className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition hover:opacity-90"
          >
            Apply filters
          </button>
          <a
            href="/"
            className="rounded-full border border-line-strong px-4 py-2 text-sm font-medium text-foreground transition hover:bg-panel-strong"
          >
            Reset
          </a>
        </div>
      </form>
    </aside>
  );
}
