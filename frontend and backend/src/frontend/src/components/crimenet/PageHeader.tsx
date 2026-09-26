import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description: string;
  eyebrow?: string;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header
      data-ocid="page_header"
      className={cn(
        "flex flex-wrap items-start justify-between gap-4 pb-5",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <p className="label-caps mb-1.5 text-info">{eyebrow}</p>
        ) : null}
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        <p className="mt-1.5 max-w-3xl text-sm text-muted-foreground">
          {description}
        </p>
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}
