import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { DbExecutor } from "../../db/client.js";
import { subjects } from "../../db/schema.js";
import { newId } from "../../shared/id.js";
import type { SubjectSeedStore } from "./business-sub-subjects.seed.js";

export interface RootCapableSeedStore extends SubjectSeedStore {
  createRoot(name: string, description: string): Promise<string>;
  ensureRoot(name: string): Promise<{ id: string; created: boolean }>;
}

export function createSubjectSeedStore(db: DbExecutor): RootCapableSeedStore {
  const findChildByName: SubjectSeedStore["findChildByName"] = async (parentId, name) => {
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
  };

  return {
    async findRootByName(name) {
      const [row] = await db
        .select({ id: subjects.id })
        .from(subjects)
        .where(and(eq(subjects.name, name), isNull(subjects.parentId)))
        .orderBy(asc(subjects.createdAt), asc(subjects.id))
        .limit(1);

      return row?.id ?? null;
    },
    findChildByName,
    async createRoot(name, description) {
      return db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`root:${name}`})::bigint)`);

        const [existing] = await tx
          .select({ id: subjects.id })
          .from(subjects)
          .where(and(eq(subjects.name, name), isNull(subjects.parentId)))
          .orderBy(asc(subjects.createdAt), asc(subjects.id))
          .limit(1);

        if (existing) {
          return existing.id;
        }

        const id = newId("sub");

        await tx.insert(subjects).values({ id, name, description });

        return id;
      });
    },
    async ensureRoot(name) {
      const trimmed = name.trim();

      return db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtext(${`root:${trimmed.toLowerCase()}`})::bigint)`,
        );

        const [existing] = await tx
          .select({ id: subjects.id })
          .from(subjects)
          .where(
            and(
              isNull(subjects.parentId),
              sql`lower(trim(${subjects.name})) = lower(trim(${trimmed}))`,
            ),
          )
          .orderBy(asc(subjects.createdAt), asc(subjects.id))
          .limit(1);

        if (existing) {
          return { id: existing.id, created: false };
        }

        const id = newId("sub");

        await tx.insert(subjects).values({ id, name: trimmed });

        return { id, created: true };
      });
    },
    async createChild(parentId, name) {
      return db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${parentId})::bigint)`);

        const [parent] = await tx.select().from(subjects).where(eq(subjects.id, parentId)).limit(1);
        const [existing] = await tx
          .select({ id: subjects.id })
          .from(subjects)
          .where(
            and(
              eq(subjects.parentId, parentId),
              sql`lower(trim(${subjects.name})) = lower(trim(${name}))`,
            ),
          )
          .limit(1);

        if (existing) {
          return existing.id;
        }

        const id = newId("sub");

        await tx.insert(subjects).values({
          id,
          name,
          kind: parent?.kind ?? "architecture-mentor",
          requireSources: parent?.requireSources ?? false,
          parentId,
        });

        return id;
      });
    },
  };
}
