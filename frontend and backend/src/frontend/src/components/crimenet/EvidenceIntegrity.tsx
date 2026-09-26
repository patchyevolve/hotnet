import { formatDateTime } from "@/lib/crimenet/format";
import type { EvidenceRecord } from "@/lib/crimenet/types";
import { cn } from "@/lib/utils";
import { StatusPill } from "./StatusPill";

const integrityTone: Record<
  EvidenceRecord["integrity"],
  "success" | "warning" | "danger"
> = {
  verified: "success",
  pending: "warning",
  tampered: "danger",
};

const integrityLabel: Record<EvidenceRecord["integrity"], string> = {
  verified: "Verified",
  pending: "Pending",
  tampered: "Integrity Failed",
};

interface EvidenceIntegrityProps {
  records: EvidenceRecord[];
  className?: string;
}

export function EvidenceIntegrity({
  records,
  className,
}: EvidenceIntegrityProps) {
  const verified = records.filter(
    (record) => record.integrity === "verified",
  ).length;
  const total = records.length || 1;
  const percent = Math.round((verified / total) * 100);

  return (
    <div
      data-ocid="evidence_integrity"
      className={cn("flex flex-col gap-4", className)}
    >
      <div className="flex items-center gap-4">
        <div className="relative flex size-16 shrink-0 items-center justify-center">
          <svg
            viewBox="0 0 36 36"
            className="size-16 -rotate-90"
            role="img"
            aria-label="Integrity score"
          >
            <circle
              cx="18"
              cy="18"
              r="15.5"
              fill="none"
              stroke="oklch(var(--border))"
              strokeWidth="3"
            />
            <circle
              cx="18"
              cy="18"
              r="15.5"
              fill="none"
              stroke="oklch(var(--risk-low))"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={`${(percent / 100) * 97.4} 97.4`}
            />
          </svg>
          <span className="absolute font-mono-id text-sm font-semibold tabular-nums text-foreground">
            {percent}%
          </span>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">Chain integrity</p>
          <p className="text-xs text-muted-foreground">
            {verified} of {records.length} items verified against stored hashes
          </p>
        </div>
      </div>
      <ul className="flex flex-col divide-y divide-border/60">
        {records.map((record, index) => (
          <li
            key={record.id}
            data-ocid={`evidence_integrity.item.${index + 1}`}
            className="flex items-center justify-between gap-3 py-2.5"
          >
            <div className="min-w-0">
              <p className="truncate text-sm text-foreground">{record.label}</p>
              <p className="font-mono-id text-[11px] text-muted-foreground">
                {record.id} · {formatDateTime(record.collectedAt)}
              </p>
            </div>
            <StatusPill
              label={integrityLabel[record.integrity]}
              tone={integrityTone[record.integrity]}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
