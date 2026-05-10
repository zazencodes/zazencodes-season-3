import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { Card as CardType } from "@/lib/api";
import { cn } from "@/lib/utils";

type Props = {
  card: CardType;
  onClick: () => void;
};

export function Card({ card, onClick }: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: card.id, data: { type: "card", card } });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={(e) => {
        // ignore click that ends a drag
        if (isDragging) return;
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "rounded-md border bg-card p-3 text-sm shadow-sm cursor-grab active:cursor-grabbing select-none",
        "hover:border-slate-400 transition-colors",
        isDragging && "opacity-40",
      )}
    >
      <div className="font-medium text-card-foreground break-words">
        {card.title}
      </div>
      {card.description && (
        <div className="mt-1 text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap break-words">
          {card.description}
        </div>
      )}
    </div>
  );
}
