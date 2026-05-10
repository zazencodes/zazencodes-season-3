import { Router } from "express";
import { randomUUID } from "node:crypto";
import { mutate } from "../db.js";

export const columnsRouter = Router();

columnsRouter.post("/", async (req, res) => {
  const title = String(req.body?.title ?? "").trim();
  if (!title) return res.status(400).json({ error: "title is required" });

  const column = await mutate((board) => {
    const order = board.columns.length;
    const col = { id: randomUUID(), title, order };
    board.columns.push(col);
    return col;
  });
  res.status(201).json(column);
});

columnsRouter.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const title = req.body?.title;
  if (typeof title !== "string" || !title.trim()) {
    return res.status(400).json({ error: "title is required" });
  }

  const updated = await mutate((board) => {
    const col = board.columns.find((c) => c.id === id);
    if (!col) return null;
    col.title = title.trim();
    return col;
  });
  if (!updated) return res.status(404).json({ error: "column not found" });
  res.json(updated);
});

columnsRouter.delete("/:id", async (req, res) => {
  const { id } = req.params;
  const ok = await mutate((board) => {
    const idx = board.columns.findIndex((c) => c.id === id);
    if (idx === -1) return false;
    board.columns.splice(idx, 1);
    board.cards = board.cards.filter((card) => card.columnId !== id);
    // re-pack column order
    board.columns
      .sort((a, b) => a.order - b.order)
      .forEach((c, i) => (c.order = i));
    return true;
  });
  if (!ok) return res.status(404).json({ error: "column not found" });
  res.status(204).end();
});
