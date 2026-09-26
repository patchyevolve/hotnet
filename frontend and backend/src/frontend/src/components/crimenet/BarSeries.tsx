import { cn } from "@/lib/utils";

interface BarSeriesProps {
  data: { label: string; value: number }[];
  className?: string;
  tone?: string;
  height?: number;
  valueFormatter?: (value: number) => string;
}

export function BarSeries({
  data,
  className,
  tone = "oklch(var(--info))",
  height = 160,
  valueFormatter,
}: BarSeriesProps) {
  const max = Math.max(...data.map((item) => item.value), 1);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-end gap-2" style={{ height }}>
        {data.map((item, index) => {
          const ratio = item.value / max;
          return (
            <div
              key={item.label}
              className="flex min-w-0 flex-1 flex-col items-center gap-2"
            >
              <span className="font-mono-id text-[11px] tabular-nums text-muted-foreground">
                {valueFormatter ? valueFormatter(item.value) : item.value}
              </span>
              <div
                data-ocid={`bar_series.bar.${index + 1}`}
                className="w-full rounded-t-sm transition-smooth"
                style={{
                  height: `${Math.max(ratio * (height - 28), 4)}px`,
                  backgroundColor: tone,
                  opacity: 0.35 + ratio * 0.65,
                }}
                title={`${item.label}: ${item.value}`}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-2">
        {data.map((item) => (
          <span
            key={item.label}
            className="min-w-0 flex-1 truncate text-center text-[11px] text-muted-foreground"
          >
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}
