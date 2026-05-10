export type Column = {
  id: string;
  title: string;
  order: number;
};

export type Card = {
  id: string;
  columnId: string;
  title: string;
  description: string;
  order: number;
};

export type Board = {
  columns: Column[];
  cards: Card[];
};

async function request<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  getBoard: () => request<Board>("/api/board"),
  createColumn: (title: string) =>
    request<Column>("/api/columns", {
      method: "POST",
      body: JSON.stringify({ title }),
    }),
  renameColumn: (id: string, title: string) =>
    request<Column>(`/api/columns/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ title }),
    }),
  deleteColumn: (id: string) =>
    request<void>(`/api/columns/${id}`, { method: "DELETE" }),
  createCard: (columnId: string, title: string, description: string) =>
    request<Card>("/api/cards", {
      method: "POST",
      body: JSON.stringify({ columnId, title, description }),
    }),
  updateCard: (
    id: string,
    patch: Partial<Pick<Card, "title" | "description" | "columnId" | "order">>,
  ) =>
    request<Card>(`/api/cards/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  deleteCard: (id: string) =>
    request<void>(`/api/cards/${id}`, { method: "DELETE" }),
};
