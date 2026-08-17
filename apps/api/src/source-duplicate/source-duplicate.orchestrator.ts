import {
  buildSourceContentText,
  findDuplicatePairs,
  findExactUrlDuplicates,
  hashSourceContent,
  normalizeSourceUrl,
  selectSubjectsForScan,
  type EmbeddedSubject,
} from "@post-anki/core";
import type { SourceDuplicateSuggestion, TriggerSourceDuplicateScanResult } from "@post-anki/shared";
import {
  listSourcesForDuplicateScan,
  updateSourceEmbedding,
  type SourceForDuplicateScan,
} from "../content-library/content-library.repo.js";
import { startTracingSpan } from "../mastra/mastra.js";
import { embedSourceTexts } from "./embeddings-client.js";
import { insertSourceDuplicateSuggestionIfNew } from "./source-duplicate.repo.js";

// Bounds only the paid embedding call (Scenario 4's tier), never the
// exact-URL tier (Scenario 3, always runs, free) or the comparison step
// once embeddings exist — same "cap bounds the embedding call only" rule
// subject-duplicate already established. Same default as that module's own
// cap; sources have no separate volume signal yet to justify a different
// number.
const EMBEDDING_CAP = 200;

function contentHashFor(source: Pick<SourceForDuplicateScan, "title" | "fetchedText">): string {
  return hashSourceContent(source.title, source.fetchedText);
}

// SCENARIO 1's mermaid diagram: one "scan for duplicates" action runs BOTH
// tiers every time — tier 1 (exact URL) unconditionally, since it costs
// nothing; tier 2 (embedding similarity) capped. Persisting suggestions
// only happens here, never from the plain GET /sources listing read — a
// GET must never mutate state, and a source's exact-URL duplicate status is
// visible to review through this table exactly like an embedding match, not
// as a separate ephemeral flag on the listing.
export async function triggerSourceDuplicateScan(): Promise<TriggerSourceDuplicateScanResult> {
  const span = startTracingSpan("source_duplicate.scan", {});

  try {
    const sourceRows = await listSourcesForDuplicateScan();
    const sourcesById = new Map(sourceRows.map((row) => [row.id, row]));

    const suggestions: SourceDuplicateSuggestion[] = [];

    const urlRefs = sourceRows
      .filter((row) => row.kind === "link")
      .map((row) => ({ id: row.id, normalizedUrl: normalizeSourceUrl(row.value) }));
    const urlPairs = findExactUrlDuplicates(urlRefs);

    for (const pair of urlPairs) {
      const inserted = await insertSourceDuplicateSuggestionIfNew({
        sourceXId: pair.sourceAId,
        sourceYId: pair.sourceBId,
        similarity: null,
        matchKind: "url_match",
        reason: `sources normalize to the same URL (${pair.normalizedUrl})`,
      });

      if (inserted) {
        suggestions.push(inserted);
      }
    }

    // A source with no fetchedText yet (never fetched, or a text source
    // with only a title) has no real content to compare — embedding it
    // would spend the cap on a near-empty string, and every such source
    // would hash to the same near-empty content and falsely cluster as an
    // embedding-similarity duplicate of every other unfetched source. Only
    // sources with real body text are candidates for this tier; a source
    // still needing its first fetch can only ever surface via the exact-URL
    // tier above until it has content.
    const scanCandidates = sourceRows
      .filter((row) => (row.fetchedText ?? "").trim().length > 0)
      .map((row) => ({
        id: row.id,
        contentHash: contentHashFor(row),
        cachedHash: row.embeddingHash,
      }));

    const { toEmbed, reused, capped } = selectSubjectsForScan(scanCandidates, EMBEDDING_CAP);

    let freshlyEmbedded: { id: string; embedding: number[] }[] = [];

    if (toEmbed.length > 0) {
      const toEmbedItems = toEmbed.map((id) => {
        const source = sourcesById.get(id)!;

        return { id, text: buildSourceContentText(source.title, source.fetchedText) };
      });

      freshlyEmbedded = await embedSourceTexts(toEmbedItems);

      for (const result of freshlyEmbedded) {
        const source = sourcesById.get(result.id)!;

        await updateSourceEmbedding(result.id, result.embedding, contentHashFor(source));
      }
    }

    const freshlyEmbeddedById = new Map(freshlyEmbedded.map((r) => [r.id, r.embedding]));

    const embeddedSources: EmbeddedSubject[] = [];

    for (const row of sourceRows) {
      const embedding = freshlyEmbeddedById.get(row.id) ?? row.embedding;

      if (embedding) {
        embeddedSources.push({ id: row.id, embedding });
      }
    }

    const embeddingPairs = findDuplicatePairs(embeddedSources);

    for (const pair of embeddingPairs) {
      const inserted = await insertSourceDuplicateSuggestionIfNew({
        sourceXId: pair.subjectAId,
        sourceYId: pair.subjectBId,
        similarity: pair.similarity,
        matchKind: "embedding_similarity",
        reason: `similarity ${pair.similarity.toFixed(2)} between title+content embeddings`,
      });

      if (inserted) {
        suggestions.push(inserted);
      }
    }

    const result: TriggerSourceDuplicateScanResult = {
      suggestions,
      exactUrlPairsFound: urlPairs.length,
      embeddedCount: toEmbed.length,
      reusedCount: reused.length,
      capped,
    };

    span?.end({
      output: {
        considered: sourceRows.length,
        exactUrlPairsFound: result.exactUrlPairsFound,
        embeddedCount: result.embeddedCount,
        reusedCount: result.reusedCount,
        capped: result.capped,
        embeddingPairsSurfaced: embeddingPairs.length,
        suggestionsInserted: suggestions.length,
      },
    });

    return result;
  } catch (err) {
    span?.error({ error: err instanceof Error ? err : new Error(String(err)) });

    throw err;
  }
}
