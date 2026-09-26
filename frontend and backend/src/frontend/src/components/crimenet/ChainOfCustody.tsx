import { formatDateTime } from "@/lib/crimenet/format";
import type { CustodyEvent } from "@/lib/crimenet/types";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  FileCheck2,
  FlaskConical,
  PackageCheck,
  ShieldCheck,
} from "lucide-react";

const actionIcon = {
  collected: PackageCheck,
  transferred: ArrowRight,
  analyzed: FlaskConical,
  returned: ArrowRight,
  sealed: ShieldCheck,
} as const;

const actionLabel: Record<CustodyEvent["action"], string> = {
  collected: "Collected",
  transferred: "Transferred",
  analyzed: "Analyzed",
  returned: "Returned",
  sealed: "Sealed",
};

interface ChainOfCustodyProps {
  events: CustodyEvent[];
  className?: string;
}

export function ChainOfCustody({ events, className }: ChainOfCustodyProps) {
  return (
    <ol
      data-ocid="chain_of_custody"
      className={cn("flex flex-col gap-3", className)}
    >
      {events.map((event, index) => {
        const Icon = actionIcon[event.action] ?? FileCheck2;
        return (
          <li
            key={event.id}
            data-ocid={`chain_of_custody.item.${index + 1}`}
            className="flex gap-3 rounded-lg border border-border bg-card/60 p-3"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40 text-info">
              <Icon className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p className="text-sm font-medium text-foreground">
                  {actionLabel[event.action]}
                </p>
                <time className="font-mono-id text-[11px] tabular-nums text-muted-foreground">
                  {formatDateTime(event.at)}
                </time>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {[event.actor, event.location].filter(Boolean).join(" · ")}
              </p>
              {event.note ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {event.note}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
