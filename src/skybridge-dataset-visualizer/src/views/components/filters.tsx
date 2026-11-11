import type { ColorScale } from "@/views/colors.js";
import type { Explorer } from "@/views/use-explorer.js";

export default function Filters({
  explorer,
  scale,
}: {
  explorer: Explorer;
  scale: ColorScale;
}) {
  const { categorical, categories, excluded, toggleCategory, color } = explorer;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {categorical.map((field) => (
        <div key={field.key} className="flex flex-wrap items-center gap-1.5">
          <span className="type-text-xs text-muted-foreground">
            {field.label}
          </span>
          {(categories.get(field.key) ?? []).map((value) => {
            const isOn = !(excluded[field.key] ?? []).includes(value);

            return (
              <button
                key={value}
                type="button"
                aria-pressed={isOn}
                onClick={() => toggleCategory(field.key, value)}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 type-text-xs cursor-pointer transition-colors ${
                  isOn
                    ? "border-border bg-muted text-foreground"
                    : "border-border-secondary text-muted-foreground line-through"
                }`}
              >
                {field.key === color && (
                  <span
                    className="size-2 rounded-full"
                    style={{
                      background: isOn ? scale(value) : "transparent",
                      boxShadow: isOn ? undefined : `inset 0 0 0 1px currentColor`,
                    }}
                  />
                )}
                {value}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
