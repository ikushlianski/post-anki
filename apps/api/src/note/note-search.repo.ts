import { and, eq, inArray, sql } from "drizzle-orm";
import type { Concern, Note } from "@post-anki/shared";
import { resolveNoteTaxonomySubtree } from "@post-anki/core";
import { getDb, type DbExecutor } from "../db/client.js";
import { curriculumDomainNodeMappings, domainNodes, gaps, notes, sources, topics } from "../db/schema.js";
import { rowToNote } from "./note.repo.js";

export interface SearchNotesParams {
  query: string;
  concern?: Concern;
  domainNodeId?: string;
}

export async function searchNotes(params: SearchNotesParams): Promise<Note[]> {
  const db = getDb();
  const conditions = [sql`${notes.searchVector} @@ plainto_tsquery('english', ${params.query})`];

  if (params.concern) {
    conditions.push(eq(notes.concern, params.concern));
  }

  const rows = await db
    .select()
    .from(notes)
    .where(and(...conditions))
    .orderBy(sql`ts_rank(${notes.searchVector}, plainto_tsquery('english', ${params.query})) DESC`);

  const results = rows.map(rowToNote);

  if (!params.domainNodeId) {
    return results;
  }

  const allowedIds = new Set(
    await resolveNotesInTaxonomySubtree(results, params.domainNodeId, db),
  );

  return results.filter((note) => allowedIds.has(note.id));
}

async function resolveNotesInTaxonomySubtree(
  candidateNotes: Note[],
  filterNodeId: string,
  db: DbExecutor,
): Promise<string[]> {
  const filterNodeRow = (
    await db.select().from(domainNodes).where(eq(domainNodes.id, filterNodeId))
  )[0];

  if (!filterNodeRow) {
    return [];
  }

  const topicNoteIds = candidateNotes.filter((n) => n.nodeType === "topic").map((n) => n.nodeId);
  const gapNoteIds = candidateNotes.filter((n) => n.nodeType === "gap").map((n) => n.nodeId);
  const sourceNoteIds = candidateNotes.filter((n) => n.nodeType === "source").map((n) => n.nodeId);

  const [subjectNodeRows, gapRows, sourceRows] = await Promise.all([
    db
      .select({ id: domainNodes.id, parentId: domainNodes.parentId })
      .from(domainNodes)
      .where(eq(domainNodes.subjectId, filterNodeRow.subjectId)),
    gapNoteIds.length
      ? db.select({ id: gaps.id, topicId: gaps.topicId }).from(gaps).where(inArray(gaps.id, gapNoteIds))
      : Promise.resolve([]),
    sourceNoteIds.length
      ? db
          .select({ id: sources.id, curriculumId: sources.curriculumId })
          .from(sources)
          .where(inArray(sources.id, sourceNoteIds))
      : Promise.resolve([]),
  ]);

  const allTopicIds = Array.from(new Set([...topicNoteIds, ...gapRows.map((g) => g.topicId)]));

  const topicRows = allTopicIds.length
    ? await db
        .select({ id: topics.id, curriculumId: topics.curriculumId })
        .from(topics)
        .where(inArray(topics.id, allTopicIds))
    : [];

  const curriculumIdByTopicId = new Map(topicRows.map((t) => [t.id, t.curriculumId]));
  const curriculumIdBySourceId = new Map(sourceRows.map((s) => [s.id, s.curriculumId]));
  const topicIdByGapId = new Map(gapRows.map((g) => [g.id, g.topicId]));

  function curriculumIdForNote(note: Note): string | undefined {
    if (note.nodeType === "topic") {
      return curriculumIdByTopicId.get(note.nodeId);
    }

    if (note.nodeType === "gap") {
      const topicId = topicIdByGapId.get(note.nodeId);

      return topicId ? curriculumIdByTopicId.get(topicId) : undefined;
    }

    return curriculumIdBySourceId.get(note.nodeId);
  }

  const curriculumIds = Array.from(
    new Set(
      candidateNotes
        .map((note) => curriculumIdForNote(note))
        .filter((id): id is string => Boolean(id)),
    ),
  );

  const mappingRows = curriculumIds.length
    ? await db
        .select({
          curriculumId: curriculumDomainNodeMappings.curriculumId,
          domainNodeId: curriculumDomainNodeMappings.domainNodeId,
        })
        .from(curriculumDomainNodeMappings)
        .where(
          and(
            inArray(curriculumDomainNodeMappings.curriculumId, curriculumIds),
            eq(curriculumDomainNodeMappings.status, "confirmed"),
          ),
        )
    : [];

  const domainNodeIdsByCurriculumId = new Map<string, string[]>();

  for (const row of mappingRows) {
    const list = domainNodeIdsByCurriculumId.get(row.curriculumId) ?? [];

    list.push(row.domainNodeId);
    domainNodeIdsByCurriculumId.set(row.curriculumId, list);
  }

  const candidates = candidateNotes.map((note) => ({
    noteId: note.id,
    domainNodeIds: domainNodeIdsByCurriculumId.get(curriculumIdForNote(note) ?? "") ?? [],
  }));

  const nodeRefs = subjectNodeRows.map((row) => ({ id: row.id, parentId: row.parentId }));

  return resolveNoteTaxonomySubtree(filterNodeId, nodeRefs, candidates);
}
