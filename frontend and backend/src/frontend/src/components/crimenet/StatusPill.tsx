import { cn } from "@/lib/utils";

type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

const toneStyles: Record<StatusTone, string> = {
  neutral: "border-border bg-muted/40 text-muted-foreground",
  info: "border-info/40 bg-info/12 text-info",
  success: "border-risk-low/40 bg-risk-low/12 text-risk-low",
  warning: "border-risk-medium/40 bg-risk-medium/12 text-risk-medium",
  danger: "border-risk-critical/40 bg-risk-critical/12 text-risk-critical",
};

const dotStyles: Record<StatusTone, string> = {
  neutral: "bg-muted-foreground",
  info: "bg-info",
  success: "bg-risk-low",
  warning: "bg-risk-medium",
  danger: "bg-risk-critical",
};

interface StatusPillProps {
  label: string;
  tone?: StatusTone;
  pulse?: boolean;
  className?: string;
}

export function StatusPill({
  label,
  tone = "neutral",
  pulse = false,
  className,
}: StatusPillProps) {
  return (
    <span
      data-ocid={`status_pill.${tone}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
        toneStyles[tone],
        className,
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          dotStyles[tone],
          pulse && "animate-pulse-dot",
        )}
        aria-hidden
      />
      {label}
    </span>
  );
}
