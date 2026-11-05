import { FUSION_MAX_MODELS } from "@post-anki/shared";
import { log } from "../shared/log.js";
import { mapWithConcurrency } from "../shared/map-with-concurrency.js";
import type { ChunkCards } from "./detect-knowledge-bits-chunk.js";
import { normalizeStatement, type LessonDraft } from "./knowledge-bit-source-item-validation.js";

export interface ModelChunkCards {
  modelId: string;
  cards: ChunkCards;
}

function groupLessons<T>(
  entries: readonly { modelId: string; items: readonly T[] }[],
  lessonOf: (item: T) => LessonDraft,
  withModelIds: (item: T, modelIds: string[]) => T,
): T[] {
  const groups = new Map<string, { item: T; modelIds: string[] }>();

  for (const { modelId, items } of entries) {
    for (const item of items) {
      const key = normalizeStatement(lessonOf(item).statement);
      const group = groups.get(key);

      if (!group) {
        groups.set(key, { item, modelIds: [modelId] });
      } else if (!group.modelIds.includes(modelId)) {
        group.modelIds.push(modelId);
      }
    }
  }

  return [...groups.values()].map(({ item, modelIds }) => withModelIds(item, modelIds));
}

export function groupFusionCards(results: readonly ModelChunkCards[]): ChunkCards {
  const valid = groupLessons(
    results.map((r) => ({ modelId: r.modelId, items: r.cards.valid })),
    (lesson) => lesson,
    (lesson, modelIds) => ({ ...lesson, modelIds }),
  );
  const flagged = groupLessons(
    results.map((r) => ({ modelId: r.modelId, items: r.cards.flagged })),
    (entry) => entry.lesson,
    (entry, modelIds) => ({ ...entry, lesson: { ...entry.lesson, modelIds } }),
  );
  const deliberateEmpty =
    valid.length === 0 && flagged.length === 0 && results.every((r) => r.cards.deliberateEmpty === true);

  const gapText = results.find((r) => r.cards.gapText)?.cards.gapText;

  return {
    valid,
    flagged,
    ...(deliberateEmpty ? { deliberateEmpty: true } : {}),
    ...(gapText ? { gapText } : {}),
  };
}

export async function runFusion(
  modelIds: readonly string[],
  runOne: (modelId: string) => Promise<ChunkCards>,
): Promise<ChunkCards> {
  const models = [...new Set(modelIds)].slice(0, FUSION_MAX_MODELS);
  const settled = await mapWithConcurrency(models, FUSION_MAX_MODELS, runOne);
  const results: ModelChunkCards[] = [];
  let firstFailure: unknown = null;

  for (const [index, outcome] of settled.entries()) {
    const modelId = models[index] as string;

    if (outcome.status === "fulfilled") {
      results.push({ modelId, cards: outcome.value });
      continue;
    }

    firstFailure ??= outcome.reason;
    log.warn({ err: outcome.reason, modelId }, "knowledge_bit_fusion_model_failed");
  }

  if (results.length === 0) {
    throw firstFailure;
  }

  return groupFusionCards(results);
}
