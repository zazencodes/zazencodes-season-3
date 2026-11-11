import type { Board, Card, Column, Project } from "./types.js";

const BASE_URL = process.env.KANBAN_API_URL ?? "http://localhost:3001";

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  const data = await res.json();

  if (!res.ok) {
    throw new Error(
      (data as { error?: string }).error ?? `HTTP ${res.status}`
    );
  }

  return data as T;
}

export const api = {
  listProjects: () => request<Project[]>("GET", "/api/projects"),
  createProject: (name: string) =>
    request<Project>("POST", "/api/projects", { name }),
  renameProject: (id: string, name: string) =>
    request<Project>("PATCH", `/api/projects/${id}`, { name }),
  deleteProject: (id: string) =>
    request<void>("DELETE", `/api/projects/${id}`),

  getBoard: (projectId: string) =>
    request<Board>("GET", `/api/projects/${projectId}/board`),

  createColumn: (projectId: string, title: string) =>
    request<Column>("POST", `/api/projects/${projectId}/columns`, { title }),
  renameColumn: (projectId: string, id: string, title: string) =>
    request<Column>("PATCH", `/api/projects/${projectId}/columns/${id}`, {
      title,
    }),
  deleteColumn: (projectId: string, id: string) =>
    request<void>("DELETE", `/api/projects/${projectId}/columns/${id}`),

  createCard: (
    projectId: string,
    columnId: string,
    title: string,
    description?: string
  ) =>
    request<Card>("POST", `/api/projects/${projectId}/cards`, {
      columnId,
      title,
      description,
    }),
  updateCard: (
    projectId: string,
    id: string,
    patch: Partial<Pick<Card, "title" | "description" | "columnId" | "order">>
  ) => request<Card>("PATCH", `/api/projects/${projectId}/cards/${id}`, patch),
  deleteCard: (projectId: string, id: string) =>
    request<void>("DELETE", `/api/projects/${projectId}/cards/${id}`),
};
