#!/usr/bin/env node
// Idempotent first-time setup. Copies .example memory files into place if
// they don't exist yet, and ensures memory/images/ exists.
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const memDir = path.join(root, "agent-home", "memory");

const seeds = [
  ["expenses.example.json", "expenses.json"],
  ["facts.example.json", "facts.json"],
];

await fs.mkdir(path.join(memDir, "images"), { recursive: true });

for (const [src, dst] of seeds) {
  const dstPath = path.join(memDir, dst);
  try {
    await fs.access(dstPath);
    console.log(`✓ ${dst} already exists, leaving it alone`);
  } catch {
    await fs.copyFile(path.join(memDir, src), dstPath);
    console.log(`✓ created ${dst} from ${src}`);
  }
}

console.log("\nSetup complete. Run `npm run dev` to start the agent.");
