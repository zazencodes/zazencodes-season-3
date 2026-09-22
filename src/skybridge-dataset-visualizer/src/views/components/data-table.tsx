import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@alpic-ai/ui/components/table";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { useEffect, useRef } from "react";
import type { ColorScale } from "@/views/colors.js";
import { categoryOf, type Explorer, numberOf } from "@/views/use-explorer.js";

export default function DataTable({
  explorer,
  scale,
  height,
}: {
  explorer: Explorer;
  scale: ColorScale;
  height: number;
}) {
  const { fields, sorted, sort, toggleSort, selected, select, color } =
    explorer;
  const selectedRef = useRef<HTMLTableRowElement>(null);

  // Keep the row picked on the chart in view.
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  return (
    <div
      className="min-w-0 overflow-auto rounded-xl border border-border-secondary"
      style={{ maxHeight: height }}
    >
      <Table containerClassName="border-0">
      <TableHeader className="sticky top-0 z-10 bg-background">
        <TableRow>
          {fields.map((field) => {
            const isSorted = sort?.key === field.key;
            const Icon = !isSorted
              ? ChevronsUpDown
              : sort.direction === "asc"
                ? ArrowUp
                : ArrowDown;

            return (
              <TableHead key={field.key} className="whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => toggleSort(field.key)}
                  aria-label={`Sort by ${field.label}`}
                  className={`flex w-full items-center gap-1 cursor-pointer hover:text-foreground ${
                    field.kind === "quantitative" ? "justify-end" : ""
                  } ${isSorted ? "text-foreground" : ""}`}
                >
                  {field.label}
                  <Icon className="size-3 shrink-0" />
                </button>
              </TableHead>
            );
          })}
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map(({ index, row }) => {
          const isSelected = index === selected;

          return (
            <TableRow
              key={index}
              ref={isSelected ? selectedRef : undefined}
              onClick={() => select(index)}
              data-state={isSelected ? "selected" : undefined}
              className={`cursor-pointer ${isSelected ? "bg-muted" : ""}`}
            >
              {fields.map((field) => {
                const value = numberOf(row, field.key);

                return (
                  <TableCell
                    key={field.key}
                    className={
                      field.kind === "quantitative"
                        ? "text-right tabular-nums"
                        : ""
                    }
                  >
                    {field.key === color && (
                      <span
                        className="mr-1.5 inline-block size-2 rounded-full align-middle"
                        style={{
                          background: scale(categoryOf(row, field.key)),
                        }}
                      />
                    )}
                    {field.kind === "quantitative"
                      ? (value?.toLocaleString() ?? "—")
                      : categoryOf(row, field.key)}
                  </TableCell>
                );
              })}
            </TableRow>
          );
        })}
        {sorted.length === 0 && (
          <TableRow>
            <TableCell
              colSpan={fields.length}
              className="text-center text-muted-foreground"
            >
              No rows match the current filters.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
      </Table>
    </div>
  );
}
