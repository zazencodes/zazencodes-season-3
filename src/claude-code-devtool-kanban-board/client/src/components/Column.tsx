import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { Card as CardType, Column as ColumnType } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "./Card";
import { CardDialog } from "./CardDialog";
import { ColumnDialog } from "./ColumnDialog";
import { cn } from "@/lib/utils";

type Props = {
  column: ColumnType;
  cards: CardType[];
  onCreateCard: (columnId: string, title: string, description: string) => Promise<void>;
  onUpdateCard: (
    id: string,
    patch: Partial<Pick<CardType, "title" | "description" | "columnId" | "order">>,
  ) => Promise<void>;
  onDeleteCard: (id: string) => Promise<void>;
  onRenameColumn: (id: string, title: string) => Promise<void>;
  onDeleteColumn: (id: string) => Promise<void>;
};

export function Column({
  column,
  cards,
  onCreateCard,
  onUpdateCard,
  onDeleteCard,
  onRenameColumn,
  onDeleteColumn,
}: Props) {
  const [createOpen, setCreateOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<CardType | null>(null);

  const { setNodeRef, isOver } = useDroppable({
    id: `col-${column.id}`,
    data: { type: "column", columnId: column.id },
  });

  const sorted = [...cards].sort((a, b) => a.order - b.order);

  const handleDeleteColumn = async () => {
    const confirmed = window.confirm(
      `Delete column "${column.title}" and all its cards?`,
    );
    if (!confirmed) return;
    await onDeleteColumn(column.id);
  };

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex h-full max-h-full w-72 shrink-0 flex-col overflow-hidden rounded-lg border bg-muted/40 p-3 transition-colors",
        isOver && "bg-muted ring-2 ring-ring",
      )}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 pb-3">
        <h2 className="font-semibold text-sm tracking-tight truncate">
          {column.title}
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {sorted.length}
          </span>
        </h2>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => setRenameOpen(true)}
            aria-label="Rename column"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={handleDeleteColumn}
            aria-label="Delete column"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {sorted.map((card) => (
          <Card key={card.id} card={card} onClick={() => setEditingCard(card)} />
        ))}
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="mt-2 shrink-0 justify-start text-muted-foreground hover:text-foreground"
        onClick={() => setCreateOpen(true)}
      >
        <Plus className="h-4 w-4" />
        Add card
      </Button>

      <CardDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode="create"
        onSubmit={(title, description) => onCreateCard(column.id, title, description)}
      />

      <CardDialog
        open={editingCard !== null}
        onOpenChange={(open) => !open && setEditingCard(null)}
        mode="edit"
        initialTitle={editingCard?.title ?? ""}
        initialDescription={editingCard?.description ?? ""}
        onSubmit={async (title, description) => {
          if (!editingCard) return;
          await onUpdateCard(editingCard.id, { title, description });
        }}
        onDelete={async () => {
          if (!editingCard) return;
          await onDeleteCard(editingCard.id);
        }}
      />

      <ColumnDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        mode="edit"
        initialTitle={column.title}
        onSubmit={(title) => onRenameColumn(column.id, title)}
      />
    </div>
  );
}
