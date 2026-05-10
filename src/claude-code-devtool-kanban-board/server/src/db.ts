import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import type { Board, Database } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.resolve(__dirname, "../data/db.json");
const LEGACY_FILE = path.resolve(__dirname, "../data/board.json");

function emptyBoard(): Board {
  return {
    columns: [
      { id: randomUUID(), title: "To Do", order: 0 },
      { id: randomUUID(), title: "In Progress", order: 1 },
      { id: randomUUID(), title: "Done", order: 2 },
    ],
    cards: [],
  };
}

function isDatabase(value: unknown): value is Database {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as Database).projects) &&
    typeof (value as Database).boards === "object" &&
    (value as Database).boards !== null
  );
}

let writeQueue: Promise<void> = Promise.resolve();

async function migrateIfNeeded(): Promise<Database> {
  try {
    const raw = await fs.readFile(LEGACY_FILE, "utf8");
    const legacy = JSON.parse(raw) as Board;
    const project = {
      id: randomUUID(),
      name: "Default",
      createdAt: new Date().toISOString(),
    };
    const db: Database = {
      projects: [project],
      boards: { [project.id]: legacy },
    };
    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
    await fs.writeFile(DATA_FILE, JSON.stringify(db, null, 2), "utf8");
    await fs.rename(LEGACY_FILE, `${LEGACY_FILE}.migrated`);
    return db;
  } catch {
    const project = {
      id: randomUUID(),
      name: "Default",
      createdAt: new Date().toISOString(),
    };
    const db: Database = {
      projects: [project],
      boards: { [project.id]: emptyBoard() },
    };
    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
    await fs.writeFile(DATA_FILE, JSON.stringify(db, null, 2), "utf8");
    return db;
  }
}

async function ensureFile(): Promise<void> {
  try {
    await fs.access(DATA_FILE);
  } catch {
    await migrateIfNeeded();
  }
}

export async function readDb(): Promise<Database> {
  await ensureFile();
  const raw = await fs.readFile(DATA_FILE, "utf8");
  const parsed = JSON.parse(raw);
  if (!isDatabase(parsed)) {
    return migrateIfNeeded();
  }
  return parsed;
}

export async function writeDb(db: Database): Promise<void> {
  writeQueue = writeQueue.then(() =>
    fs.writeFile(DATA_FILE, JSON.stringify(db, null, 2), "utf8"),
  );
  await writeQueue;
}

export async function mutateDb<T>(
  fn: (db: Database) => T | Promise<T>,
): Promise<T> {
  const db = await readDb();
  const result = await fn(db);
  await writeDb(db);
  return result;
}

export async function mutateBoard<T>(
  projectId: string,
  fn: (board: Board) => T | Promise<T>,
): Promise<T | null> {
  const db = await readDb();
  const board = db.boards[projectId];
  if (!board) return null;
  const result = await fn(board);
  await writeDb(db);
  return result;
}

export function createProject(name: string): {
  project: { id: string; name: string; createdAt: string };
  board: Board;
} {
  return {
    project: {
      id: randomUUID(),
      name,
      createdAt: new Date().toISOString(),
    },
    board: emptyBoard(),
  };
}
