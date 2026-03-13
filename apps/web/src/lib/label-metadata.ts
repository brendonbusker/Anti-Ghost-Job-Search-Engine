import type {
  FreshnessLabel,
  OfficialSourceStatus,
  PriorityLabel,
  TrustLabel,
} from "@anti-ghost/domain";

type Tone = "accent" | "positive" | "warning" | "danger" | "neutral";

export function getTrustMetadata(label: TrustLabel): { text: string; tone: Tone; detail: string } {
  switch (label) {
    case "HIGH_CONFIDENCE_REAL":
      return {
        text: "High confidence real",
        tone: "positive",
        detail: "Multiple high-trust signals support this listing.",
      };
    case "MEDIUM_CONFIDENCE":
      return {
        text: "Medium confidence",
        tone: "accent",
        detail: "There is useful evidence, but it is not complete.",
      };
    case "UNVERIFIED_SOURCE":
      return {
        text: "Unverified source",
        tone: "warning",
        detail: "The job may be legitimate, but the source confidence is incomplete.",
      };
    case "SUSPICIOUS_LOW_CONFIDENCE":
      return {
        text: "Suspicious / low confidence",
        tone: "danger",
        detail: "Multiple caution signals suggest this listing needs skepticism.",
      };
  }
}

export function getFreshnessMetadata(label: FreshnessLabel): {
  text: string;
  tone: Tone;
  detail: string;
} {
  switch (label) {
    case "NEW":
      return {
        text: "New",
        tone: "positive",
        detail: "Recently seen and still backed by good activity evidence.",
      };
    case "FRESH":
      return {
        text: "Fresh",
        tone: "accent",
        detail: "Still timely enough to prioritize.",
      };
    case "AGING":
      return {
        text: "Aging",
        tone: "warning",
        detail: "Still worth checking, but urgency is rising.",
      };
    case "POSSIBLY_STALE":
      return {
        text: "Possibly stale",
        tone: "warning",
        detail: "Some evidence suggests the listing may be losing value.",
      };
    case "LIKELY_STALE":
      return {
        text: "Likely stale",
        tone: "danger",
        detail: "Evidence suggests the job may no longer be actively hiring.",
      };
    case "REPOSTED_REPEATEDLY":
      return {
        text: "Reposted repeatedly",
        tone: "danger",
        detail: "This listing pattern suggests recycling rather than fresh demand.",
      };
  }
}

export function getPriorityMetadata(label: PriorityLabel): {
  text: string;
  tone: Tone;
  detail: string;
} {
  switch (label) {
    case "APPLY_NOW":
      return {
        text: "Apply now",
        tone: "positive",
        detail: "This looks like a strong time-to-apply opportunity.",
      };
    case "APPLY_SOON":
      return {
        text: "Apply soon",
        tone: "accent",
        detail: "The opportunity looks worthwhile but not urgent enough to outrank the best leads.",
      };
    case "LOW_PRIORITY":
      return {
        text: "Low priority",
        tone: "warning",
        detail: "Keep only if it fits your target tightly.",
      };
    case "AVOID_FOR_NOW":
      return {
        text: "Avoid for now",
        tone: "danger",
        detail: "Current evidence suggests your time is better spent elsewhere.",
      };
  }
}

export function getOfficialSourceMetadata(status: OfficialSourceStatus): {
  text: string;
  tone: Tone;
  detail: string;
} {
  switch (status) {
    case "FOUND":
      return {
        text: "Official source found",
        tone: "positive",
        detail: "A company-owned careers page or trusted ATS destination is available.",
      };
    case "ATS_ONLY":
      return {
        text: "Trusted ATS source",
        tone: "accent",
        detail: "A direct ATS posting was found, but the company careers page was not confirmed separately.",
      };
    case "MISSING":
      return {
        text: "Official source missing",
        tone: "warning",
        detail: "No official company or trusted ATS destination was verified.",
      };
  }
}

export function getToneClasses(tone: Tone): string {
  switch (tone) {
    case "positive":
      return "border-success/25 bg-success-soft text-success";
    case "accent":
      return "border-accent/20 bg-accent-soft text-accent";
    case "warning":
      return "border-warning/20 bg-warning-soft text-warning";
    case "danger":
      return "border-danger/20 bg-danger-soft text-danger";
    case "neutral":
      return "border-line-strong/40 bg-panel-strong text-foreground";
  }
}
