import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface DetailPanelProps {
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function DetailPanel({
  title,
  subtitle,
  badge,
  children,
  footer,
  className,
}: DetailPanelProps) {
  return (
    <aside
      data-ocid="detail_panel"
      className={cn("panel flex flex-col overflow-hidden", className)}
    >
      <div className="panel-header flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate font-display text-sm font-semibold text-foreground">
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-0.5 truncate font-mono-id text-xs text-muted-foreground">
              {subtitle}
            </p>
          ) : null}
        </div>
        {badge}
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-auto p-4">
        {children}
      </div>
      {footer ? (
        <div className="border-t border-border p-3">{footer}</div>
      ) : null}
    </aside>
  );
}

interface DetailFieldProps {
  label: string;
  value: ReactNode;
  mono?: boolean;
}

export function DetailField({ label, value, mono = false }: DetailFieldProps) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/60 py-2 last:border-b-0">
      <span className="label-caps shrink-0 pt-0.5 text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "min-w-0 text-right text-sm text-foreground",
          mono && "font-mono-id tabular-nums",
        )}
      >
        {value === null || value === undefined || value === ""
          ? "\u2014"
          : value}
      </span>
    </div>
  );
}
