import type { ReactNode } from "react";

import { getToneClasses } from "@/lib/label-metadata";

type BadgeProps = {
  children: ReactNode;
  detail: string;
  tone: "accent" | "positive" | "warning" | "danger" | "neutral";
};

export function Badge({ children, detail, tone }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-medium tracking-[0.12em] uppercase ${getToneClasses(tone)}`}
      title={detail}
    >
      {children}
    </span>
  );
}
