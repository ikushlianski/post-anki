import process from "node:process";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { subjectCategories, subjects } from "../src/db/schema.ts";
import { newId } from "../src/shared/id.ts";

// subject-category-nesting — the two starter categories this ticket
// promises: AI > RAG (unblocks placing the Turbopuffer course) and
// Programming / Web Development > Web Theory (grounded in the user's real
// Anki-deck folder structure, web-dev/web-theory/storage). Deliberately NOT
// a "Databases" category under Programming / Web Development — Postgres
// content belongs under the new top-level "Databases" subject
// (seed-subjects.ts) instead, to avoid recreating the duplicate-taxonomy
// problem this codebase's subject-duplicate detection already guards
// against. See .planning/unassigned/subject-category-nesting/spec.md.
const SEED_CATEGORIES: { subjectName: string; categoryName: string }[] = [
  { subjectName: "AI", categoryName: "RAG" },
  { subjectName: "Programming / Web Development", categoryName: "Web Theory" },
];

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to seed subject categories");
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);

  let created = 0;
  let skipped = 0;

  for (const category of SEED_CATEGORIES) {
    const subjectRow = (
      await db
        .select({ id: subjects.id })
        .from(subjects)
        .where(eq(subjects.name, category.subjectName))
        .limit(1)
    )[0];

    if (!subjectRow) {
      console.warn(
        `subject "${category.subjectName}" not found — skipping category "${category.categoryName}" (run seed-subjects first)`,
      );
      skipped += 1;
      continue;
    }

    const existing = await db
      .select({ id: subjectCategories.id })
      .from(subjectCategories)
      .where(
        and(
          eq(subjectCategories.subjectId, subjectRow.id),
          eq(subjectCategories.name, category.categoryName),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      skipped += 1;
      continue;
    }

    await db.insert(subjectCategories).values({
      id: newId("cat"),
      subjectId: subjectRow.id,
      parentId: null,
      name: category.categoryName,
    });
    created += 1;
  }

  await pool.end();
  console.log(`subject categories seeded: ${created} created, ${skipped} skipped`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
