import { desc, eq } from "drizzle-orm";
import type { Verdict, WritingCheck } from "@post-anki/shared";
import { getDb } from "../db/client.js";
import { writingChecks } from "../db/schema.js";

export type WritingCheckSelectRow = typeof writingChecks.$inferSelect;

export interface NewWritingCheck {
  id: string;
  subjectId: string;
  text: string;
  score: number;
  verdict: Verdict;
  feedback: string;
  nativeAlternatives: string[];
}

export function toWritingCheck(row: WritingCheckSelectRow): WritingCheck {
  return {
    id: row.id,
    subjectId: row.subjectId,
    text: row.text,
    score: row.score,
    verdict: row.verdict as Verdict,
    feedback: row.feedback,
    nativeAlternatives: row.nativeAlternatives,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function insertWritingCheck(row: NewWritingCheck): Promise<WritingCheck> {
  const [inserted] = await getDb().insert(writingChecks).values(row).returning();

  if (!inserted) {
    throw new Error("writing check insert returned no row");
  }

  return toWritingCheck(inserted);
}

export async function getWritingChecksForSubject(subjectId: string): Promise<WritingCheck[]> {
  const rows = await getDb()
    .select()
    .from(writingChecks)
    .where(eq(writingChecks.subjectId, subjectId))
    .orderBy(desc(writingChecks.createdAt));

  return rows.map(toWritingCheck);
}
