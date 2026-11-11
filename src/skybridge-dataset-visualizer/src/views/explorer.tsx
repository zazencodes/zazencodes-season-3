import "@/index.css";

import { Button } from "@alpic-ai/ui/components/button";
import { Maximize2, Minimize2, RotateCcw, Sparkles, Table2 } from "lucide-react";
import {
  useDisplayMode,
  useSendFollowUpMessage,
  useUser,
  useViewport,
} from "skybridge/web";
import type { Row } from "@/datasets.js";
import { useToolInfo } from "@/helpers.js";
import { summarize } from "@/views/analysis.js";
import { colorScale } from "@/views/colors.js";
import Controls from "@/views/components/controls.js";
import DataTable from "@/views/components/data-table.js";
import Filters from "@/views/components/filters.js";
import ScatterPlot from "@/views/components/scatter-plot.js";
import {
  categoryOf,
  type ExplorerData,
  useExplorer,
} from "@/views/use-explorer.js";

export default function Explorer() {
  // useUser: read user environment info (theme, locale, user agent).
  const { theme } = useUser();
  // useViewport: the height the host actually grants us, live across resizes.
  const { maxHeight, safeArea } = useViewport();
  // useDisplayMode: inline is a preview; the table needs fullscreen.
  const [displayMode, setDisplayMode] = useDisplayMode();
  // useSendFollowUpMessage: hand the model a prompt as if the user had typed it.
  const sendFollowUpMessage = useSendFollowUpMessage();

  // useToolInfo: read the input, output and metadata of the tool that opened
  // this view. The rows ride in `_meta`, so they cost the model no context.
  const { output, responseMetadata, isPending } =
    useToolInfo<"explore-dataset">();
  const data = output as ExplorerData | undefined;
  const rows = ((responseMetadata as { rows?: Row[] })?.rows ?? []) as Row[];

  const explorer = useExplorer(data, rows);
  const {
    filtered,
    categories,
    color,
    x,
    y,
    fields,
    selectedRow,
    isRangeFiltered,
    range,
    excluded,
    reset,
  } = explorer;

  const scale = colorScale(categories.get(color) ?? []);
  const label = (key: string) =>
    fields.find((field) => field.key === key)?.label ?? key;

  const filterSummary =
    [
      isRangeFiltered ? `${label(x)} restricted to ${range[0]}–${range[1]}` : "",
      ...Object.entries(excluded)
        .filter(([, values]) => values.length)
        .map(([key, values]) => `${label(key)} hides ${values.join(", ")}`),
    ]
      .filter(Boolean)
      .join("; ") || "none";

  const isFullscreen = displayMode === "fullscreen";
  const hasFilters =
    isRangeFiltered ||
    Object.values(excluded).some((values) => values.length > 0);

  // Everything above the plot: header, controls, chips, footer.
  const chrome = isFullscreen ? 210 : 190;
  const available = (maxHeight ?? 480) - safeArea.insets.top -
    safeArea.insets.bottom;
  const chartHeight = Math.max(
    140,
    Math.min(isFullscreen ? 420 : 240, available - chrome),
  );

  return (
    <div
      className={`${theme === "dark" ? "dark" : ""} flex w-full flex-col gap-2.5 overflow-hidden bg-background p-3 text-foreground`}
      style={{ maxHeight }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h1 className="type-text-lg font-mozilla font-semibold">
            {data?.label ?? "Dataset explorer"}
          </h1>
          <p
            className="type-text-sm text-muted-foreground"
            // data-llm: describe what the user views to the model so they can collaborate.
            data-llm={
              isPending
                ? "The explorer is still opening."
                : `Showing ${filtered.length} of ${rows.length} ${data?.label} rows. Chart: ${label(y)} against ${label(x)}, colored by ${label(color)}. Filters: ${filterSummary}.`
            }
          >
            {filtered.length === rows.length
              ? `${rows.length} rows`
              : `${filtered.length} of ${rows.length} rows`}{" "}
            · click a point to inspect it
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            disabled={isPending || filtered.length === 0}
            onClick={() =>
              sendFollowUpMessage(
                "Analyse the rows I am currently looking at in the dataset explorer and tell me what stands out: the shape of each field, how the groups differ, and anything surprising or suspect. Here is a summary of exactly those rows.\n\n" +
                  summarize({
                    label: data?.label ?? "dataset",
                    fields,
                    filtered,
                    total: rows.length,
                    x,
                    y,
                    color,
                    filterSummary,
                  }),
              )
            }
          >
            <Sparkles />
            Analyse
          </Button>
          <Button variant="secondary" disabled={!hasFilters} onClick={reset}>
            <RotateCcw />
            Reset
          </Button>
          <Button
            variant="secondary"
            onClick={() => setDisplayMode(isFullscreen ? "inline" : "fullscreen")}
          >
            {isFullscreen ? <Minimize2 /> : <Maximize2 />}
            {isFullscreen ? "Collapse" : "Expand"}
          </Button>
        </div>
      </div>

      <Controls explorer={explorer} disabled={isPending} />
      <Filters explorer={explorer} scale={scale} />

      <div
        className={
          isFullscreen
            ? "grid min-h-0 gap-3 lg:grid-cols-2 [&>*]:min-w-0"
            : "min-w-0"
        }
      >
        <ScatterPlot explorer={explorer} scale={scale} height={chartHeight} />
        {isFullscreen ? (
          <DataTable explorer={explorer} scale={scale} height={chartHeight} />
        ) : null}
      </div>

      <p className="flex items-center gap-2 type-text-sm">
        {selectedRow ? (
          <span
            data-llm={`Selected row: ${fields
              .map((field) => `${field.label} ${categoryOf(selectedRow, field.key)}`)
              .join(", ")}`}
            className="truncate"
          >
            <span className="text-muted-foreground">Selected: </span>
            {fields
              .map(
                (field) =>
                  `${field.label} ${categoryOf(selectedRow, field.key)}`,
              )
              .join(" · ")}
          </span>
        ) : isFullscreen ? (
          <span className="text-muted-foreground">
            Sort any column by clicking its header.
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setDisplayMode("fullscreen")}
            className="flex cursor-pointer items-center gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <Table2 className="size-4" />
            Expand to see the sortable table
          </button>
        )}
      </p>
    </div>
  );
}
