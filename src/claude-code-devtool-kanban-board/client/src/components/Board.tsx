import { useEffect, useState } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { ArrowLeft, Plus } from "lucide-react";
import { useBoard } from "@/hooks/useBoard";
import { api, type Project } from "@/lib/api";
import { navigate } from "@/hooks/useHashRoute";
import { Button } from "@/components/ui/button";
import { Column } from "./Column";
import { ColumnDialog } from "./ColumnDialog";

type Props = {
  projectId: string;
};

export function Board({ projectId }: Props) {
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
  } = useBoard(projectId);
  const [newColumnOpen, setNewColumnOpen] = useState(false);
  const [project, setProject] = useState<Project | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api
      .listProjects()
      .then((list) => {
        if (cancelled) return;
        setProject(list.find((p) => p.id === projectId) ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [projectId]);

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
      <div className="flex h-screen flex-col items-center justify-center gap-4 text-destructive">
        <div>{error}</div>
        <Button variant="outline" onClick={() => navigate("/")}>
          <ArrowLeft className="h-4 w-4" />
          Back to projects
        </Button>
      </div>
    );
  }
  if (!board) return null;

  const columns = [...board.columns].sort((a, b) => a.order - b.order);

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b bg-background px-6 py-3">
        <div className="flex items-center gap-3">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => navigate("/")}
            aria-label="Back to projects"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-lg font-semibold tracking-tight">
            {project?.name ?? "Kanban Board"}
          </h1>
        </div>
        <Button size="sm" onClick={() => setNewColumnOpen(true)}>
          <Plus className="h-4 w-4" />
          Add column
        </Button>
      </header>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex-1 overflow-x-auto overflow-y-hidden p-6">
          <div className="flex h-full gap-4 items-stretch">
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
