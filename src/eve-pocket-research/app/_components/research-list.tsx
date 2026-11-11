import type { ResearchItem } from "@/agent/lib/research-items";

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

export function ResearchList({ items }: { readonly items: readonly ResearchItem[] }) {
  if (items.length === 0) return null;

  return (
    <nav aria-label="Past research" className="w-full">
      <h2 className="mb-2 px-1 text-muted-foreground text-sm">Past research</h2>
      <ul className="divide-y divide-border rounded-lg border">
        {items.map((item) => (
          <li key={item.sessionId}>
            <a
              className="flex flex-col gap-1 px-4 py-3 hover:bg-muted/50"
              href={`/s/${encodeURIComponent(item.sessionId)}`}
            >
              <span className="line-clamp-2 text-sm">{item.title}</span>
              <time
                className="text-muted-foreground text-xs"
                dateTime={item.updatedAt}
                suppressHydrationWarning
              >
                {dateFormat.format(new Date(item.updatedAt))}
              </time>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
