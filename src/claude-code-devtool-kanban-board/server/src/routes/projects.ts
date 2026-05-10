import { Router } from "express";
import { createProject, mutateDb, readDb } from "../db.js";

export const projectsRouter = Router();

projectsRouter.get("/", async (_req, res) => {
  const db = await readDb();
  const projects = [...db.projects].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
  res.json(projects);
});

projectsRouter.post("/", async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  if (!name) return res.status(400).json({ error: "name is required" });

  const project = await mutateDb((db) => {
    const { project, board } = createProject(name);
    db.projects.push(project);
    db.boards[project.id] = board;
    return project;
  });
  res.status(201).json(project);
});

projectsRouter.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const name = req.body?.name;
  if (typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "name is required" });
  }

  const updated = await mutateDb((db) => {
    const project = db.projects.find((p) => p.id === id);
    if (!project) return null;
    project.name = name.trim();
    return project;
  });
  if (!updated) return res.status(404).json({ error: "project not found" });
  res.json(updated);
});

projectsRouter.delete("/:id", async (req, res) => {
  const { id } = req.params;
  const ok = await mutateDb((db) => {
    const idx = db.projects.findIndex((p) => p.id === id);
    if (idx === -1) return false;
    db.projects.splice(idx, 1);
    delete db.boards[id];
    return true;
  });
  if (!ok) return res.status(404).json({ error: "project not found" });
  res.status(204).end();
});

projectsRouter.get("/:id/board", async (req, res) => {
  const { id } = req.params;
  const db = await readDb();
  const board = db.boards[id];
  if (!board) return res.status(404).json({ error: "project not found" });
  res.json(board);
});
