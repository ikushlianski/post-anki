import process from "node:process";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { hashApiToken } from "../src/api-token/api-token.hash.js";
import { apiTokens } from "../src/db/schema.js";
import { newId } from "../src/shared/id.js";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to mint an api token");
  }

  const label = process.argv[2];

  if (!label) {
    throw new Error(
      "usage: tsx scripts/create-api-token.ts <label>, e.g. \"Ilya's phone\"",
    );
  }

  const rawToken = `pat_${randomBytes(32).toString("hex")}`;
  const tokenHash = hashApiToken(rawToken);

  const pool = new pg.Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);

  await db.insert(apiTokens).values({
    id: newId("apitoken"),
    label,
    tokenHash,
  });

  await pool.end();

  console.log(`Token minted for "${label}". Save it now — it will not be shown again:\n`);
  console.log(rawToken);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
