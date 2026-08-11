import { and, desc, eq, inArray } from "drizzle-orm";
import type {
  ResolveSourceDuplicateSuggestionInput,
  SourceDuplicateMatchKind,
  SourceDuplicateSuggestion,
  SourceDuplicateSuggestionStatus,
} from "@post-anki/shared";
import { getDb } from "../db/client.js";
import { sourceDuplicateSuggestions } from "../db/schema.js";
import { newId } from "../shared/id.js";

function toSuggestion(
  r: typeof sourceDuplicateSuggestions.$inferSelect,
): SourceDuplicateSuggestion {
  return {
    id: r.id,
    sourceAId: r.sourceAId,
    sourceBId: r.sourceBId,
    similarity: r.similarity,
    matchKind: r.matchKind as SourceDuplicateMatchKind,
    reason: r.reason,
    status: r.status as SourceDuplicateSuggestionStatus,
    createdAt: r.createdAt.toISOString(),
    resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
  };
}

// Postgres unique-violation error code — same one-line check every other
// partial-unique-index race guard in this codebase duplicates locally
// rather than centralizing (subject-duplicate.repo.ts, curriculum-
// structure.ts's isPendingTurnConflict()).
const POSTGRES_UNIQUE_VIOLATION = "23505";

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === POSTGRES_UNIQUE_VIOLATION
  );
}

export interface InsertSourceDuplicateSuggestionParams {
  sourceXId: string;
  sourceYId: string;
  similarity: number | null;
  matchKind: SourceDuplicateMatchKind;
  reason: string;
}

// The pre-check covers "pending" and "dismissed" — a rescan never
// re-inserts a pair the human already said isn't a duplicate, even if it
// still clears the same tier's match condition next time. There is no
// "accepted"/"stale" status here (unlike subject_duplicate_suggestions):
// this table never merges or deletes a source, so a suggestion can never
// become stale from its own referenced row disappearing out from under it.
// The DB's partial unique index (status = 'pending' only) is the real race
// closer for two concurrent scans both observing "nothing pending yet" —
// this pre-check is the cheap common-case skip, not the correctness
// guarantee.
export async function insertSourceDuplicateSuggestionIfNew(
  params: InsertSourceDuplicateSuggestionParams,
): Promise<SourceDuplicateSuggestion | null> {
  const db = getDb();
  const [sourceAId, sourceBId] = [params.sourceXId, params.sourceYId].sort() as [string, string];

  const existing = await db
    .select({ id: sourceDuplicateSuggestions.id })
    .from(sourceDuplicateSuggestions)
    .where(
      and(
        eq(sourceDuplicateSuggestions.sourceAId, sourceAId),
        eq(sourceDuplicateSuggestions.sourceBId, sourceBId),
        inArray(sourceDuplicateSuggestions.status, ["pending", "dismissed"]),
      ),
    );

  if (existing.length > 0) {
    return null;
  }

  const id = newId("srcdup");

  try {
    await db.insert(sourceDuplicateSuggestions).values({
      id,
      sourceAId,
      sourceBId,
      similarity: params.similarity,
      matchKind: params.matchKind,
      reason: params.reason,
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return null;
    }

    throw err;
  }

  const inserted = (
    await db
      .select()
      .from(sourceDuplicateSuggestions)
      .where(eq(sourceDuplicateSuggestions.id, id))
  )[0]!;

  return toSuggestion(inserted);
}

export async function listSourceDuplicateSuggestions(
  status?: SourceDuplicateSuggestionStatus,
): Promise<SourceDuplicateSuggestion[]> {
  const db = getDb();

  const rows = await db
    .select()
    .from(sourceDuplicateSuggestions)
    .where(status ? eq(sourceDuplicateSuggestions.status, status) : undefined)
    .orderBy(desc(sourceDuplicateSuggestions.createdAt));

  return rows.map(toSuggestion);
}

export type ResolveSourceDuplicateSuggestionError = "not_found" | "already_resolved";

// PATCH /source-duplicate-suggestions/:id. SCENARIO 5: this ONLY ever
// writes status/resolvedAt on this row — no other table, no sources row,
// no topics.sourceId. Idempotent — a row that is no longer "pending"
// returns "already_resolved" rather than flipping its status again.
export async function resolveSourceDuplicateSuggestion(
  suggestionId: string,
  input: ResolveSourceDuplicateSuggestionInput,
): Promise<SourceDuplicateSuggestion | { error: ResolveSourceDuplicateSuggestionError }> {
  const db = getDb();

  const existing = (
    await db
      .select()
      .from(sourceDuplicateSuggestions)
      .where(eq(sourceDuplicateSuggestions.id, suggestionId))
  )[0];

  if (!existing) {
    return { error: "not_found" };
  }

  if (existing.status !== "pending") {
    return { error: "already_resolved" };
  }

  await db
    .update(sourceDuplicateSuggestions)
    .set({ status: input.status, resolvedAt: new Date() })
    .where(eq(sourceDuplicateSuggestions.id, suggestionId));

  const updated = (
    await db
      .select()
      .from(sourceDuplicateSuggestions)
      .where(eq(sourceDuplicateSuggestions.id, suggestionId))
  )[0]!;

  return toSuggestion(updated);
}
