import { and, asc, eq, lt } from "drizzle-orm";
import type { Lecture, LectureStatus } from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import { lectureCitations, lectureSections, lectures } from "../db/schema.js";
import { GENERATING_STALE_AFTER_MS } from "../shared/generating-staleness.js";
import { newId } from "../shared/id.js";

export interface LecturePlanContent {
  title: string;
  sections: { heading: string; body: string }[];
  citations: { title: string; url: string }[];
}

async function rowToLecture(row: typeof lectures.$inferSelect): Promise<Lecture> {
  const db = getDb();

  const [sectionRows, citationRows] = await Promise.all([
    db
      .select()
      .from(lectureSections)
      .where(eq(lectureSections.lectureId, row.id))
      .orderBy(asc(lectureSections.order)),
    db.select().from(lectureCitations).where(eq(lectureCitations.lectureId, row.id)),
  ]);

  return {
    id: row.id,
    topicId: row.topicId,
    title: row.title,
    status: row.status as LectureStatus,
    createdAt: row.createdAt.toISOString(),
    sections: sectionRows.map((s) => ({
      id: s.id,
      lectureId: s.lectureId,
      order: s.order,
      heading: s.heading,
      body: s.body,
    })),
    citations: citationRows.map((c) => ({
      id: c.id,
      lectureId: c.lectureId,
      title: c.title,
      url: c.url,
    })),
  };
}

export async function getLectureByTopic(topicId: string): Promise<Lecture | null> {
  const row = (
    await getDb().select().from(lectures).where(eq(lectures.topicId, topicId))
  )[0];

  if (!row) {
    return null;
  }

  return rowToLecture(row);
}

export async function startGeneratingLecture(
  topicId: string,
  title: string,
): Promise<Lecture> {
  const db = getDb();

  const rows = await db
    .insert(lectures)
    .values({ id: newId("lec"), topicId, title, status: "generating" })
    .onConflictDoUpdate({
      target: lectures.topicId,
      set: { title, status: "generating", updatedAt: new Date() },
    })
    .returning();

  return rowToLecture(rows[0]!);
}

export async function replaceLectureContent(
  topicId: string,
  plan: LecturePlanContent,
): Promise<void> {
  await getDb().transaction(async (db) => {
    const existing = (
      await db.select().from(lectures).where(eq(lectures.topicId, topicId))
    )[0];

    if (!existing) {
      throw new Error("lecture not found for topic");
    }

    await db.delete(lectureSections).where(eq(lectureSections.lectureId, existing.id));
    await db.delete(lectureCitations).where(eq(lectureCitations.lectureId, existing.id));

    if (plan.sections.length > 0) {
      await db.insert(lectureSections).values(
        plan.sections.map((section, index) => ({
          id: newId("lsec"),
          lectureId: existing.id,
          order: index + 1,
          heading: section.heading,
          body: section.body,
        })),
      );
    }

    if (plan.citations.length > 0) {
      await db.insert(lectureCitations).values(
        plan.citations.map((citation) => ({
          id: newId("lcit"),
          lectureId: existing.id,
          title: citation.title,
          url: citation.url,
        })),
      );
    }

    await db
      .update(lectures)
      .set({ title: plan.title, status: "ready" })
      .where(eq(lectures.id, existing.id));
  });
}

export async function setLectureStatus(
  topicId: string,
  status: LectureStatus,
): Promise<void> {
  await getDb()
    .update(lectures)
    .set({ status, updatedAt: new Date() })
    .where(eq(lectures.topicId, topicId));
}

export async function failStaleGeneratingLectures(
  topicId: string,
  olderThanMs: number = GENERATING_STALE_AFTER_MS,
): Promise<number> {
  const now = Date.now();
  const rows = await getDb()
    .update(lectures)
    .set({ status: "failed", updatedAt: new Date(now) })
    .where(
      and(
        eq(lectures.topicId, topicId),
        eq(lectures.status, "generating"),
        lt(lectures.updatedAt, new Date(now - olderThanMs)),
      ),
    )
    .returning({ id: lectures.id });

  return rows.length;
}

export async function deleteLectureForTopic(
  topicId: string,
  db: DbExecutor = getDb(),
): Promise<void> {
  const existing = (
    await db.select().from(lectures).where(eq(lectures.topicId, topicId))
  )[0];

  if (!existing) {
    return;
  }

  await db.delete(lectureSections).where(eq(lectureSections.lectureId, existing.id));
  await db.delete(lectureCitations).where(eq(lectureCitations.lectureId, existing.id));
  await db.delete(lectures).where(eq(lectures.id, existing.id));
}
