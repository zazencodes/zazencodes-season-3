import { useCallback, useEffect, useState } from "react";
import { api, type Board, type Card } from "@/lib/api";

type State = {
  board: Board | null;
  loading: boolean;
  error: string | null;
};

export function useBoard() {
  const [state, setState] = useState<State>({
    board: null,
    loading: true,
    error: null,
  });

  const refresh = useCallback(async () => {
    try {
      const board = await api.getBoard();
      setState({ board, loading: false, error: null });
    } catch (e) {
      setState({
        board: null,
        loading: false,
        error: e instanceof Error ? e.message : "failed to load board",
      });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createColumn = useCallback(
    async (title: string) => {
      await api.createColumn(title);
      await refresh();
    },
    [refresh],
  );

  const renameColumn = useCallback(
    async (id: string, title: string) => {
      await api.renameColumn(id, title);
      await refresh();
    },
    [refresh],
  );

  const deleteColumn = useCallback(
    async (id: string) => {
      await api.deleteColumn(id);
      await refresh();
    },
    [refresh],
  );

  const createCard = useCallback(
    async (columnId: string, title: string, description: string) => {
      await api.createCard(columnId, title, description);
      await refresh();
    },
    [refresh],
  );

  const updateCard = useCallback(
    async (
      id: string,
      patch: Partial<Pick<Card, "title" | "description" | "columnId" | "order">>,
    ) => {
      await api.updateCard(id, patch);
      await refresh();
    },
    [refresh],
  );

  // optimistic move — used for drag-and-drop
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
        await api.updateCard(cardId, { columnId: toColumnId });
      } finally {
        await refresh();
      }
    },
    [refresh],
  );

  const deleteCard = useCallback(
    async (id: string) => {
      await api.deleteCard(id);
      await refresh();
    },
    [refresh],
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
