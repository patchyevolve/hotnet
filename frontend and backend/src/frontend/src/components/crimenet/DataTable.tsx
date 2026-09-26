import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T, index: number) => ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  onRowClick?: (row: T) => void;
  emptyState?: ReactNode;
  className?: string;
  dense?: boolean;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  emptyState,
  className,
  dense = false,
}: DataTableProps<T>) {
  if (rows.length === 0 && emptyState) {
    return <div className={className}>{emptyState}</div>;
  }

  return (
    <div
      data-ocid="data_table"
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-card",
        className,
      )}
    >
      <div className="scrollbar-thin max-h-[560px] overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-card/95 backdrop-blur">
            <tr className="border-b border-border">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn(
                    "label-caps whitespace-nowrap px-3 py-2.5 text-muted-foreground",
                    column.align === "right" && "text-right",
                    column.align === "center" && "text-center",
                    column.align !== "right" &&
                      column.align !== "center" &&
                      "text-left",
                    column.className,
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={rowKey(row, index)}
                data-ocid={`data_table.row.${index + 1}`}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={
                  onRowClick
                    ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onRowClick(row);
                        }
                      }
                    : undefined
                }
                tabIndex={onRowClick ? 0 : undefined}
                className={cn(
                  "border-b border-border/60 transition-smooth last:border-b-0",
                  onRowClick && "cursor-pointer hover:bg-muted/40",
                )}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      "px-3 align-middle text-foreground",
                      dense ? "py-2" : "py-2.5",
                      column.align === "right" && "text-right",
                      column.align === "center" && "text-center",
                      column.className,
                    )}
                  >
                    {column.render(row, index)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
