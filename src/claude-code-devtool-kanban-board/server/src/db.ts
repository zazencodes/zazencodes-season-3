import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import type { Board } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.resolve(__dirname, "../data/board.json");

const SEED: Board = {
  columns: [
    { id: randomUUID(), title: "To Do", order: 0 },
    { id: randomUUID(), title: "In Progress", order: 1 },
    { id: randomUUID(), title: "Done", order: 2 },
  ],
  cards: [],
};

let writeQueue: Promise<void> = Promise.resolve();

async function ensureFile(): Promise<void> {
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
    await fs.writeFile(DATA_FILE, JSON.stringify(SEED, null, 2), "utf8");
  }
}

export async function readBoard(): Promise<Board> {
  await ensureFile();
  const raw = await fs.readFile(DATA_FILE, "utf8");
  return JSON.parse(raw) as Board;
}

export async function writeBoard(board: Board): Promise<void> {
  // serialize writes to avoid interleaved rewrites
  writeQueue = writeQueue.then(() =>
    fs.writeFile(DATA_FILE, JSON.stringify(board, null, 2), "utf8"),
  );
  await writeQueue;
}

export async function mutate<T>(
  fn: (board: Board) => T | Promise<T>,
): Promise<T> {
  const board = await readBoard();
  const result = await fn(board);
  await writeBoard(board);
  return result;
}
