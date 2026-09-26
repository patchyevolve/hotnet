import { riskLabels } from "@/lib/crimenet/format";
import type { RiskLevel } from "@/lib/crimenet/types";
import { cn } from "@/lib/utils";

const riskStyles: Record<RiskLevel, string> = {
  critical: "border-risk-critical/40 bg-risk-critical/12 text-risk-critical",
  high: "border-risk-high/40 bg-risk-high/12 text-risk-high",
  medium: "border-risk-medium/40 bg-risk-medium/12 text-risk-medium",
  low: "border-risk-low/40 bg-risk-low/12 text-risk-low",
};

const dotStyles: Record<RiskLevel, string> = {
  critical: "bg-risk-critical",
  high: "bg-risk-high",
  medium: "bg-risk-medium",
  low: "bg-risk-low",
};

interface RiskBadgeProps {
  risk: RiskLevel;
  label?: string;
  showDot?: boolean;
  className?: string;
}

export function RiskBadge({
  risk,
  label,
  showDot = true,
  className,
}: RiskBadgeProps) {
  return (
    <span
      data-ocid={`risk_badge.${risk}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider",
        riskStyles[risk],
        className,
      )}
    >
      {showDot ? (
        <span
          className={cn("size-1.5 rounded-full", dotStyles[risk])}
          aria-hidden
        />
      ) : null}
      {label ?? riskLabels[risk]}
    </span>
  );
}
