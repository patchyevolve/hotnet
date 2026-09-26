import { formatPercent } from "@/lib/crimenet/format";
import { getStrings } from "@/lib/crimenet/i18n";
import { useRole } from "@/lib/crimenet/role-context";
import { faceImageUrl } from "@/lib/crimenet/services";
import type { FaceComparisonSide, FaceRecord } from "@/lib/crimenet/types";
import { useState } from "react";

interface FaceComparisonProps {
  record: FaceRecord;
}

/**
 * Side-by-side review pair for a face match: the identity-bearing reference
 * image against the camera capture, each with the pipeline's pixel face box
 * drawn over it, plus the ArcFace similarity behind the claim. This is the
 * evidence an investigator weighs before confirm/reject.
 */
export function FaceComparison({ record }: FaceComparisonProps) {
  const { language } = useRole();
  const strings = getStrings(language);
  const comparison = record.comparison;

  if (!comparison) {
    return (
      <div
        data-ocid="face.comparison.empty"
        className="rounded-lg border border-dashed border-border bg-muted/10 px-3 py-4 text-center text-sm text-muted-foreground"
      >
        {strings.noComparison}
      </div>
    );
  }

  return (
    <div
      data-ocid="face.comparison"
      className="rounded-lg border border-border bg-muted/20 p-3"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="label-caps text-muted-foreground">
          {strings.faceComparisonTitle}
        </span>
        <span
          data-ocid="face.comparison.similarity"
          className="font-mono-id text-xs tabular-nums text-foreground"
        >
          {strings.similarityLabel}{" "}
          {formatPercent(comparison.similarity * 100, 1)}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <ComparisonSide
          label={strings.referenceImage}
          side={comparison.reference}
          ocid="face.comparison.reference"
        />
        <ComparisonSide
          label={strings.captureImage}
          side={comparison.capture}
          ocid="face.comparison.capture"
        />
      </div>
    </div>
  );
}

interface ComparisonSideProps {
  label: string;
  side: FaceComparisonSide;
  ocid: string;
}

function ComparisonSide({ label, side, ocid }: ComparisonSideProps) {
  const [dims, setDims] = useState<{ width: number; height: number } | null>(
    null,
  );
  const [failed, setFailed] = useState(false);
  const { bbox } = side;

  return (
    <figure className="min-w-0">
      <figcaption
        data-ocid={`${ocid}_label`}
        className="mb-1 flex items-center justify-between gap-2"
      >
        <span className="label-caps text-muted-foreground">{label}</span>
        <span className="font-mono-id truncate text-[11px] text-muted-foreground">
          {side.file}
        </span>
      </figcaption>
      <div
        data-ocid={`${ocid}_frame`}
        className="relative overflow-hidden rounded-md border border-border bg-background"
      >
        {failed ? (
          <div
            data-ocid={`${ocid}_fallback`}
            className="flex h-32 items-center justify-center px-2 text-center font-mono-id text-[11px] text-muted-foreground"
          >
            {side.file}
          </div>
        ) : (
          <img
            src={faceImageUrl(side.file)}
            alt={label}
            data-ocid={`${ocid}_image`}
            className="block w-full"
            onLoad={(event) =>
              setDims({
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              })
            }
            onError={() => setFailed(true)}
          />
        )}
        {dims && bbox ? (
          <span
            aria-hidden
            data-ocid={`${ocid}_bbox`}
            className="pointer-events-none absolute border-2 border-info bg-info/10"
            style={{
              left: `${(bbox.x / dims.width) * 100}%`,
              top: `${(bbox.y / dims.height) * 100}%`,
              width: `${(bbox.width / dims.width) * 100}%`,
              height: `${(bbox.height / dims.height) * 100}%`,
            }}
          />
        ) : null}
      </div>
    </figure>
  );
}
