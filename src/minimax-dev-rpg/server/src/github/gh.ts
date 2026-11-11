import { spawn } from "node:child_process";
import type { Issue } from "@minimax-dev-rpg/protocol";
import { kindFromLabels } from "../util/palettes.js";
import type { IssueProvider } from "./types.js";

/**
 * Real GitHub provider backed by the `gh` CLI. Fetches open issues for a
 * single configured repo and maps them into the `Issue` schema the world
 * and combat translator understand.
 *
 * Selection: server/src/index.ts reads `ISSUE_PROVIDER` (default "mock")
 * and `GITHUB_REPO` (default "owner/name").
 *
 * Notes:
 *  - No caching layer; the world re-hydrates on `engage` only when the
 *    player reconnects (see hub.ts). For v0.2 this is fine.
 *  - We treat `gh`'s exit code as the source of truth; any non-zero is a
 *    fatal error so the server logs it loudly instead of falling back to
 *    an empty list (which would silently break the demo).
 */
export class GhCliIssueProvider implements IssueProvider {
  readonly name = "gh";
  private readonly repo: string;

  constructor(opts: { repo: string }) {
    if (!/^[^/\s]+\/[^/\s]+$/.test(opts.repo)) {
      throw new Error(`GhCliIssueProvider: invalid repo "${opts.repo}" (expected "owner/name")`);
    }
    this.repo = opts.repo;
  }

  async listIssues(): Promise<Issue[]> {
    const raw = await runGh([
      "issue",
      "list",
      "--state",
      "open",
      "--limit",
      "100",
      "--json",
      "number,title,body,labels,url",
      "--repo",
      this.repo,
    ]);
    const items = JSON.parse(raw) as Array<{
      number: number;
      title: string;
      body: string;
      labels: Array<{ name: string }>;
      url: string;
    }>;

    return items.map((it) => ({
      id: `github:${this.repo}#${it.number}`,
      provider: "github" as const,
      number: it.number,
      title: it.title,
      body: it.body ?? "",
      labels: (it.labels ?? []).map((l) => l.name).filter((n): n is string => !!n),
      state: "open" as const,
      url: it.url,
      difficulty: difficultyFor((it.labels ?? []).map((l) => l.name), it.body ?? ""),
    }));
  }

  onUpdate(): () => void {
    // Live updates are out of scope for v0.2; issues refresh on client
    // reconnect via the hub's `hello` event.
    return () => {};
  }
}

/**
 * Difficulty heuristic: labels carry the most signal, body length a backstop.
 * - `critical` / `epic` → 5
 * - `good first issue` → 1
 * - otherwise: 2 + clamp(round(log10(bodyLen)), 0, 3)  → ~2..5
 *
 * The world only uses this for monster HP (hpFor = base + difficulty*10), so
 * a coarse mapping is fine.
 */
function difficultyFor(labels: string[], body: string): number {
  const lower = new Set(labels.map((l) => l.toLowerCase()));
  if (lower.has("critical") || lower.has("epic")) return 5;
  if (lower.has("good first issue") || lower.has("beginner")) return 1;
  if (lower.has("easy")) return 2;
  if (lower.has("hard")) return 4;
  const len = body.length;
  if (len < 200) return 2;
  if (len < 800) return 3;
  if (len < 2000) return 4;
  return 5;
}

/** Promisified child_process.spawn with stdout capture and a hard error on non-zero exit. */
function runGh(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("gh", args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (b: Buffer) => (out += b.toString()));
    child.stderr.on("data", (b: Buffer) => (err += b.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`gh ${args.join(" ")} exited ${code}: ${err.trim() || "<no stderr>"}`));
      } else {
        resolve(out);
      }
    });
  });
}

// Re-exported for symmetry with mock.ts (consumers can import without
// caring which provider they got).
export { kindFromLabels };
