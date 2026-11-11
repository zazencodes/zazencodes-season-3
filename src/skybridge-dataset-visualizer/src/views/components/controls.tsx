import { Input } from "@alpic-ai/ui/components/input";
import { Label } from "@alpic-ai/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@alpic-ai/ui/components/select";
import type { Field } from "@/datasets.js";
import type { Explorer } from "@/views/use-explorer.js";

function Encoding({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Field[];
  onChange: (key: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="type-text-xs text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger size="sm" className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((field) => (
            <SelectItem key={field.key} value={field.key}>
              {field.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export default function Controls({
  explorer,
  disabled,
}: {
  explorer: Explorer;
  disabled?: boolean;
}) {
  const {
    quantitative,
    categorical,
    x,
    y,
    color,
    setEncoding,
    domain,
    range,
    setRange,
    fields,
  } = explorer;

  const xLabel = fields.find((field) => field.key === x)?.label ?? x;

  return (
    <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
      <Encoding
        label="X axis"
        value={x}
        options={quantitative}
        onChange={(key) => setEncoding("x", key)}
      />
      <Encoding
        label="Y axis"
        value={y}
        options={quantitative}
        onChange={(key) => setEncoding("y", key)}
      />
      <Encoding
        label="Color"
        value={color}
        options={categorical}
        onChange={(key) => setEncoding("color", key)}
      />
      <div className="flex flex-col gap-1">
        <Label className="type-text-xs text-muted-foreground">
          {xLabel} range
        </Label>
        <div className="flex items-center gap-1.5">
          <Input
            type="number"
            disabled={disabled}
            aria-label={`Minimum ${xLabel}`}
            size="sm"
            className="w-20"
            value={range[0]}
            min={domain[0]}
            max={range[1]}
            onChange={(event) =>
              setRange([Number(event.target.value), range[1]])
            }
          />
          <span className="text-muted-foreground">–</span>
          <Input
            type="number"
            disabled={disabled}
            aria-label={`Maximum ${xLabel}`}
            size="sm"
            className="w-20"
            value={range[1]}
            min={range[0]}
            max={domain[1]}
            onChange={(event) =>
              setRange([range[0], Number(event.target.value)])
            }
          />
        </div>
      </div>
    </div>
  );
}
