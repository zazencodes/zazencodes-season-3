import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}

const sql = postgres(databaseUrl);

export interface ResearchItem {
  readonly sessionId: string;
  readonly title: string;
  readonly updatedAt: string;
}

/** Records a message on a research item. The first message becomes its title. */
export async function recordResearchMessage(sessionId: string, message: string): Promise<void> {
  await sql`
    insert into research_items (session_id, title)
    values (${sessionId}, ${message})
    on conflict (session_id) do update set updated_at = now()
  `;
}

export async function listResearchItems(): Promise<ResearchItem[]> {
  const rows = await sql<{ session_id: string; title: string; updated_at: Date }[]>`
    select session_id, title, updated_at from research_items order by updated_at desc
  `;
  return rows.map((row) => ({
    sessionId: row.session_id,
    title: row.title,
    updatedAt: row.updated_at.toISOString(),
  }));
}
