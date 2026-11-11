import { useCallback, useEffect, useState } from "react";
import { api, type Board, type Card } from "@/lib/api";

type State = {
  board: Board | null;
  loading: boolean;
  error: string | null;
};

export function useBoard(projectId: string) {
  const [state, setState] = useState<State>({
    board: null,
    loading: true,
    error: null,
  });

  const refresh = useCallback(async () => {
    try {
      const board = await api.getBoard(projectId);
      setState({ board, loading: false, error: null });
    } catch (e) {
      setState({
        board: null,
        loading: false,
        error: e instanceof Error ? e.message : "failed to load board",
      });
    }
  }, [projectId]);

  useEffect(() => {
    setState({ board: null, loading: true, error: null });
    void refresh();
  }, [refresh]);

  const createColumn = useCallback(
    async (title: string) => {
      await api.createColumn(projectId, title);
      await refresh();
    },
    [projectId, refresh],
  );

  const renameColumn = useCallback(
    async (id: string, title: string) => {
      await api.renameColumn(projectId, id, title);
      await refresh();
    },
    [projectId, refresh],
  );

  const deleteColumn = useCallback(
    async (id: string) => {
      await api.deleteColumn(projectId, id);
      await refresh();
    },
    [projectId, refresh],
  );

  const createCard = useCallback(
    async (columnId: string, title: string, description: string) => {
      await api.createCard(projectId, columnId, title, description);
      await refresh();
    },
    [projectId, refresh],
  );

  const updateCard = useCallback(
    async (
      id: string,
      patch: Partial<Pick<Card, "title" | "description" | "columnId" | "order">>,
    ) => {
      await api.updateCard(projectId, id, patch);
      await refresh();
    },
    [projectId, refresh],
  );

  const moveCardOptimistic = useCallback(
    async (cardId: string, toColumnId: string) => {
      setState((prev) => {
        if (!prev.board) return prev;
        const cards = prev.board.cards.map((c) =>
          c.id === cardId ? { ...c, columnId: toColumnId } : c,
        );
        return { ...prev, board: { ...prev.board, cards } };
      });
      try {
        await api.updateCard(projectId, cardId, { columnId: toColumnId });
      } finally {
        await refresh();
      }
    },
    [projectId, refresh],
  );

  const deleteCard = useCallback(
    async (id: string) => {
      await api.deleteCard(projectId, id);
      await refresh();
    },
    [projectId, refresh],
  );

  return {
    ...state,
    refresh,
    createColumn,
    renameColumn,
    deleteColumn,
    createCard,
    updateCard,
    moveCardOptimistic,
    deleteCard,
  };
}
