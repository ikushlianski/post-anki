import { and, desc, eq, inArray } from "drizzle-orm";
import type {
  ResolveSubjectDuplicateSuggestionInput,
  SubjectDuplicateSuggestion,
  SubjectDuplicateSuggestionStatus,
} from "@post-anki/shared";
import { getDb } from "../db/client.js";
import { subjectDuplicateSuggestions } from "../db/schema.js";
import { newId } from "../shared/id.js";
import { mergeSubjects, type MergeSubjectsError } from "../subject/subject.repo.js";

function toSuggestion(
  r: typeof subjectDuplicateSuggestions.$inferSelect,
): SubjectDuplicateSuggestion {
  return {
    id: r.id,
    subjectAId: r.subjectAId,
    subjectBId: r.subjectBId,
    similarity: r.similarity,
    reason: r.reason,
    source: r.source,
    status: r.status as SubjectDuplicateSuggestionStatus,
    createdAt: r.createdAt.toISOString(),
    resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
  };
}

// Postgres unique-violation error code — same constant curriculum-
// structure.ts's isPendingTurnConflict() checks for the identical race
// shape (a partial unique index closing a check-then-act gap between two
// concurrent inserts). Duplicated here rather than shared/imported, mirroring
// that module's own choice not to centralize this one-line check.
const POSTGRES_UNIQUE_VIOLATION = "23505";

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === POSTGRES_UNIQUE_VIOLATION
  );
}

export interface InsertDuplicateSuggestionParams {
  subjectXId: string;
  subjectYId: string;
  similarity: number;
  reason: string;
  source?: string;
}

// SCENARIO 8b / architecture.md's "DB-level partial unique index, not just
// an app-level check-then-act guard": the pre-check below (skip if a
// pending/rejected row already exists for this pair) covers the common
// case cheaply; the DB's partial unique index is the actual race-closer for
// two concurrent scans both observing "nothing pending yet" — a losing
// concurrent insert's constraint violation is caught here and treated as
// "already suggested, nothing to do", not an error. Always writes the
// lexicographically-smaller subject id as subjectAId (architecture.md's
// "Data model evolution") regardless of the order the caller passes the
// pair in.
export async function insertDuplicateSuggestionIfNew(
  params: InsertDuplicateSuggestionParams,
): Promise<SubjectDuplicateSuggestion | null> {
  const db = getDb();
  const [subjectAId, subjectBId] = [params.subjectXId, params.subjectYId].sort() as [
    string,
    string,
  ];

  // Insert-time dedup covers "rejected", not just "pending" (spec.md
  // Decision #12) — a rescan never re-inserts a pair the human already
  // rejected, even if the embeddings still clear the threshold.
  // accepted/stale rows are excluded from this check entirely since they
  // reference a deleted subject and structurally cannot recur.
  const existing = await db
    .select({ id: subjectDuplicateSuggestions.id })
    .from(subjectDuplicateSuggestions)
    .where(
      and(
        eq(subjectDuplicateSuggestions.subjectAId, subjectAId),
        eq(subjectDuplicateSuggestions.subjectBId, subjectBId),
        inArray(subjectDuplicateSuggestions.status, ["pending", "rejected"]),
      ),
    );

  if (existing.length > 0) {
    return null;
  }

  const id = newId("subdup");

  try {
    await db.insert(subjectDuplicateSuggestions).values({
      id,
      subjectAId,
      subjectBId,
      similarity: params.similarity,
      reason: params.reason,
      source: params.source ?? "embedding-similarity",
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return null;
    }

    throw err;
  }

  const inserted = (
    await db.select().from(subjectDuplicateSuggestions).where(eq(subjectDuplicateSuggestions.id, id))
  )[0]!;

  return toSuggestion(inserted);
}

export async function listSubjectDuplicateSuggestions(
  status?: SubjectDuplicateSuggestionStatus,
): Promise<SubjectDuplicateSuggestion[]> {
  const db = getDb();

  const rows = await db
    .select()
    .from(subjectDuplicateSuggestions)
    .where(status ? eq(subjectDuplicateSuggestions.status, status) : undefined)
    .orderBy(desc(subjectDuplicateSuggestions.createdAt));

  return rows.map(toSuggestion);
}

export async function getSubjectDuplicateSuggestion(
  suggestionId: string,
): Promise<SubjectDuplicateSuggestion | null> {
  const row = (
    await getDb()
      .select()
      .from(subjectDuplicateSuggestions)
      .where(eq(subjectDuplicateSuggestions.id, suggestionId))
  )[0];

  return row ? toSuggestion(row) : null;
}

export type ResolveSubjectDuplicateSuggestionError =
  | "not_found"
  | "already_resolved"
  | "invalid_target"
  | MergeSubjectsError;

// PATCH /subject-duplicate-suggestions/:id. Decision #14: idempotent — a
// row that is no longer "pending" (already accepted/rejected/stale, e.g. a
// duplicate/late-arriving request) returns "already_resolved" rather than
// flipping its status again. Reject only resolves the suggestion, touching
// neither subject (SCENARIO 5). Accept validates targetSubjectId against
// the suggestion's own pair (Decision #11 — never merges against an
// unrelated third subject) and then delegates to mergeSubjects' own
// resolvingSuggestionId parameter, so the merge and this row's "accepted"
// flip commit atomically in one transaction (Decision #7).
export async function resolveSubjectDuplicateSuggestion(
  suggestionId: string,
  input: ResolveSubjectDuplicateSuggestionInput,
): Promise<SubjectDuplicateSuggestion | { error: ResolveSubjectDuplicateSuggestionError }> {
  const db = getDb();

  const existing = (
    await db
      .select()
      .from(subjectDuplicateSuggestions)
      .where(eq(subjectDuplicateSuggestions.id, suggestionId))
  )[0];

  if (!existing) {
    return { error: "not_found" };
  }

  if (existing.status !== "pending") {
    return { error: "already_resolved" };
  }

  if (input.status === "rejected") {
    await db
      .update(subjectDuplicateSuggestions)
      .set({ status: "rejected", resolvedAt: new Date() })
      .where(eq(subjectDuplicateSuggestions.id, suggestionId));

    const updated = (
      await db
        .select()
        .from(subjectDuplicateSuggestions)
        .where(eq(subjectDuplicateSuggestions.id, suggestionId))
    )[0]!;

    return toSuggestion(updated);
  }

  if (
    input.targetSubjectId !== existing.subjectAId &&
    input.targetSubjectId !== existing.subjectBId
  ) {
    return { error: "invalid_target" };
  }

  const sourceSubjectId =
    input.targetSubjectId === existing.subjectAId ? existing.subjectBId : existing.subjectAId;

  const mergeResult = await mergeSubjects(input.targetSubjectId, sourceSubjectId, suggestionId);

  if ("error" in mergeResult) {
    return { error: mergeResult.error };
  }

  const updated = (
    await db
      .select()
      .from(subjectDuplicateSuggestions)
      .where(eq(subjectDuplicateSuggestions.id, suggestionId))
  )[0]!;

  return toSuggestion(updated);
}
