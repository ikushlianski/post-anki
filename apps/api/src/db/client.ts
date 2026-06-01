import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { loadEnv } from "../shared/env.js";
import * as schema from "./schema.js";

let pool: pg.Pool | undefined;
let db: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function getDb() {
  if (!db) {
    const env = loadEnv();

    pool = new pg.Pool({
      connectionString: env.DATABASE_URL,
      max: 4,
      idleTimeoutMillis: 10_000,
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
