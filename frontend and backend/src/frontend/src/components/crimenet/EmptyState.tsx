import { cn } from "@/lib/utils";
import { SearchX } from "lucide-react";
import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  body: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

export function EmptyState({
  title,
  body,
  action,
  icon,
  className,
}: EmptyStateProps) {
  return (
    <div
      data-ocid="empty_state"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card/40 px-6 py-12 text-center",
        className,
      )}
    >
      <span className="flex size-11 items-center justify-center rounded-full border border-border bg-muted/40 text-muted-foreground">
        {icon ?? <SearchX className="size-5" aria-hidden />}
      </span>
      <div className="space-y-1">
        <p className="font-display text-base font-medium text-foreground">
          {title}
        </p>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">{body}</p>
      </div>
      {action}
    </div>
  );
}
