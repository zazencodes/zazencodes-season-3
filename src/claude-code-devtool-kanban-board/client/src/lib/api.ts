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

export type Project = {
  id: string;
  name: string;
  createdAt: string;
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
  listProjects: () => request<Project[]>("/api/projects"),
  createProject: (name: string) =>
    request<Project>("/api/projects", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  renameProject: (id: string, name: string) =>
    request<Project>(`/api/projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),
  deleteProject: (id: string) =>
    request<void>(`/api/projects/${id}`, { method: "DELETE" }),

  getBoard: (projectId: string) =>
    request<Board>(`/api/projects/${projectId}/board`),
  createColumn: (projectId: string, title: string) =>
    request<Column>(`/api/projects/${projectId}/columns`, {
      method: "POST",
      body: JSON.stringify({ title }),
    }),
  renameColumn: (projectId: string, id: string, title: string) =>
    request<Column>(`/api/projects/${projectId}/columns/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ title }),
    }),
  deleteColumn: (projectId: string, id: string) =>
    request<void>(`/api/projects/${projectId}/columns/${id}`, {
      method: "DELETE",
    }),
  createCard: (
    projectId: string,
    columnId: string,
    title: string,
    description: string,
  ) =>
    request<Card>(`/api/projects/${projectId}/cards`, {
      method: "POST",
      body: JSON.stringify({ columnId, title, description }),
    }),
  updateCard: (
    projectId: string,
    id: string,
    patch: Partial<Pick<Card, "title" | "description" | "columnId" | "order">>,
  ) =>
    request<Card>(`/api/projects/${projectId}/cards/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  deleteCard: (projectId: string, id: string) =>
    request<void>(`/api/projects/${projectId}/cards/${id}`, {
      method: "DELETE",
    }),
};
