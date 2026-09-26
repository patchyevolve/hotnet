import { cn } from "@/lib/utils";

interface SparklineProps {
  data: number[];
  stroke?: string;
  className?: string;
  fill?: boolean;
}

export function Sparkline({
  data,
  stroke = "var(--info)",
  className,
  fill = true,
}: SparklineProps) {
  if (data.length < 2) return null;

  const width = 100;
  const height = 32;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * width;
    const y = height - ((value - min) / range) * (height - 4) - 2;
    return { x, y };
  });

  const line = points
    .map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`)
    .join(" ");
  const area = `0,${height} ${line} ${width},${height}`;
  const gradientId = `spark-${stroke.replace(/[^a-z0-9]/gi, "")}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn("overflow-visible", className)}
      role="img"
      aria-label="Trend sparkline"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill ? <polygon points={area} fill={`url(#${gradientId})`} /> : null}
      <polyline
        points={line}
        fill="none"
        stroke={stroke}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
