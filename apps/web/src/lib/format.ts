import type { SalaryRange } from "@anti-ghost/domain";

export function formatSalaryRange(salary: SalaryRange | null): string {
  if (!salary) {
    return "Salary not disclosed";
  }

  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: salary.currency,
    maximumFractionDigits: 0,
  });

  if (salary.min && salary.max) {
    return `${formatter.format(salary.min)} - ${formatter.format(salary.max)} / ${salary.interval.toLowerCase()}`;
  }

  if (salary.min) {
    return `${formatter.format(salary.min)}+ / ${salary.interval.toLowerCase()}`;
  }

  if (salary.max) {
    return `Up to ${formatter.format(salary.max)} / ${salary.interval.toLowerCase()}`;
  }

  return "Salary not disclosed";
}

export function formatRelativeDays(date: string): string {
  const target = new Date(date);
  const now = new Date();
  const diffInMs = now.getTime() - target.getTime();
  const days = Math.max(0, Math.floor(diffInMs / (1000 * 60 * 60 * 24)));

  if (days === 0) {
    return "today";
  }

  if (days === 1) {
    return "1 day ago";
  }

  return `${days} days ago`;
}
