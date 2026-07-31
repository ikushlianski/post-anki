import {
  buildSubjectContentText,
  findDuplicatePairs,
  hashSubjectContent,
  selectSubjectsForScan,
  type EmbeddedSubject,
} from "@post-anki/core";
import type { SubjectDuplicateSuggestion, TriggerSubjectDuplicateScanResult } from "@post-anki/shared";
import { startTracingSpan } from "../mastra/mastra.js";
import {
  listArchitectureMentorSubjectsForDuplicateScan,
  updateSubjectEmbedding,
  type SubjectForDuplicateScan,
} from "../subject/subject.repo.js";
import { embedSubjectTexts } from "./embeddings-client.js";
import { insertDuplicateSuggestionIfNew } from "./subject-duplicate.repo.js";

// Decision #3 (spec.md) — bounds only the paid embedding call this run,
// never the comparison step below (architecture.md's "Cap bounds the
// embedding call only, never the comparison").
const EMBEDDING_CAP = 200;

function contentHashFor(subject: Pick<SubjectForDuplicateScan, "name" | "description">): string {
  return hashSubjectContent(subject.name, subject.description ?? undefined);
}

// Scan mechanism (spec.md's Implementation order step 9): selects the
// capped subset needing a fresh embedding, embeds only that subset, writes
// each fresh embedding+hash back onto its subject row, then compares EVERY
// architecture-mentor subject that now has any cached embedding (freshly
// embedded this run OR already cached — never a union of just those two
// buckets, but a re-derivation from the original read merged with this
// run's fresh results, so a stale subject cut off by the cap still
// contributes its OLD, still-valid embedding to the comparison instead of
// being silently dropped). SCENARIO 9: the whole call is one tracing span
// recording subjects considered, embedded, reused, and pairs surfaced.
export async function triggerSubjectDuplicateScan(): Promise<TriggerSubjectDuplicateScanResult> {
  const span = startTracingSpan("subject_duplicate.scan", {});

  try {
    const subjectRows = await listArchitectureMentorSubjectsForDuplicateScan();

    const scanCandidates = subjectRows.map((row) => ({
      id: row.id,
      contentHash: contentHashFor(row),
      cachedHash: row.embeddingHash,
    }));

    const { toEmbed, reused, capped } = selectSubjectsForScan(scanCandidates, EMBEDDING_CAP);

    const subjectsById = new Map(subjectRows.map((row) => [row.id, row]));

    let freshlyEmbedded: { id: string; embedding: number[] }[] = [];

    if (toEmbed.length > 0) {
      const toEmbedItems = toEmbed.map((id) => {
        const subject = subjectsById.get(id)!;

        return { id, text: buildSubjectContentText(subject.name, subject.description ?? undefined) };
      });

      freshlyEmbedded = await embedSubjectTexts(toEmbedItems);

      // No embedding/hash is written for any subject whose call failed —
      // embedSubjectTexts either returns a result for every requested
      // subject or throws (SCENARIO 6's "no partial/corrupt cache write").
      for (const result of freshlyEmbedded) {
        const subject = subjectsById.get(result.id)!;

        await updateSubjectEmbedding(result.id, result.embedding, contentHashFor(subject));
      }
    }

    const freshlyEmbeddedById = new Map(freshlyEmbedded.map((r) => [r.id, r.embedding]));

    // The comparison set: every subject with ANY cached embedding after
    // this run's writes — reused subjects keep their original (still
    // valid) embedding from the initial read, freshly embedded subjects
    // use the new vector just returned, and a stale-but-cap-excluded
    // subject still contributes its OLD embedding rather than being
    // dropped from comparison entirely.
    const embeddedSubjects: EmbeddedSubject[] = [];

    for (const row of subjectRows) {
      const embedding = freshlyEmbeddedById.get(row.id) ?? row.embedding;

      if (embedding) {
        embeddedSubjects.push({ id: row.id, embedding });
      }
    }

    const pairs = findDuplicatePairs(embeddedSubjects);

    const suggestions: SubjectDuplicateSuggestion[] = [];

    for (const pair of pairs) {
      const inserted = await insertDuplicateSuggestionIfNew({
        subjectXId: pair.subjectAId,
        subjectYId: pair.subjectBId,
        similarity: pair.similarity,
        reason: `similarity ${pair.similarity.toFixed(2)} between name+description embeddings`,
      });

      if (inserted) {
        suggestions.push(inserted);
      }
    }

    const result: TriggerSubjectDuplicateScanResult = {
      suggestions,
      embeddedCount: toEmbed.length,
      reusedCount: reused.length,
      capped,
    };

    span?.end({
      output: {
        considered: subjectRows.length,
        embeddedCount: result.embeddedCount,
        reusedCount: result.reusedCount,
        capped: result.capped,
        pairsSurfaced: pairs.length,
        suggestionsInserted: suggestions.length,
      },
    });

    return result;
  } catch (err) {
    span?.error({ error: err instanceof Error ? err : new Error(String(err)) });

    throw err;
  }
}
