import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Issue } from "@minimax-dev-rpg/protocol";
import type { IssueProvider } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Reads fixtures/issues.json. Synchronous at boot; no network dependency. */
export class MockIssueProvider implements IssueProvider {
  readonly name = "mock";
  private cache: Issue[] | null = null;

  async listIssues(): Promise<Issue[]> {
    if (this.cache) return this.cache;
    const raw = await readFile(join(__dirname, "..", "fixtures", "issues.json"), "utf8");
    this.cache = JSON.parse(raw) as Issue[];
    return this.cache;
  }

  onUpdate(): () => void {
    // Mock is static for v0.1.
    return () => {};
  }
}
