import { formatDateTime, truncateMiddle } from "@/lib/crimenet/format";
import type { AuditEvent } from "@/lib/crimenet/types";
import { cn } from "@/lib/utils";
import { Link2, ShieldCheck } from "lucide-react";
import { RiskBadge } from "./RiskBadge";

interface AuditChainProps {
  events: AuditEvent[];
  className?: string;
}

export function AuditChain({ events, className }: AuditChainProps) {
  return (
    <div
      data-ocid="audit_chain"
      className={cn("flex flex-col gap-2", className)}
    >
      <div className="flex items-center gap-2 rounded-md border border-risk-low/30 bg-risk-low/8 px-3 py-2 text-xs text-risk-low">
        <ShieldCheck className="size-4 shrink-0" aria-hidden />
        Hash chain verified across {events.length} entries
      </div>
      <ol className="flex flex-col gap-2">
        {events.map((event, index) => (
          <li
            key={event.id}
            data-ocid={`audit_chain.item.${index + 1}`}
            className="rounded-lg border border-border bg-card/60 p-3"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {event.action}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {[event.actor, event.role, event.target]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <RiskBadge risk={event.severity} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono-id text-[11px] text-muted-foreground">
              {event.hash ? (
                <span className="flex items-center gap-1">
                  <Link2 className="size-3" aria-hidden />
                  {truncateMiddle(event.hash, 8, 6)}
                </span>
              ) : null}
              {event.prevHash ? (
                <span>prev {truncateMiddle(event.prevHash, 8, 6)}</span>
              ) : null}
              {event.ip ? <span>{event.ip}</span> : null}
              <time className="tabular-nums">{formatDateTime(event.at)}</time>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
