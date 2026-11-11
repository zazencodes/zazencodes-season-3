import { attachDatabasePool } from "@neon/functions";
import pg from "pg";

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
attachDatabasePool(pool);

// Return `date` columns as plain YYYY-MM-DD strings rather than local-midnight Dates.
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);
