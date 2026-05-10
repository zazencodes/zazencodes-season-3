import { Router } from "express";
import { randomUUID } from "node:crypto";
import { mutate } from "../db.js";

export const cardsRouter = Router();

cardsRouter.post("/", async (req, res) => {
  const columnId = String(req.body?.columnId ?? "");
  const title = String(req.body?.title ?? "").trim();
  const description = String(req.body?.description ?? "");
  if (!columnId || !title) {
    return res.status(400).json({ error: "columnId and title are required" });
  }

  const card = await mutate((board) => {
    const column = board.columns.find((c) => c.id === columnId);
    if (!column) return null;
    const order = board.cards.filter((c) => c.columnId === columnId).length;
    const created = { id: randomUUID(), columnId, title, description, order };
    board.cards.push(created);
    return created;
  });
  if (!card) return res.status(400).json({ error: "column not found" });
  res.status(201).json(card);
});

cardsRouter.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const updated = await mutate((board) => {
    const card = board.cards.find((c) => c.id === id);
    if (!card) return null;

    if (typeof req.body?.title === "string" && req.body.title.trim()) {
      card.title = req.body.title.trim();
    }
    if (typeof req.body?.description === "string") {
      card.description = req.body.description;
    }
    if (typeof req.body?.columnId === "string" && req.body.columnId !== card.columnId) {
      const newCol = board.columns.find((c) => c.id === req.body.columnId);
      if (newCol) {
        const oldColumnId = card.columnId;
        card.columnId = req.body.columnId;
        // place at end of new column unless explicit order given
        if (typeof req.body?.order !== "number") {
          card.order = board.cards.filter(
            (c) => c.columnId === card.columnId && c.id !== card.id,
          ).length;
        }
        // re-pack old column
        board.cards
          .filter((c) => c.columnId === oldColumnId)
          .sort((a, b) => a.order - b.order)
          .forEach((c, i) => (c.order = i));
      }
    }
    if (typeof req.body?.order === "number") {
      card.order = req.body.order;
    }
    return card;
  });
  if (!updated) return res.status(404).json({ error: "card not found" });
  res.json(updated);
});

cardsRouter.delete("/:id", async (req, res) => {
  const { id } = req.params;
  const ok = await mutate((board) => {
    const idx = board.cards.findIndex((c) => c.id === id);
    if (idx === -1) return false;
    const removed = board.cards[idx];
    board.cards.splice(idx, 1);
    // re-pack column
    board.cards
      .filter((c) => c.columnId === removed.columnId)
      .sort((a, b) => a.order - b.order)
      .forEach((c, i) => (c.order = i));
    return true;
  });
  if (!ok) return res.status(404).json({ error: "card not found" });
  res.status(204).end();
});
