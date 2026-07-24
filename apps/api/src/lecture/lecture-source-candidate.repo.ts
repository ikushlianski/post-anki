import { desc, eq, inArray } from "drizzle-orm";
import type { LectureSourceCandidate } from "@post-anki/shared";
import { getDb } from "../db/client.js";
import { lectureSourceCandidates } from "../db/schema.js";
import { newId } from "../shared/id.js";
import { partitionRegatherableCandidates, type ExtractedCandidate } from "./lecture-rules.js";

function rowToCandidate(
  row: typeof lectureSourceCandidates.$inferSelect,
): LectureSourceCandidate {
  return {
    id: row.id,
    topicId: row.topicId,
    title: row.title,
    url: row.url,
    whySelected: row.whySelected,
    reviewStatus: row.reviewStatus as LectureSourceCandidate["reviewStatus"],
    createdAt: row.createdAt.toISOString(),
  };
}

export async function clearRegatherableCandidates(topicId: string): Promise<void> {
  const db = getDb();

  const existing = await db
    .select()
    .from(lectureSourceCandidates)
    .where(eq(lectureSourceCandidates.topicId, topicId));

  const { toDelete } = partitionRegatherableCandidates(
    existing.map((row) => ({
      id: row.id,
      reviewStatus: row.reviewStatus as LectureSourceCandidate["reviewStatus"],
    })),
  );

  if (toDelete.length === 0) {
    return;
  }

  await db.delete(lectureSourceCandidates).where(
    inArray(
      lectureSourceCandidates.id,
      toDelete.map((row) => row.id),
    ),
  );
}

export async function insertLectureSourceCandidates(
  topicId: string,
  candidates: ExtractedCandidate[],
): Promise<LectureSourceCandidate[]> {
  if (candidates.length === 0) {
    return [];
  }

  const rows = candidates.map((candidate) => ({
    id: newId("lsc"),
    topicId,
    title: candidate.title,
    url: candidate.url,
    whySelected: candidate.whySelected,
    reviewStatus: "pending" as const,
    fetchedText: null,
  }));

  await getDb().insert(lectureSourceCandidates).values(rows);

  return rows.map((row) => ({
    id: row.id,
    topicId: row.topicId,
    title: row.title,
    url: row.url,
    whySelected: row.whySelected,
    reviewStatus: row.reviewStatus,
    createdAt: new Date().toISOString(),
  }));
}

export async function listLectureSourceCandidates(
  topicId: string,
): Promise<LectureSourceCandidate[]> {
  const rows = await getDb()
    .select()
    .from(lectureSourceCandidates)
    .where(eq(lectureSourceCandidates.topicId, topicId))
    .orderBy(desc(lectureSourceCandidates.createdAt));

  return rows.map(rowToCandidate);
}

export interface ApprovedCandidateForCompile {
  id: string;
  title: string;
  url: string;
  fetchedText: string | null;
}

export async function listApprovedCandidatesForCompile(
  topicId: string,
): Promise<ApprovedCandidateForCompile[]> {
  const rows = await getDb()
    .select()
    .from(lectureSourceCandidates)
    .where(eq(lectureSourceCandidates.topicId, topicId));

  return rows
    .filter((row) => row.reviewStatus === "approved")
    .map((row) => ({
      id: row.id,
      title: row.title,
      url: row.url,
      fetchedText: row.fetchedText,
    }));
}

export async function updateCandidateReviewStatus(
  candidateId: string,
  reviewStatus: "approved" | "rejected",
): Promise<LectureSourceCandidate | null> {
  const db = getDb();

  const existing = (
    await db
      .select()
      .from(lectureSourceCandidates)
      .where(eq(lectureSourceCandidates.id, candidateId))
  )[0];

  if (!existing) {
    return null;
  }

  await db
    .update(lectureSourceCandidates)
    .set({ reviewStatus })
    .where(eq(lectureSourceCandidates.id, candidateId));

  return rowToCandidate({ ...existing, reviewStatus });
}

export async function storeCandidateFetchedText(
  candidateId: string,
  text: string,
): Promise<void> {
  await getDb()
    .update(lectureSourceCandidates)
    .set({ fetchedText: text })
    .where(eq(lectureSourceCandidates.id, candidateId));
}

export async function deleteLectureSourceCandidatesForTopic(
  topicId: string,
): Promise<void> {
  await getDb()
    .delete(lectureSourceCandidates)
    .where(eq(lectureSourceCandidates.topicId, topicId));
}
