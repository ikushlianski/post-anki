import { and, desc, eq, inArray } from "drizzle-orm";
import type {
  LearningListItem,
  LearningListItemKind,
  LearningListItemStatus,
  LearningListRecommendation,
  SeriesVerdictValue,
  TaxonomyArea,
} from "@post-anki/shared";
import { learningListRecommendationSchema } from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import { domainNodes, learningListItems } from "../db/schema.js";
import { newId } from "../shared/id.js";

type LearningListRow = typeof learningListItems.$inferSelect;

function parseRecommendation(raw: string | null): LearningListRecommendation | null {
  if (raw === null || raw.length === 0) {
    return null;
  }

  try {
    const parsed = learningListRecommendationSchema.safeParse(JSON.parse(raw));

    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function toLearningListItem(row: LearningListRow): LearningListItem {
  return {
    id: row.id,
    url: row.url,
    rawText: row.rawText,
    title: row.title,
    kind: row.kind as LearningListItemKind,
    verdict: (row.verdict as SeriesVerdictValue | null) ?? null,
    recommendation: parseRecommendation(row.recommendation),
    status: row.status as LearningListItemStatus,
    curriculumId: row.curriculumId,
    questionsGenerated: row.questionsGenerated,
    questionCeiling: row.questionCeiling,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface InsertLearningListItemParams {
  url: string | null;
  rawText: string | null;
  title: string | null;
  kind: LearningListItemKind;
  status?: LearningListItemStatus;
}

export async function insertLearningListItem(
  params: InsertLearningListItemParams,
  db: DbExecutor = getDb(),
): Promise<LearningListItem> {
  const inserted = (
    await db
      .insert(learningListItems)
      .values({
        id: newId("llitem"),
        url: params.url,
        rawText: params.rawText,
        title: params.title,
        kind: params.kind,
        status: params.status ?? "captured",
      })
      .returning()
  )[0]!;

  return toLearningListItem(inserted);
}

export async function insertSiblingLearningListItems(
  urls: string[],
  db: DbExecutor = getDb(),
): Promise<LearningListItem[]> {
  if (urls.length === 0) {
    return [];
  }

  const existing = await db
    .select({ url: learningListItems.url })
    .from(learningListItems)
    .where(inArray(learningListItems.url, urls));
  const known = new Set(existing.map((row) => row.url));
  const fresh = Array.from(new Set(urls)).filter((url) => !known.has(url));

  if (fresh.length === 0) {
    return [];
  }

  const rows = await db
    .insert(learningListItems)
    .values(
      fresh.map((url) => ({
        id: newId("llitem"),
        url,
        rawText: null,
        title: null,
        kind: "article" as const,
        status: "captured" as const,
      })),
    )
    .returning();

  return rows.map(toLearningListItem);
}

export async function getLearningListItem(
  itemId: string,
  db: DbExecutor = getDb(),
): Promise<LearningListItem | null> {
  const row = (
    await db.select().from(learningListItems).where(eq(learningListItems.id, itemId)).limit(1)
  )[0];

  return row ? toLearningListItem(row) : null;
}

export async function getLearningListItemByCurriculumId(
  curriculumId: string,
  db: DbExecutor = getDb(),
): Promise<LearningListItem | null> {
  const row = (
    await db
      .select()
      .from(learningListItems)
      .where(eq(learningListItems.curriculumId, curriculumId))
      .limit(1)
  )[0];

  return row ? toLearningListItem(row) : null;
}

export async function listLearningListItemsByIds(
  itemIds: string[],
  db: DbExecutor = getDb(),
): Promise<LearningListItem[]> {
  if (itemIds.length === 0) {
    return [];
  }

  const rows = await db
    .select()
    .from(learningListItems)
    .where(inArray(learningListItems.id, itemIds));

  return rows.map(toLearningListItem);
}

export async function listLearningListItems(
  status?: LearningListItemStatus,
  db: DbExecutor = getDb(),
): Promise<LearningListItem[]> {
  const query = db.select().from(learningListItems);
  const rows = await (status
    ? query.where(eq(learningListItems.status, status))
    : query
  ).orderBy(desc(learningListItems.createdAt));

  return rows.map(toLearningListItem);
}

export interface SaveClassificationParams {
  title: string | null;
  rawText: string | null;
  verdict: SeriesVerdictValue;
  recommendation: LearningListRecommendation;
  questionCeiling: number;
  status: LearningListItemStatus;
}

export async function saveClassification(
  itemId: string,
  params: SaveClassificationParams,
  db: DbExecutor = getDb(),
): Promise<LearningListItem | null> {
  const updated = (
    await db
      .update(learningListItems)
      .set({
        title: params.title,
        rawText: params.rawText,
        verdict: params.verdict,
        recommendation: JSON.stringify(params.recommendation),
        questionCeiling: params.questionCeiling,
        status: params.status,
        updatedAt: new Date(),
      })
      .where(eq(learningListItems.id, itemId))
      .returning()
  )[0];

  return updated ? toLearningListItem(updated) : null;
}

export async function markLearningListItemUnreachable(
  itemId: string,
  db: DbExecutor = getDb(),
): Promise<void> {
  await db
    .update(learningListItems)
    .set({ status: "unreachable", updatedAt: new Date() })
    .where(eq(learningListItems.id, itemId));
}

export type ClaimRecommendationError = "not_found" | "not_awaiting_decision";

export async function claimRecommendation(
  itemId: string,
  nextStatus: LearningListItemStatus,
  db: DbExecutor = getDb(),
): Promise<LearningListItem | { error: ClaimRecommendationError }> {
  return db.transaction(async (tx) => {
    const existing = (
      await tx.select().from(learningListItems).where(eq(learningListItems.id, itemId)).limit(1)
    )[0];

    if (!existing) {
      return { error: "not_found" as const };
    }

    const claimed = (
      await tx
        .update(learningListItems)
        .set({ status: nextStatus, updatedAt: new Date() })
        .where(
          and(eq(learningListItems.id, itemId), eq(learningListItems.status, "classified")),
        )
        .returning()
    )[0];

    if (!claimed) {
      return { error: "not_awaiting_decision" as const };
    }

    return toLearningListItem(claimed);
  });
}

export async function releaseRecommendationClaim(
  itemId: string,
  db: DbExecutor = getDb(),
): Promise<void> {
  await db
    .update(learningListItems)
    .set({ status: "classified", updatedAt: new Date() })
    .where(
      and(eq(learningListItems.id, itemId), eq(learningListItems.status, "course_created")),
    );
}

export async function linkCurriculum(
  itemId: string,
  curriculumId: string,
  db: DbExecutor = getDb(),
): Promise<LearningListItem | null> {
  const updated = (
    await db
      .update(learningListItems)
      .set({ curriculumId, updatedAt: new Date() })
      .where(eq(learningListItems.id, itemId))
      .returning()
  )[0];

  return updated ? toLearningListItem(updated) : null;
}

// `now` is stamped onto `updatedAt` explicitly rather than via `new Date()`
// so this row's own pacing anchor (slice-release.ts reads `updatedAt` back
// as `lastReleasedAt`) lines up with whatever logical clock the caller is
// using — the same explicit-`now` convention `recordLivenessActivity` and
// friends already use, and required here since a real `new Date()` call
// would drift out of sync with a backdated/advanced `now` a caller passes
// (e.g. in tests, or a slightly-delayed background release).
export async function advanceIngestionCursor(
  itemId: string,
  questionsGenerated: number,
  now: string,
  db: DbExecutor = getDb(),
): Promise<void> {
  await db
    .update(learningListItems)
    .set({ questionsGenerated, updatedAt: new Date(now) })
    .where(eq(learningListItems.id, itemId));
}

export interface SubSubjectAreas {
  subSubjectNodeId: string;
  subSubjectName: string;
  areas: TaxonomyArea[];
}

export async function listAreaPlacementCandidates(
  subjectId: string,
  db: DbExecutor = getDb(),
): Promise<SubSubjectAreas[]> {
  const rows = await db
    .select({
      id: domainNodes.id,
      parentId: domainNodes.parentId,
      name: domainNodes.name,
      kind: domainNodes.kind,
    })
    .from(domainNodes)
    .where(and(eq(domainNodes.subjectId, subjectId), inArray(domainNodes.kind, ["sub_subject", "area"])));

  const subSubjects = rows.filter((row) => row.kind === "sub_subject");

  return subSubjects.map((subSubject) => ({
    subSubjectNodeId: subSubject.id,
    subSubjectName: subSubject.name,
    areas: rows
      .filter((row) => row.kind === "area" && row.parentId === subSubject.id)
      .map((row) => ({ id: row.id, name: row.name })),
  }));
}
