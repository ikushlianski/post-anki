import { and, desc, eq, inArray } from "drizzle-orm";
import type { CreateStudySessionInput, StudySession, StudySessionStatus } from "@post-anki/shared";
import { recordSessionAnswer } from "@post-anki/core";
import { getDb } from "../db/client.js";
import { curriculumDomainNodeMappings, studySessions } from "../db/schema.js";
import { newId } from "../shared/id.js";

type StudySessionRow = typeof studySessions.$inferSelect;

function toStudySession(row: StudySessionRow): StudySession {
  return {
    id: row.id,
    targetType: (row.targetType as StudySession["targetType"]) ?? null,
    targetId: row.targetId,
    plannedDurationMinutes: row.plannedDurationMinutes,
    scheduledFor: row.scheduledFor ? row.scheduledFor.toISOString() : null,
    status: row.status as StudySessionStatus,
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    questionsAnswered: row.questionsAnswered,
    questionsCorrect: row.questionsCorrect,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function insertStudySession(
  input: CreateStudySessionInput,
): Promise<StudySession> {
  const row = (
    await getDb()
      .insert(studySessions)
      .values({
        id: newId("study"),
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        plannedDurationMinutes: input.plannedDurationMinutes,
        scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : null,
        status: "planned",
      })
      .returning()
  )[0]!;

  return toStudySession(row);
}

export async function getStudySession(id: string): Promise<StudySession | null> {
  const row = (
    await getDb().select().from(studySessions).where(eq(studySessions.id, id))
  )[0];

  return row ? toStudySession(row) : null;
}

export async function listStudySessions(): Promise<StudySession[]> {
  const rows = await getDb().select().from(studySessions).orderBy(desc(studySessions.createdAt));

  return rows.map(toStudySession);
}

export async function startStudySession(
  id: string,
  now: Date,
): Promise<StudySession | null> {
  const row = (
    await getDb()
      .update(studySessions)
      .set({ status: "in_progress", startedAt: now })
      .where(eq(studySessions.id, id))
      .returning()
  )[0];

  return row ? toStudySession(row) : null;
}

export async function endStudySession(
  id: string,
  now: Date,
): Promise<StudySession | null> {
  const existing = (
    await getDb().select().from(studySessions).where(eq(studySessions.id, id))
  )[0];

  if (!existing) {
    return null;
  }

  const status: StudySessionStatus = existing.questionsAnswered > 0 ? "completed" : "abandoned";

  const row = (
    await getDb()
      .update(studySessions)
      .set({ status, completedAt: now })
      .where(eq(studySessions.id, id))
      .returning()
  )[0]!;

  return toStudySession(row);
}

export async function recordStudySessionAnswer(
  id: string,
  correct: boolean,
): Promise<StudySession | null> {
  const existing = (
    await getDb().select().from(studySessions).where(eq(studySessions.id, id))
  )[0];

  if (!existing) {
    return null;
  }

  const next = recordSessionAnswer(
    {
      questionsAnswered: existing.questionsAnswered,
      questionsCorrect: existing.questionsCorrect,
    },
    correct,
  );

  const row = (
    await getDb()
      .update(studySessions)
      .set(next)
      .where(eq(studySessions.id, id))
      .returning()
  )[0]!;

  return toStudySession(row);
}

export async function listSessionsForConsistency(): Promise<
  { status: string; scheduledFor: string | null; completedAt: string | null }[]
> {
  const rows = await getDb()
    .select({
      status: studySessions.status,
      scheduledFor: studySessions.scheduledFor,
      completedAt: studySessions.completedAt,
    })
    .from(studySessions);

  return rows.map((row) => ({
    status: row.status,
    scheduledFor: row.scheduledFor ? row.scheduledFor.toISOString() : null,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
  }));
}

export async function resolveCurriculumIdsForDomainNodeIds(
  domainNodeIds: string[],
): Promise<string[]> {
  if (domainNodeIds.length === 0) {
    return [];
  }

  const rows = await getDb()
    .select({ curriculumId: curriculumDomainNodeMappings.curriculumId })
    .from(curriculumDomainNodeMappings)
    .where(
      and(
        inArray(curriculumDomainNodeMappings.domainNodeId, domainNodeIds),
        eq(curriculumDomainNodeMappings.status, "confirmed"),
      ),
    );

  return [...new Set(rows.map((row) => row.curriculumId))];
}
