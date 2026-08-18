import type { Issue } from "@minimax-dev-rpg/protocol";

/**
 * Abstraction over "where do issues come from". v0.1 uses the mock; v0.2 will
 * provide an Octokit-backed implementation selected by env vars.
 */
export interface IssueProvider {
  /** Stable id used as the source of truth for issue→monster mapping. */
  readonly name: string;
  listIssues(): Promise<Issue[]>;
  /** Optional subscription for live updates. Mock may return a no-op. */
  onUpdate?(cb: (issues: Issue[]) => void): () => void;
}
