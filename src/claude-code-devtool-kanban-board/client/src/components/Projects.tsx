import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { api, type Project } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { navigate } from "@/hooks/useHashRoute";

type DialogState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; project: Project };

export function Projects() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>({ mode: "closed" });

  const refresh = useCallback(async () => {
    try {
      setProjects(await api.listProjects());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load projects");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleDelete = async (project: Project) => {
    const ok = window.confirm(
      `Delete project "${project.name}" and its board?`,
    );
    if (!ok) return;
    await api.deleteProject(project.id);
    await refresh();
  };

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b bg-background px-6 py-3">
        <h1 className="text-lg font-semibold tracking-tight">Projects</h1>
        <Button size="sm" onClick={() => setDialog({ mode: "create" })}>
          <Plus className="h-4 w-4" />
          New project
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {error && (
          <div className="mb-4 text-sm text-destructive">{error}</div>
        )}
        {projects === null ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : projects.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No projects yet. Click "New project" to create your first board.
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <li
                key={p.id}
                className="group flex items-center justify-between rounded-lg border bg-muted/40 p-4 transition-colors hover:bg-muted"
              >
                <button
                  className="flex-1 text-left"
                  onClick={() => navigate(`/projects/${p.id}`)}
                >
                  <div className="font-semibold tracking-tight">{p.name}</div>
                  <div className="text-xs text-muted-foreground">
                    Created {new Date(p.createdAt).toLocaleDateString()}
                  </div>
                </button>
                <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDialog({ mode: "edit", project: p });
                    }}
                    aria-label="Rename project"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleDelete(p);
                    }}
                    aria-label="Delete project"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ProjectDialog
        state={dialog}
        onOpenChange={(open) => !open && setDialog({ mode: "closed" })}
        onSubmit={async (name) => {
          if (dialog.mode === "create") {
            await api.createProject(name);
          } else if (dialog.mode === "edit") {
            await api.renameProject(dialog.project.id, name);
          }
          await refresh();
        }}
      />
    </div>
  );
}

type ProjectDialogProps = {
  state: DialogState;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string) => Promise<void>;
};

function ProjectDialog({ state, onOpenChange, onSubmit }: ProjectDialogProps) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (state.mode === "edit") setName(state.project.name);
    else if (state.mode === "create") setName("");
  }, [state]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit(name.trim());
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  const isCreate = state.mode === "create";

  return (
    <Dialog open={state.mode !== "closed"} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isCreate ? "New project" : "Rename project"}
          </DialogTitle>
          <DialogDescription>
            {isCreate
              ? "Each project has its own isolated kanban board."
              : "Update the project name."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="project-name">
              Name
            </label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !name.trim()}>
              {isCreate ? "Create" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
