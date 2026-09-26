import type { RiskLevel } from "@/lib/crimenet/types";
import { cn } from "@/lib/utils";

interface DonutSlice {
  label: string;
  value: number;
  tone: RiskLevel;
}

const toneColor: Record<RiskLevel, string> = {
  critical: "oklch(var(--risk-critical))",
  high: "oklch(var(--risk-high))",
  medium: "oklch(var(--risk-medium))",
  low: "oklch(var(--risk-low))",
};

interface DonutChartProps {
  data: DonutSlice[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
  className?: string;
}

export function DonutChart({
  data,
  size = 168,
  thickness = 18,
  centerLabel,
  centerValue,
  className,
}: DonutChartProps) {
  const total = data.reduce((sum, slice) => sum + slice.value, 0) || 1;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className={cn("flex items-center gap-5", className)}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label="Risk distribution donut chart"
          className="-rotate-90"
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="oklch(var(--border))"
            strokeWidth={thickness}
          />
          {data.map((slice) => {
            const length = (slice.value / total) * circumference;
            const dash = `${length} ${circumference - length}`;
            const element = (
              <circle
                key={slice.label}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={toneColor[slice.tone]}
                strokeWidth={thickness}
                strokeDasharray={dash}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            );
            offset += length;
            return element;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="metric-value text-2xl text-foreground">
            {centerValue ?? total}
          </span>
          {centerLabel ? (
            <span className="label-caps text-muted-foreground">
              {centerLabel}
            </span>
          ) : null}
        </div>
      </div>
      <ul className="flex min-w-0 flex-col gap-2">
        {data.map((slice) => (
          <li key={slice.label} className="flex items-center gap-2 text-sm">
            <span
              className="size-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: toneColor[slice.tone] }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
              {slice.label}
            </span>
            <span className="font-mono-id tabular-nums text-foreground">
              {slice.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
