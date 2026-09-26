import { formatDateTime } from "@/lib/crimenet/format";
import type { RiskLevel, TimelineEvent } from "@/lib/crimenet/types";
import { cn } from "@/lib/utils";

const kindColor: Record<TimelineEvent["kind"], string> = {
  case: "oklch(var(--info))",
  cdr: "oklch(var(--accent-blue))",
  money: "oklch(var(--risk-medium))",
  evidence: "oklch(var(--neutral-purple))",
  network: "oklch(var(--risk-high))",
  face: "oklch(var(--risk-critical))",
};

const riskRing: Record<RiskLevel, string> = {
  critical: "ring-risk-critical/40",
  high: "ring-risk-high/40",
  medium: "ring-risk-medium/40",
  low: "ring-risk-low/40",
};

interface TimelineProps {
  events: TimelineEvent[];
  className?: string;
  compact?: boolean;
}

export function Timeline({
  events,
  className,
  compact = false,
}: TimelineProps) {
  return (
    <ol
      data-ocid="timeline"
      className={cn("relative flex flex-col", className)}
    >
      <span
        className="absolute bottom-2 left-[7px] top-2 w-px bg-border"
        aria-hidden
      />
      {events.map((event, index) => (
        <li
          key={event.id}
          data-ocid={`timeline.item.${index + 1}`}
          className={cn("relative flex gap-3 pl-0", compact ? "pb-3" : "pb-5")}
        >
          <span
            className={cn(
              "relative z-10 mt-1 size-3.5 shrink-0 rounded-full ring-4 ring-background",
              riskRing[event.risk],
            )}
            style={{ backgroundColor: kindColor[event.kind] }}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <p className="text-sm font-medium text-foreground">
                {event.title}
              </p>
              <time className="font-mono-id text-[11px] tabular-nums text-muted-foreground">
                {formatDateTime(event.at)}
              </time>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {event.detail}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
