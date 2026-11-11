// Shared state between the chat and the side pane: which object the pane shows,
// and a version per collection that bumps whenever the agent or the user changes it.

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Collection, ObjectRef } from "../shared/types.ts";

export type Tab = "recipes" | "plan" | "groceries" | "pantry" | "files";

export interface PaneTarget {
  tab: Tab;
  /** Recipe or grocery list to open, or meal plan entry to highlight. */
  id?: string;
  /** Week to show on the plan tab. */
  date?: string;
}

interface Workspace {
  target: PaneTarget;
  versions: Record<Collection, number>;
  navigate(target: PaneTarget): void;
  openRef(ref: ObjectRef): void;
  changed(collections: Collection[]): void;
}

const WorkspaceContext = createContext<Workspace | null>(null);

export function useWorkspace() {
  const workspace = useContext(WorkspaceContext);
  if (!workspace) throw new Error("useWorkspace outside WorkspaceProvider");
  return workspace;
}

export function refTarget(ref: ObjectRef): PaneTarget {
  switch (ref.kind) {
    case "recipe":
      return { tab: "recipes", id: ref.id };
    case "groceryList":
      return { tab: "groceries", id: ref.id };
    case "mealPlanEntry":
      return { tab: "plan", id: ref.id, date: ref.date };
    case "pantryItem":
      return { tab: "pantry", id: ref.id };
    case "file":
      return { tab: "files", id: ref.id };
  }
}

export function WorkspaceProvider({
  onNavigate,
  children,
}: {
  onNavigate: () => void;
  children: React.ReactNode;
}) {
  const [target, setTarget] = useState<PaneTarget>({ tab: "recipes" });
  const [versions, setVersions] = useState<Record<Collection, number>>({
    recipes: 0,
    mealPlan: 0,
    groceries: 0,
    pantry: 0,
    files: 0,
  });

  const navigate = useCallback(
    (next: PaneTarget) => {
      setTarget(next);
      onNavigate();
    },
    [onNavigate],
  );

  const changed = useCallback((collections: Collection[]) => {
    if (collections.length === 0) return;
    setVersions((v) => {
      const next = { ...v };
      for (const c of collections) next[c] += 1;
      return next;
    });
  }, []);

  return (
    <WorkspaceContext.Provider
      value={{ target, versions, navigate, openRef: (ref) => navigate(refTarget(ref)), changed }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

/** Load data, reloading whenever a dependency (usually a collection version) changes. */
export function useResource<T>(load: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data?: T; error?: Error }>({});
  const [reloads, setReloads] = useState(0);
  useEffect(() => {
    let cancelled = false;
    load().then(
      (data) => !cancelled && setState({ data }),
      (error: Error) => !cancelled && setState({ error }),
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloads]);
  return { ...state, reload: () => setReloads((n) => n + 1) };
}
