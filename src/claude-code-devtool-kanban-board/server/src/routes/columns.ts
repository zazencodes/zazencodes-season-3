import { Router } from "express";
import { randomUUID } from "node:crypto";
import { mutateBoard } from "../db.js";

export const columnsRouter = Router({ mergeParams: true });

type Params = { projectId: string };

columnsRouter.post("/", async (req, res) => {
  const { projectId } = req.params as unknown as Params;
  const title = String(req.body?.title ?? "").trim();
  if (!title) return res.status(400).json({ error: "title is required" });

  const result = await mutateBoard(projectId, (board) => {
    const order = board.columns.length;
    const col = { id: randomUUID(), title, order };
    board.columns.push(col);
    return col;
  });
  if (!result) return res.status(404).json({ error: "project not found" });
  res.status(201).json(result);
});

columnsRouter.patch("/:id", async (req, res) => {
  const { projectId, id } = req.params as unknown as Params & { id: string };
  const title = req.body?.title;
  if (typeof title !== "string" || !title.trim()) {
    return res.status(400).json({ error: "title is required" });
  }

  const updated = await mutateBoard(projectId, (board) => {
    const col = board.columns.find((c) => c.id === id);
    if (!col) return null;
    col.title = title.trim();
    return col;
  });
  if (updated === null) return res.status(404).json({ error: "project not found" });
  if (!updated) return res.status(404).json({ error: "column not found" });
  res.json(updated);
});

columnsRouter.delete("/:id", async (req, res) => {
  const { projectId, id } = req.params as unknown as Params & { id: string };
  const ok = await mutateBoard(projectId, (board) => {
    const idx = board.columns.findIndex((c) => c.id === id);
    if (idx === -1) return false;
    board.columns.splice(idx, 1);
    board.cards = board.cards.filter((card) => card.columnId !== id);
    board.columns
      .sort((a, b) => a.order - b.order)
      .forEach((c, i) => (c.order = i));
    return true;
  });
  if (ok === null) return res.status(404).json({ error: "project not found" });
  if (!ok) return res.status(404).json({ error: "column not found" });
  res.status(204).end();
});
