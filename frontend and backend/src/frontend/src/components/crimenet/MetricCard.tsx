import type { RiskLevel } from "@/lib/crimenet/types";
import { cn } from "@/lib/utils";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { Sparkline } from "./Sparkline";

type MetricTone = RiskLevel | "info";

const toneText: Record<MetricTone, string> = {
  critical: "text-risk-critical",
  high: "text-risk-high",
  medium: "text-risk-medium",
  low: "text-risk-low",
  info: "text-info",
};

const toneStroke: Record<MetricTone, string> = {
  critical: "var(--risk-critical)",
  high: "var(--risk-high)",
  medium: "var(--risk-medium)",
  low: "var(--risk-low)",
  info: "var(--info)",
};

interface MetricCardProps {
  label: string;
  value: string;
  delta: string;
  trend: "up" | "down" | "flat";
  tone: MetricTone;
  series: number[];
  index?: number;
}

export function MetricCard({
  label,
  value,
  delta,
  trend,
  tone,
  series,
  index = 0,
}: MetricCardProps) {
  const TrendIcon =
    trend === "up"
      ? ArrowUpRight
      : trend === "down"
        ? ArrowDownRight
        : ArrowRight;
  return (
    <div
      data-ocid={`metric_card.${index + 1}`}
      className="panel flex flex-col gap-3 p-4 transition-smooth hover:border-border/80"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="label-caps text-muted-foreground">{label}</span>
        <span
          className={cn(
            "flex items-center gap-1 text-xs font-medium",
            toneText[tone],
          )}
        >
          <TrendIcon className="size-3.5" aria-hidden />
          {delta}
        </span>
      </div>
      <div className="flex items-end justify-between gap-3">
        <span className="metric-value text-foreground">{value}</span>
        <Sparkline
          data={series}
          stroke={toneStroke[tone]}
          className="h-8 w-24"
        />
      </div>
    </div>
  );
}
