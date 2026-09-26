import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RotateCcw, SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterDefinition {
  id: string;
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
}

interface FilterBarProps {
  filters: FilterDefinition[];
  onReset?: () => void;
  resultCount?: number;
  resultLabel?: string;
  children?: ReactNode;
  className?: string;
}

export function FilterBar({
  filters,
  onReset,
  resultCount,
  resultLabel = "results",
  children,
  className,
}: FilterBarProps) {
  return (
    <div
      data-ocid="filter_bar"
      className={cn(
        "flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card/60 p-3",
        className,
      )}
    >
      <span className="flex items-center gap-2 self-center pr-1 text-muted-foreground">
        <SlidersHorizontal className="size-4" aria-hidden />
        <span className="label-caps">Filters</span>
      </span>
      {filters.map((filter) => (
        <label key={filter.id} className="flex min-w-[9rem] flex-col gap-1">
          <span className="label-caps text-muted-foreground">
            {filter.label}
          </span>
          <select
            data-ocid={`filter_bar.select.${filter.id}`}
            value={filter.value}
            onChange={(event) => filter.onChange(event.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2.5 text-sm text-foreground outline-none transition-smooth focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          >
            {filter.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ))}
      {children}
      <div className="ml-auto flex items-center gap-3 self-center">
        {typeof resultCount === "number" ? (
          <span className="font-mono-id text-xs tabular-nums text-muted-foreground">
            {resultCount} {resultLabel}
          </span>
        ) : null}
        {onReset ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-ocid="filter_bar.reset_button"
            onClick={onReset}
            className="gap-1.5"
          >
            <RotateCcw className="size-3.5" aria-hidden />
            Reset
          </Button>
        ) : null}
      </div>
    </div>
  );
}
