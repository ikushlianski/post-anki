import { eq, inArray } from "drizzle-orm";
import { resolveFetchState } from "@post-anki/core";
import type { LibrarySource, RefetchOutcome } from "@post-anki/shared";
import { getDb } from "../db/client.js";
import { curricula, sources, subjects } from "../db/schema.js";

// SCENARIO 1: a single joined query (curriculum name + subject name), no
// per-row follow-up call. innerJoin on both curricula and subjects —
// SCENARIO 1's "an orphaned curriculumId is excluded rather than crashing
// the listing" is exactly what an inner join gives for free, since a
// sources row can never legitimately reference a missing curriculum
// (cascade-deleted with it) or a curriculum missing its subject.
export async function listLibrarySources(): Promise<LibrarySource[]> {
  const rows = await getDb()
    .select({
      id: sources.id,
      curriculumId: sources.curriculumId,
      curriculumName: curricula.name,
      subjectId: subjects.id,
      subjectName: subjects.name,
      kind: sources.kind,
      value: sources.value,
      title: sources.title,
      fetchedText: sources.fetchedText,
      lastFetchedAt: sources.lastFetchedAt,
      lastFetchOutcome: sources.lastFetchOutcome,
      createdAt: sources.createdAt,
    })
    .from(sources)
    .innerJoin(curricula, eq(sources.curriculumId, curricula.id))
    .innerJoin(subjects, eq(curricula.subjectId, subjects.id));

  return rows.map((row) => {
    const lastFetchedAt = row.lastFetchedAt ? row.lastFetchedAt.toISOString() : null;

    return {
      id: row.id,
      curriculumId: row.curriculumId,
      curriculumName: row.curriculumName,
      subjectId: row.subjectId,
      subjectName: row.subjectName,
      kind: row.kind,
      value: row.value,
      title: row.title,
      fetchState: resolveFetchState({
        fetchedText: row.fetchedText,
        lastFetchedAt,
        lastFetchOutcome: row.lastFetchOutcome,
      }),
      lastFetchedAt,
      lastFetchOutcome: row.lastFetchOutcome,
      createdAt: row.createdAt.toISOString(),
    };
  });
}

export interface SourceForRefetch {
  id: string;
  kind: string;
  value: string;
}

export async function getSourceForRefetch(sourceId: string): Promise<SourceForRefetch | null> {
  const row = (
    await getDb()
      .select({ id: sources.id, kind: sources.kind, value: sources.value })
      .from(sources)
      .where(eq(sources.id, sourceId))
  )[0];

  return row ?? null;
}

export interface WriteRefetchResultParams {
  outcome: RefetchOutcome;
  fetchedAt: Date;
  fetchedText: string | null;
}

// SCENARIO 7: fetchedText is only included in the SET clause when the
// caller passes a non-null value — content-library.service.ts only ever
// passes one when outcome is "ok". lastFetchedAt/lastFetchOutcome are
// written unconditionally, on every attempt, success or failure.
export async function writeRefetchResult(
  sourceId: string,
  params: WriteRefetchResultParams,
): Promise<void> {
  await getDb()
    .update(sources)
    .set({
      lastFetchedAt: params.fetchedAt,
      lastFetchOutcome: params.outcome,
      ...(params.fetchedText !== null ? { fetchedText: params.fetchedText } : {}),
    })
    .where(eq(sources.id, sourceId));
}

export interface SourceForDuplicateScan {
  id: string;
  kind: string;
  value: string;
  title: string | null;
  fetchedText: string | null;
  embedding: number[] | null;
  embeddingHash: string | null;
}

// source-duplicate.orchestrator.ts's only read of the sources table.
// Scoped to link/text kinds (the scope boundary this module shares with
// re-fetch and with learning-list-intake's own capture scope — video
// sources keep their pasted description as the source of truth, never
// compared or re-fetched).
export async function listSourcesForDuplicateScan(): Promise<SourceForDuplicateScan[]> {
  return getDb()
    .select({
      id: sources.id,
      kind: sources.kind,
      value: sources.value,
      title: sources.title,
      fetchedText: sources.fetchedText,
      embedding: sources.embedding,
      embeddingHash: sources.embeddingHash,
    })
    .from(sources)
    .where(inArray(sources.kind, ["link", "text"]));
}

export async function updateSourceEmbedding(
  sourceId: string,
  embedding: number[],
  hash: string,
): Promise<void> {
  await getDb()
    .update(sources)
    .set({ embedding, embeddingHash: hash, embeddedAt: new Date() })
    .where(eq(sources.id, sourceId));
}
