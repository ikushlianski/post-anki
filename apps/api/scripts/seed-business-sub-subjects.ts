import process from "node:process";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import * as schema from "../src/db/schema.ts";
import { newId } from "../src/shared/id.ts";
import { absorbParentItemsOnFirstChild, hasChildSubjects } from "../src/subject/subject-leaf.ts";
import {
  seedBusinessSubSubjects,
  type SubjectSeedStore,
} from "../src/subject/seed/business-sub-subjects.seed.ts";

const { subjects } = schema;

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to seed sub-subjects");
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });

  const store: SubjectSeedStore = {
    async findRootByName(name) {
      const [row] = await db
        .select({ id: subjects.id })
        .from(subjects)
        .where(and(eq(subjects.name, name), isNull(subjects.parentId)))
        .orderBy(asc(subjects.createdAt), asc(subjects.id))
        .limit(1);

      return row?.id ?? null;
    },
    async findChildByName(parentId, name) {
      const [row] = await db
        .select({ id: subjects.id })
        .from(subjects)
        .where(
          and(
            eq(subjects.parentId, parentId),
            sql`lower(trim(${subjects.name})) = lower(trim(${name}))`,
          ),
        )
        .limit(1);

      return row?.id ?? null;
    },
    async createChild(parentId, name) {
      return db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${parentId})::bigint)`);

        const [parent] = await tx.select().from(subjects).where(eq(subjects.id, parentId)).limit(1);
        const hadChildren = await hasChildSubjects(parentId, tx);
        const id = newId("sub");

        await tx.insert(subjects).values({
          id,
          name,
          kind: parent?.kind ?? "architecture-mentor",
          requireSources: parent?.requireSources ?? false,
          parentId,
        });
        await absorbParentItemsOnFirstChild(parentId, { id, name }, hadChildren, tx);

        return id;
      });
    },
  };

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
