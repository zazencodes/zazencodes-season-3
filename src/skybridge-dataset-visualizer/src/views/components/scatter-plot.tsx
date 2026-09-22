import { useEffect, useRef, useState } from "react";
import type { ColorScale } from "@/views/colors.js";
import {
  categoryOf,
  type Explorer,
  type IndexedRow,
  numberOf,
} from "@/views/use-explorer.js";

const MARGIN = { top: 8, right: 10, bottom: 34, left: 54 };

/** Rounded axis ticks covering [min, max]. */
function ticks(min: number, max: number, count = 4): number[] {
  const span = max - min || 1;
  const rough = span / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const factor =
    [1, 2, 2.5, 5, 10].find((candidate) => candidate * magnitude >= rough) ?? 10;
  const size = factor * magnitude || 1;

  const result: number[] = [];
  for (let tick = Math.ceil(min / size) * size; tick <= max; tick += size) {
    result.push(Number(tick.toFixed(10)));
  }

  return result;
}

function pad([min, max]: [number, number]): [number, number] {
  const margin = (max - min || 1) * 0.05;
  return [min - margin, max + margin];
}

/** Render at the container's real pixel size so nothing is scaled up. */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    );
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}

export default function ScatterPlot({
  explorer,
  scale,
  height,
}: {
  explorer: Explorer;
  scale: ColorScale;
  height: number;
}) {
  const { x, y, color, sorted, selected, select, fields } = explorer;
  const [ref, width] = useWidth();
  const [hovered, setHovered] = useState<IndexedRow | null>(null);

  const plotWidth = Math.max(width - MARGIN.left - MARGIN.right, 10);
  const plotHeight = height - MARGIN.top - MARGIN.bottom;

  const label = (key: string) =>
    fields.find((field) => field.key === key)?.label ?? key;

  const points = sorted.flatMap(({ index, row }) => {
    const xValue = numberOf(row, x);
    const yValue = numberOf(row, y);
    return xValue === null || yValue === null
      ? []
      : [{ index, row, xValue, yValue }];
  });

  const xDomain = pad(
    points.length
      ? [
          Math.min(...points.map((p) => p.xValue)),
          Math.max(...points.map((p) => p.xValue)),
        ]
      : [0, 1],
  );
  const yDomain = pad(
    points.length
      ? [
          Math.min(...points.map((p) => p.yValue)),
          Math.max(...points.map((p) => p.yValue)),
        ]
      : [0, 1],
  );

  const toX = (value: number) =>
    MARGIN.left +
    ((value - xDomain[0]) / (xDomain[1] - xDomain[0])) * plotWidth;
  const toY = (value: number) =>
    MARGIN.top +
    plotHeight -
    ((value - yDomain[0]) / (yDomain[1] - yDomain[0])) * plotHeight;

  const tooltip = hovered
    ? points.find((point) => point.index === hovered.index)
    : undefined;

  return (
    <div ref={ref} className="relative min-w-0">
      {width > 0 && (
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`${label(y)} against ${label(x)}, colored by ${label(color)}`}
        >
          <title>{`${label(y)} against ${label(x)}`}</title>

          {ticks(yDomain[0], yDomain[1]).map((tick) => (
            <g key={`y-${tick}`}>
              <line
                x1={MARGIN.left}
                x2={width - MARGIN.right}
                y1={toY(tick)}
                y2={toY(tick)}
                className="stroke-border-secondary"
                strokeWidth={1}
              />
              <text
                x={MARGIN.left - 8}
                y={toY(tick)}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-muted-foreground"
                fontSize={10}
              >
                {tick.toLocaleString()}
              </text>
            </g>
          ))}

          {ticks(xDomain[0], xDomain[1]).map((tick) => (
            <text
              key={`x-${tick}`}
              x={toX(tick)}
              y={height - MARGIN.bottom + 14}
              textAnchor="middle"
              className="fill-muted-foreground"
              fontSize={10}
            >
              {tick.toLocaleString()}
            </text>
          ))}

          <text
            x={MARGIN.left + plotWidth / 2}
            y={height - 4}
            textAnchor="middle"
            className="fill-muted-foreground"
            fontSize={11}
          >
            {label(x)}
          </text>
          <text
            transform={`translate(11 ${MARGIN.top + plotHeight / 2}) rotate(-90)`}
            textAnchor="middle"
            className="fill-muted-foreground"
            fontSize={11}
          >
            {label(y)}
          </text>

          {points.map((point) => {
            const isSelected = point.index === selected;
            const isHovered = point.index === hovered?.index;

            return (
              <circle
                key={point.index}
                cx={toX(point.xValue)}
                cy={toY(point.yValue)}
                r={isSelected || isHovered ? 6 : 4}
                fill={scale(categoryOf(point.row, color))}
                fillOpacity={selected === undefined || isSelected ? 0.85 : 0.25}
                // A surface-colored ring keeps overlapping marks readable.
                className="stroke-background cursor-pointer"
                strokeWidth={1.5}
                onMouseEnter={() => setHovered(point)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => select(point.index)}
              >
                <title>{`${label(x)} ${point.xValue}, ${label(y)} ${point.yValue}`}</title>
              </circle>
            );
          })}

          {points.length === 0 && (
            <text
              x={width / 2}
              y={height / 2}
              textAnchor="middle"
              className="fill-muted-foreground"
              fontSize={12}
            >
              No rows match the current filters.
            </text>
          )}
        </svg>
      )}

      {tooltip && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-border-secondary bg-background px-2 py-1 type-text-xs shadow-md"
          style={{ left: toX(tooltip.xValue), top: toY(tooltip.yValue) - 8 }}
        >
          <div className="font-medium">{categoryOf(tooltip.row, color)}</div>
          <div className="text-muted-foreground">
            {label(x)}: {tooltip.xValue.toLocaleString()}
          </div>
          <div className="text-muted-foreground">
            {label(y)}: {tooltip.yValue.toLocaleString()}
          </div>
        </div>
      )}
    </div>
  );
}
