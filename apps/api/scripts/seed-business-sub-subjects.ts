import process from "node:process";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../src/db/schema.ts";
import { seedBusinessSubSubjects } from "../src/subject/seed/business-sub-subjects.seed.ts";
import { createSubjectSeedStore } from "../src/subject/seed/subject-seed.store.ts";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to seed sub-subjects");
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });

  const store = createSubjectSeedStore(db);

  try {
    const result = await seedBusinessSubSubjects(store);

    console.log(
      `business sub-subjects seeded: ${result.created.length} created, ${result.skipped.length} already present`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
