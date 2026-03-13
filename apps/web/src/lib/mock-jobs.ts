import type { JobDetail } from "@anti-ghost/domain";

export const mockJobs: JobDetail[] = [
  {
    id: "job_signalworks_staff-data-platform-engineer",
    slug: "signalworks-staff-data-platform-engineer",
    title: "Staff Data Platform Engineer",
    company: "SignalWorks",
    location: "Chicago, IL",
    remoteType: "HYBRID",
    salary: {
      currency: "USD",
      min: 182000,
      max: 228000,
      interval: "YEAR",
    },
    officialSourceStatus: "FOUND",
    officialSourceUrl: "https://careers.signalworks.example/jobs/staff-data-platform-engineer",
    trustLabel: "HIGH_CONFIDENCE_REAL",
    freshnessLabel: "NEW",
    priorityLabel: "APPLY_NOW",
    reasonSummary: "Official careers page and matching Greenhouse posting agree on title, location, and salary.",
    trustReasons: [
      "Found on the official employer careers page.",
      "Matching Greenhouse posting found with the same requisition details.",
      "Application flow appears active on the official destination.",
    ],
    freshnessReasons: [
      "First seen 2 days ago.",
      "Official source still active.",
      "No repost cycle detected.",
    ],
    priorityReasons: [
      "High trust and strong freshness make this worth time now.",
      "Salary is transparent.",
    ],
    redFlags: [],
    sources: [
      {
        name: "SignalWorks Careers",
        kind: "Official careers page",
        url: "https://careers.signalworks.example/jobs/staff-data-platform-engineer",
      },
      {
        name: "Greenhouse",
        kind: "Public ATS",
        url: "https://boards.greenhouse.example/signalworks/jobs/481516",
      },
    ],
    firstSeenAt: "2026-03-10T08:15:00.000Z",
    lastSeenAt: "2026-03-12T04:10:00.000Z",
    repostCount: 0,
    savedJob: null,
    overview:
      "SignalWorks is hiring for a platform-heavy engineering role with strong evidence that the listing is current, official, and consistent across trusted sources.",
    listingHistory: [
      "First seen on March 10, 2026 from the official careers page.",
      "Matched to a Greenhouse record within the same crawl window.",
      "Still active on the official application endpoint on March 12, 2026.",
    ],
  },
  {
    id: "job_northstar-health_senior-product-analyst",
    slug: "northstar-health-senior-product-analyst",
    title: "Senior Product Analyst",
    company: "Northstar Health",
    location: "Remote (US)",
    remoteType: "REMOTE",
    salary: null,
    officialSourceStatus: "ATS_ONLY",
    officialSourceUrl: "https://jobs.ashbyhq.example/northstar-health/senior-product-analyst",
    trustLabel: "MEDIUM_CONFIDENCE",
    freshnessLabel: "AGING",
    priorityLabel: "APPLY_SOON",
    reasonSummary: "Trusted ATS source is live, but the same listing has been refreshed several times over the past month.",
    trustReasons: [
      "Listing is on a trusted public ATS source.",
      "Company name and application domain are aligned.",
    ],
    freshnessReasons: [
      "First seen 24 days ago.",
      "Description changes have been minor across reposts.",
      "Application endpoint still appears open.",
    ],
    priorityReasons: [
      "Still worth consideration because the application flow is live.",
      "Lower urgency because of repeated refresh behavior.",
    ],
    redFlags: [
      "Reposted 3 times with only superficial text changes.",
    ],
    sources: [
      {
        name: "Ashby",
        kind: "Public ATS",
        url: "https://jobs.ashbyhq.example/northstar-health/senior-product-analyst",
      },
      {
        name: "Structured careers page",
        kind: "Company site metadata",
        url: "https://northstarhealth.example/careers/senior-product-analyst",
      },
    ],
    firstSeenAt: "2026-02-16T13:40:00.000Z",
    lastSeenAt: "2026-03-11T21:00:00.000Z",
    repostCount: 3,
    savedJob: null,
    overview:
      "Northstar Health looks legitimate, but this role is old enough that users should apply soon rather than assume it will remain worthwhile.",
    listingHistory: [
      "First seen on February 16, 2026 from Ashby.",
      "Observed again on February 24, 2026 with small copy edits.",
      "Observed again on March 3, 2026 and March 11, 2026 with near-identical text.",
    ],
  },
  {
    id: "job_atlas-grid_remote-customer-success-director",
    slug: "atlas-grid-remote-customer-success-director",
    title: "Remote Customer Success Director",
    company: "Atlas Grid",
    location: "Austin, TX",
    remoteType: "REMOTE",
    salary: {
      currency: "USD",
      min: 240000,
      max: 320000,
      interval: "YEAR",
    },
    officialSourceStatus: "MISSING",
    officialSourceUrl: null,
    trustLabel: "SUSPICIOUS_LOW_CONFIDENCE",
    freshnessLabel: "LIKELY_STALE",
    priorityLabel: "AVOID_FOR_NOW",
    reasonSummary: "Only mirror sites remain, no official source was verified, and the pay/title mix looks unusually broad.",
    trustReasons: [
      "The listing appears on multiple third-party pages.",
    ],
    freshnessReasons: [
      "Official destination could not be verified.",
      "The same body has remained on mirrors for 41 days.",
    ],
    priorityReasons: [
      "Trust and freshness are both weak, so this is a poor use of time right now.",
    ],
    redFlags: [
      "Official source missing.",
      "Compensation range is unusually high relative to the role description.",
      "Only mirror listings remain live.",
    ],
    sources: [
      {
        name: "JobMirrorHub",
        kind: "Supplemental mirror",
        url: "https://jobmirrorhub.example/listings/atlas-grid-customer-success-director",
      },
      {
        name: "FastApplyJobs",
        kind: "Supplemental mirror",
        url: "https://fastapplyjobs.example/atlas-grid/remote-customer-success-director",
      },
    ],
    firstSeenAt: "2026-01-30T10:30:00.000Z",
    lastSeenAt: "2026-03-06T17:55:00.000Z",
    repostCount: 4,
    savedJob: null,
    overview:
      "Atlas Grid is the kind of listing the product is meant to deprioritize: missing official evidence, aging badly, and still circulating on mirrors.",
    listingHistory: [
      "First seen on January 30, 2026 on a third-party mirror.",
      "No official company or ATS posting was matched during later checks.",
      "Last confirmed live only on mirrors on March 6, 2026.",
    ],
  },
];

export function getJobBySlug(slug: string): JobDetail | undefined {
  return mockJobs.find((job) => job.slug === slug);
}
