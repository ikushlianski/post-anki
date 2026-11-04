import { asc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import type { ModelTier, Subject } from "@post-anki/shared";
import { getDb } from "../db/client.js";
import { subjects } from "../db/schema.js";
import { countApprovedCardsBySubject } from "./subject-card-count.repo.js";

export function toSubject(r: typeof subjects.$inferSelect): Subject {
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? undefined,
    requireSources: r.requireSources,
    kind: r.kind as Subject["kind"],
    modelTier: (r.modelTier as ModelTier | null) ?? null,
    parentId: r.parentId ?? null,
    sortOrder: r.sortOrder ?? null,
    learningIntent: r.learningIntent ?? null,
  };
}

export async function listSubjects(): Promise<Subject[]> {
  const [rows, cardCounts] = await Promise.all([
    getDb()
      .select()
      .from(subjects)
      .orderBy(sql`${subjects.sortOrder} asc nulls last`, asc(subjects.name)),
    countApprovedCardsBySubject(),
  ]);

  return rows.map((row) => ({ ...toSubject(row), cardCount: cardCounts.get(row.id) ?? 0 }));
}

export const SUBJECT_SEARCH_LIMIT = 50;

// Escapes LIKE/ILIKE metacharacters so user input is matched literally.
export function escapeLikePattern(term: string): string {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}

// Case-insensitive match on name or description. Ranks exact name matches first,
// then name prefixes, then everything else (name or description contains the term).
export async function searchSubjectsByText(query: string): Promise<Subject[]> {
  const escaped = escapeLikePattern(query);
  const prefixPattern = `${escaped}%`;
  const containsPattern = `%${escaped}%`;
  const matchRank = sql<number>`case
    when lower(${subjects.name}) = lower(${query}) then 0
    when ${subjects.name} ilike ${prefixPattern} then 1
    else 2
  end`;

  const rows = await getDb()
    .select()
    .from(subjects)
    .where(
      or(
        ilike(subjects.name, containsPattern),
        ilike(subjects.description, containsPattern),
      ),
    )
    .orderBy(matchRank, subjects.name, subjects.id)
    .limit(SUBJECT_SEARCH_LIMIT);

  return rows.map(toSubject);
}

// Batches name lookups for a known set of subject ids, e.g. paging a list of
// courses without fetching every subject in the workspace.
export async function getSubjectNamesByIds(subjectIds: string[]): Promise<Map<string, string>> {
  if (subjectIds.length === 0) {
    return new Map();
  }

  const rows = await getDb()
    .select({ id: subjects.id, name: subjects.name })
    .from(subjects)
    .where(inArray(subjects.id, subjectIds));

  return new Map(rows.map((row) => [row.id, row.name]));
}

export async function getSubject(subjectId: string): Promise<Subject | null> {
  const row = (
    await getDb().select().from(subjects).where(eq(subjects.id, subjectId))
  )[0];

  return row ? toSubject(row) : null;
}

export async function getSubjectModelTier(subjectId: string): Promise<ModelTier | null> {
  const row = (
    await getDb()
      .select({ modelTier: subjects.modelTier })
      .from(subjects)
      .where(eq(subjects.id, subjectId))
  )[0];

  return (row?.modelTier as ModelTier | null) ?? null;
}

export interface SubjectForDuplicateScan {
  id: string;
  name: string;
  description: string | null;
  embeddingHash: string | null;
}

// ai-duplicate-detection (issue #63) — the orchestrator's only read of the
// subjects table. Scoped to "architecture-mentor" only (SCENARIO 1 —
// language-practice subjects, e.g. flashcard decks, are never compared or
// suggested, matching mergeSubjects' own kind restriction) and exposes the
// internal embedding/embeddingHash columns the public Subject type
// deliberately omits.
export async function listArchitectureMentorSubjectsForDuplicateScan(): Promise<
  SubjectForDuplicateScan[]
> {
  return getDb()
    .select({
      id: subjects.id,
      name: subjects.name,
      description: subjects.description,
      embeddingHash: subjects.embeddingHash,
    })
    .from(subjects)
    .where(eq(subjects.kind, "architecture-mentor"));
}
