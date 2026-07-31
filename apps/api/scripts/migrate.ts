import process from "node:process";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

// `apps/api/.env`'s own DATABASE_URL points at the production Neon database
// (CI's deploy job overrides it via its own env, but a bare local
// `npm run db:migrate` picks up the checked-in .env file). This has bitten
// two separate sessions the same way: someone runs the command intending to
// target the local e2e stack, forgets to export DATABASE_URL first, and it
// silently migrates production instead. GitHub Actions always sets CI=true,
// so this only gates the interactive/local case — CI's real deploy-time
// migrate against production is untouched. An explicit
// ALLOW_REMOTE_DB_MIGRATE=1 escape hatch exists for a genuine one-off
// intentional local run against a remote target.
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function assertLocalUnlessCi(databaseUrl: string): void {
  if (process.env.CI || process.env.ALLOW_REMOTE_DB_MIGRATE === "1") {
    return;
  }

  let host: string;

  try {
    host = new URL(databaseUrl).hostname;
  } catch {
    throw new Error(`DATABASE_URL is not a valid connection URL: ${databaseUrl}`);
  }

  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `Refusing to run 'npm run db:migrate' outside CI against a non-local host ("${host}").\n` +
        "This almost always means DATABASE_URL wasn't set to your local/e2e Postgres before running\n" +
        "this command, and apps/api/.env's own value (production) is being used by default.\n" +
        "If you genuinely intend to migrate a remote database from here, re-run with\n" +
        "ALLOW_REMOTE_DB_MIGRATE=1 set explicitly.",
    );
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to run migrations");
  }

  assertLocalUnlessCi(databaseUrl);

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
