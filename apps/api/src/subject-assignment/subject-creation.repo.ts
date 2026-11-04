import { sql } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { subjects } from "../db/schema.js";
import { newId } from "../shared/id.js";
import { SUBJECT_SUGGESTION_MAX_DEPTH } from "../subject-suggestion/subject-suggestion.config.js";
import { clashesWithExistingName, subjectDepth, type ExistingSubject } from "./subject-creation.validate.js";

const ROOT_LOCK_KEY = "subject-root";

export interface GuardedSubjectInput {
  name: string;
  parentId: string | null;
  languageHint: boolean;
}

export async function createSubjectUnlessDuplicate(input: GuardedSubjectInput): Promise<string | null> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${input.parentId ?? ROOT_LOCK_KEY})::bigint)`);

    const rows = await tx
      .select({ id: subjects.id, name: subjects.name, parentId: subjects.parentId, kind: subjects.kind })
      .from(subjects);
    const existing: ExistingSubject[] = rows.map((row) => ({ ...row, embedding: null }));
    const parent = input.parentId === null ? undefined : rows.find((row) => row.id === input.parentId);

    if (input.parentId !== null) {
      const depth = parent ? subjectDepth(parent.id, existing) : null;

      if (depth === null || depth >= SUBJECT_SUGGESTION_MAX_DEPTH) {
        return null;
      }
    }

    if (clashesWithExistingName(input.name, existing, input.parentId)) {
      return null;
    }

    const id = newId("sub");

    await tx.insert(subjects).values({
      id,
      name: input.name,
      parentId: input.parentId,
      kind: parent?.kind ?? (input.languageHint ? "language-practice" : "architecture-mentor"),
    });

    return id;
  });
}
