import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { loadEnv } from "../shared/env.js";
import * as schema from "./schema.js";

let pool: pg.Pool | undefined;
let db: ReturnType<typeof drizzle<typeof schema>> | undefined;

export type Db = ReturnType<typeof getDb>;

// The type a repo function accepts when it's willing to run either against
// the shared pool or inside an already-open db.transaction(async (tx) => {})
// — derived from Db["transaction"]'s own callback parameter rather than
// hand-naming drizzle's PgTransaction generic, so it stays correct across
// drizzle-orm version bumps.
export type DbExecutor = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

export function getDb() {
  if (!db) {
    const env = loadEnv();

    // Without connectionTimeoutMillis, pg.Pool queues a connection request
    // FOREVER once all `max` connections are checked out — an exhausted pool
    // is a permanent hang, not an error, and a caller that hangs while
    // holding an advisory lock blocks every other writer on that entity until
    // the process restarts. 10s matches idleTimeoutMillis and is longer than
    // any legitimate wait here: every caller is behind an HTTP request or a
    // cron job, where failing loudly beats waiting.
    pool = new pg.Pool({
      connectionString: env.DATABASE_URL,
      max: 4,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    });
    db = drizzle(pool, { schema });
  }

  return db;
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
    db = undefined;
  }
}
