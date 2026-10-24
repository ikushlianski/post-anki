import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type {
  ResolveSubjectSuggestionInput,
  SubjectSuggestion,
  SubjectSuggestionKind,
  SubjectSuggestionStatus,
} from "@post-anki/shared";
import { getDb } from "../db/client.js";
import { subjectSuggestionRuns, subjectSuggestions, subjects } from "../db/schema.js";
import { newId } from "../shared/id.js";
import type { Tx } from "../shared/merge-lock.js";
import { createSubject } from "../subject/subject.repo.js";
import { SUBJECT_SUGGESTION_MAX_DEPTH } from "./subject-suggestion.config.js";
import { buildDedupeKey, normalizeSubjectName } from "./subject-suggestion.keys.js";
import type { SubjectSuggestionStore } from "./subject-suggestion.store.js";

function toSuggestion(r: typeof subjectSuggestions.$inferSelect): SubjectSuggestion {
  return {
    id: r.id,
    kind: r.kind as SubjectSuggestionKind,
    parentSubjectId: r.parentSubjectId,
    proposedName: r.proposedName,
    reason: r.reason,
    evidenceCount: r.evidenceCount,
    evidenceSamples: r.evidenceSamples,
    status: r.status as SubjectSuggestionStatus,
    createdSubjectId: r.createdSubjectId,
    createdAt: r.createdAt.toISOString(),
    resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
  };
}

export const subjectSuggestionStore: SubjectSuggestionStore = {
  async insertSuggestionIfNew(params) {
    const rows = await getDb()
      .insert(subjectSuggestions)
      .values({
        id: newId("subsug"),
        kind: params.kind,
        parentSubjectId: params.parentSubjectId,
        proposedName: params.proposedName,
        reason: params.reason,
        evidenceIds: params.evidenceIds,
        evidenceSamples: params.evidenceSamples,
        evidenceCount: params.evidenceCount,
        dedupeKey: buildDedupeKey(params.kind, params.parentSubjectId, params.proposedName),
      })
      .onConflictDoNothing({ target: subjectSuggestions.dedupeKey })
      .returning({ id: subjectSuggestions.id });

    return rows.length > 0;
  },

  async countPending(kind, parentId) {
    const [row] = await getDb()
      .select({ count: sql<number>`count(*)::int` })
      .from(subjectSuggestions)
      .where(
        and(
          eq(subjectSuggestions.kind, kind),
          eq(subjectSuggestions.status, "pending"),
          parentId === undefined
            ? undefined
            : parentId === null
              ? isNull(subjectSuggestions.parentSubjectId)
              : eq(subjectSuggestions.parentSubjectId, parentId),
        ),
      );

    return row?.count ?? 0;
  },

  async getLastRun() {
    const [row] = await getDb()
      .select({ ranAt: subjectSuggestionRuns.ranAt, poolSize: subjectSuggestionRuns.poolSize })
      .from(subjectSuggestionRuns)
      .orderBy(desc(subjectSuggestionRuns.ranAt))
      .limit(1);

    return row ?? null;
  },

  async recordRun(params) {
    await getDb()
      .insert(subjectSuggestionRuns)
      .values({
        id: newId("subsugrun"),
        trigger: params.trigger,
        calls: params.calls,
        created: params.created,
        poolSize: params.poolSize,
      });
  },
};

export const insertSuggestionIfNew = subjectSuggestionStore.insertSuggestionIfNew;
export const countPending = subjectSuggestionStore.countPending;
export const getLastRun = subjectSuggestionStore.getLastRun;
export const recordRun = subjectSuggestionStore.recordRun;

export async function listSubjectSuggestions(
  status?: SubjectSuggestionStatus,
): Promise<SubjectSuggestion[]> {
  const rows = await getDb()
    .select()
    .from(subjectSuggestions)
    .where(status ? eq(subjectSuggestions.status, status) : undefined)
    .orderBy(desc(subjectSuggestions.createdAt));

  return rows.map(toSuggestion);
}

export type ResolveSubjectSuggestionError =
  | "not_found"
  | "already_resolved"
  | "parent_not_found"
  | "depth_exceeded"
  | "name_taken";

async function depthOf(tx: Tx, subjectId: string): Promise<number | null> {
  let depth = 0;
  let currentId: string | null = subjectId;

  while (currentId !== null && depth <= SUBJECT_SUGGESTION_MAX_DEPTH + 1) {
    const [row]: { parentId: string | null }[] = await tx
      .select({ parentId: subjects.parentId })
      .from(subjects)
      .where(eq(subjects.id, currentId))
      .limit(1);

    if (!row) {
      return null;
    }

    depth += 1;
    currentId = row.parentId;
  }

  return depth;
}

async function siblingNameTaken(tx: Tx, parentId: string | null, name: string): Promise<boolean> {
  const siblings = await tx
    .select({ name: subjects.name })
    .from(subjects)
    .where(parentId === null ? isNull(subjects.parentId) : eq(subjects.parentId, parentId));
  const wanted = normalizeSubjectName(name);

  return siblings.some((s) => normalizeSubjectName(s.name) === wanted);
}

export async function resolveSubjectSuggestion(
  suggestionId: string,
  input: ResolveSubjectSuggestionInput,
): Promise<SubjectSuggestion | { error: ResolveSubjectSuggestionError }> {
  return getDb().transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`subject-suggestion:${suggestionId}`})::bigint)`,
    );

    const [row] = await tx
      .select()
      .from(subjectSuggestions)
      .where(eq(subjectSuggestions.id, suggestionId))
      .limit(1);

    if (!row) {
      return { error: "not_found" as const };
    }

    if (row.status !== "pending") {
      return { error: "already_resolved" as const };
    }

    if (input.action === "dismiss") {
      const [updated] = await tx
        .update(subjectSuggestions)
        .set({ status: "dismissed", resolvedAt: new Date() })
        .where(eq(subjectSuggestions.id, suggestionId))
        .returning();

      return toSuggestion(updated!);
    }

    const name = input.name ?? row.proposedName;
    let parentKind = "architecture-mentor";

    if (row.parentSubjectId !== null) {
      const [parent] = await tx
        .select({ kind: subjects.kind })
        .from(subjects)
        .where(eq(subjects.id, row.parentSubjectId))
        .limit(1);

      if (!parent) {
        return { error: "parent_not_found" as const };
      }

      parentKind = parent.kind;

      const depth = await depthOf(tx, row.parentSubjectId);

      if (depth === null) {
        return { error: "parent_not_found" as const };
      }

      if (depth >= SUBJECT_SUGGESTION_MAX_DEPTH) {
        return { error: "depth_exceeded" as const };
      }
    }

    if (await siblingNameTaken(tx, row.parentSubjectId, name)) {
      return { error: "name_taken" as const };
    }

    const created = await createSubject({
      name,
      kind: parentKind as "architecture-mentor" | "language-practice",
      parentId: row.parentSubjectId,
    });

    const [updated] = await tx
      .update(subjectSuggestions)
      .set({ status: "approved", createdSubjectId: created.id, resolvedAt: new Date() })
      .where(eq(subjectSuggestions.id, suggestionId))
      .returning();

    return toSuggestion(updated!);
  });
}
