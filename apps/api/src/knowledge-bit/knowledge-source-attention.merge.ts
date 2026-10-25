import type { KnowledgeSourceAttention, PendingKnowledgeSourceForReview } from "@post-anki/shared";

export function mergeAttentionIntoSources(
  sources: PendingKnowledgeSourceForReview[],
  attention: KnowledgeSourceAttention[],
): PendingKnowledgeSourceForReview[] {
  const byId = new Map(attention.map((entry) => [entry.knowledgeSourceId, entry]));
  const used = new Set<string>();
  const merged = sources.map((source) => {
    const entry = byId.get(source.knowledgeSourceId);

    if (!entry) {
      return source;
    }

    used.add(entry.knowledgeSourceId);

    return { ...source, attention: entry };
  });

  const standalone: PendingKnowledgeSourceForReview[] = attention
    .filter((entry) => !used.has(entry.knowledgeSourceId))
    .map((entry) => ({
      knowledgeSourceId: entry.knowledgeSourceId,
      sourceText: entry.sourceText,
      subjectName: null,
      bits: [],
      attention: entry,
    }));

  return [...standalone, ...merged];
}
