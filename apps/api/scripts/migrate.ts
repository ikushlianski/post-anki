import process from "node:process";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to run migrations");
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });
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
