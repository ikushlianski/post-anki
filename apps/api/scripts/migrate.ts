import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { loadEnv } from "../src/shared/env.js";

async function main() {
  const env = loadEnv();
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
  const db = drizzle(pool);

  await migrate(db, {
    migrationsFolder: "./src/db/migrations",
    migrationsTable: "drizzle_migrations_api",
  });

  await pool.end();
  console.log("api migrations applied");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
