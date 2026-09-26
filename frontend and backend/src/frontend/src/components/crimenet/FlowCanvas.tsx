import { formatCompactCurrency } from "@/lib/crimenet/format";
import type { MoneyFlow, RiskLevel } from "@/lib/crimenet/types";
import { cn } from "@/lib/utils";
import { useMemo, useState } from "react";

const riskColor: Record<RiskLevel, string> = {
  critical: "var(--risk-critical)",
  high: "var(--risk-high)",
  medium: "var(--risk-medium)",
  low: "var(--risk-low)",
};

interface FlowCanvasProps {
  flow: MoneyFlow;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  className?: string;
}

export function FlowCanvas({
  flow,
  selectedId,
  onSelect,
  className,
}: FlowCanvasProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const activeId = hovered ?? selectedId ?? null;

  const positions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    const count = flow.accounts.length;
    flow.accounts.forEach((account, index) => {
      const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
      map.set(account.id, {
        x: 50 + Math.cos(angle) * 34,
        y: 50 + Math.sin(angle) * 34,
      });
    });
    return map;
  }, [flow.accounts]);

  const maxAmount = Math.max(...flow.transactions.map((tx) => tx.amount), 1);

  return (
    <div
      data-ocid="flow_canvas"
      className={cn(
        "relative overflow-hidden rounded-lg border border-border bg-card",
        className,
      )}
    >
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, var(--border) 1px, transparent 0)",
          backgroundSize: "24px 24px",
        }}
        aria-hidden
      />
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="relative h-full w-full"
        role="img"
        aria-label="Money flow between accounts"
      >
        {flow.transactions.map((tx) => {
          const from = positions.get(tx.fromAccount);
          const to = positions.get(tx.toAccount);
          if (!from || !to) return null;
          const isActive = activeId === tx.id;
          const width = 0.3 + (tx.amount / maxAmount) * 1.1;
          return (
            <line
              key={tx.id}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke={riskColor[tx.risk]}
              strokeWidth={isActive ? width * 1.8 : width}
              strokeOpacity={isActive ? 0.95 : 0.45}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
      </svg>
      {flow.accounts.map((account) => {
        const position = positions.get(account.id);
        if (!position) return null;
        const isActive = activeId === account.id;
        return (
          <button
            key={account.id}
            type="button"
            data-ocid={`flow_canvas.account.${account.id}`}
            onClick={() => onSelect?.(account.id)}
            onMouseEnter={() => setHovered(account.id)}
            onMouseLeave={() => setHovered(null)}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 rounded-md outline-none transition-smooth focus-visible:ring-2 focus-visible:ring-ring"
            style={{ left: `${position.x}%`, top: `${position.y}%` }}
            aria-label={`${account.name} — ${account.bank}`}
          >
            <span
              className={cn(
                "flex size-9 items-center justify-center rounded-md border-2 font-mono-id text-[10px] font-semibold transition-smooth",
                isActive && "scale-110",
              )}
              style={{
                borderColor: riskColor[account.risk],
                backgroundColor: "var(--card)",
                color: riskColor[account.risk],
                boxShadow: isActive
                  ? `0 0 0 4px ${riskColor[account.risk]}22`
                  : undefined,
              }}
            >
              {account.bank ? account.bank.slice(0, 3).toUpperCase() : "\u2014"}
            </span>
            <span
              className={cn(
                "max-w-[8rem] truncate rounded px-1.5 py-0.5 text-[10px]",
                isActive
                  ? "bg-card text-foreground"
                  : "bg-card/70 text-muted-foreground",
              )}
            >
              {account.name}
            </span>
          </button>
        );
      })}
      <div className="absolute bottom-3 right-3 rounded-md border border-border bg-card/90 px-3 py-2 backdrop-blur">
        <p className="label-caps text-muted-foreground">Flagged volume</p>
        <p className="font-mono-id text-sm tabular-nums text-risk-critical">
          {formatCompactCurrency(flow.flaggedVolume)}
        </p>
      </div>
    </div>
  );
}
