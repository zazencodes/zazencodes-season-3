import { useState } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Plus } from "lucide-react";
import { useBoard } from "@/hooks/useBoard";
import { Button } from "@/components/ui/button";
import { Column } from "./Column";
import { ColumnDialog } from "./ColumnDialog";

export function Board() {
  const {
    board,
    loading,
    error,
    createColumn,
    renameColumn,
    deleteColumn,
    createCard,
    updateCard,
    deleteCard,
    moveCardOptimistic,
  } = useBoard();
  const [newColumnOpen, setNewColumnOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || !board) return;
    const overData = over.data.current as { type: string; columnId?: string } | undefined;
    if (overData?.type !== "column" || !overData.columnId) return;

    const card = board.cards.find((c) => c.id === active.id);
    if (!card || card.columnId === overData.columnId) return;

    void moveCardOptimistic(card.id, overData.columnId);
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground">
        Loading board…
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex h-screen items-center justify-center text-destructive">
        {error}
      </div>
    );
  }
  if (!board) return null;

  const columns = [...board.columns].sort((a, b) => a.order - b.order);

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b bg-background px-6 py-3">
        <h1 className="text-lg font-semibold tracking-tight">Kanban Board</h1>
        <Button size="sm" onClick={() => setNewColumnOpen(true)}>
          <Plus className="h-4 w-4" />
          Add column
        </Button>
      </header>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex-1 overflow-x-auto overflow-y-hidden p-6">
          <div className="flex h-full gap-4 items-start">
            {columns.map((col) => (
              <Column
                key={col.id}
                column={col}
                cards={board.cards.filter((c) => c.columnId === col.id)}
                onCreateCard={createCard}
                onUpdateCard={updateCard}
                onDeleteCard={deleteCard}
                onRenameColumn={renameColumn}
                onDeleteColumn={deleteColumn}
              />
            ))}
            {columns.length === 0 && (
              <div className="text-sm text-muted-foreground">
                No columns yet. Click "Add column" to get started.
              </div>
            )}
          </div>
        </div>
      </DndContext>

      <ColumnDialog
        open={newColumnOpen}
        onOpenChange={setNewColumnOpen}
        mode="create"
        onSubmit={createColumn}
      />
    </div>
  );
}
