import { randomUUID } from "node:crypto";
import { Mastra } from "@mastra/core";
import { z } from "zod";
import { runExperiment } from "@mastra/core/datasets";
import { InMemoryStore } from "@mastra/core/storage";
import {
  KNOWLEDGE_ITEM_MODELS,
  knowledgeItemModelIdSchema,
  resolveUsableKnowledgeItemModelId,
  type CompareModelsInput,
  type ModelComparisonModelResult,
  type ModelComparisonRunResult,
} from "@post-anki/shared";
import type { ReportedUsage } from "../mastra/generate-usage.js";
import { runKnowledgeBitSourceItems } from "../mastra/knowledge-bit-source-items.agent.js";
import { chunkSourceText } from "../knowledge-bit/knowledge-bit-source-chunking.js";
import {
  validateSourceItems,
  type SourceItemDraft,
} from "../knowledge-bit/knowledge-bit-source-item-validation.js";

export const MODEL_COMPARISON_ITEM_TIMEOUT_MS = 120_000;
const MODEL_COMPARISON_CONCURRENCY = 3;

const experimentItemInput = z.object({ modelId: z.string(), excerpt: z.string() });
const modelResultOutput = z.custom<ModelComparisonModelResult>(
  (value) => typeof value === "object" && value !== null && "modelId" in value && "status" in value,
);

export type ExtractChunk = (
  chunk: string,
  modelId: string,
  signal?: AbortSignal,
  onUsage?: (usage: ReportedUsage) => void,
) => Promise<SourceItemDraft[]>;

const defaultExtractChunk: ExtractChunk = (chunk, modelId, signal, onUsage) =>
  runKnowledgeBitSourceItems(chunk, { modelId, abortSignal: signal, onUsage });

interface UsageTotals {
  inputTokens: number;
  outputTokens: number;
  everyChunkReported: boolean;
}

function actualCostFor(modelId: string, totals: UsageTotals): number | null {
  const parsed = knowledgeItemModelIdSchema.safeParse(modelId);

  if (!totals.everyChunkReported || !parsed.success) {
    return null;
  }

  const model = KNOWLEDGE_ITEM_MODELS[parsed.data];

  return (totals.inputTokens * model.inputPerMillion + totals.outputTokens * model.outputPerMillion) / 1_000_000;
}

function errorMessage(err: unknown): string {
  return (err instanceof Error ? err.message : "unknown_error").slice(0, 200);
}

export async function extractForModel(
  excerpt: string,
  modelId: string,
  extractChunk: ExtractChunk,
  signal?: AbortSignal,
): Promise<ModelComparisonModelResult> {
  const started = Date.now();

  try {
    const cards: ModelComparisonModelResult["cards"] = [];
    const dropped: string[] = [];
    let returned = 0;
    const totals: UsageTotals = { inputTokens: 0, outputTokens: 0, everyChunkReported: true };

    for (const chunk of chunkSourceText(excerpt)) {
      signal?.throwIfAborted();

      const captured: { usage: ReportedUsage | null } = { usage: null };
      const drafts = await extractChunk(chunk, modelId, signal, (usage) => {
        captured.usage = usage;
      });
      const usage = captured.usage;

      if (usage !== null && usage.inputTokens !== null && usage.outputTokens !== null) {
        totals.inputTokens += usage.inputTokens;
        totals.outputTokens += usage.outputTokens;
      } else {
        totals.everyChunkReported = false;
      }

      const checked = validateSourceItems(drafts, chunk);

      returned += drafts.length;
      cards.push(...checked.valid);
      dropped.push(...checked.dropped);
    }

    return {
      modelId,
      status: "ok",
      ms: Date.now() - started,
      returned,
      cards,
      dropped,
      error: null,
      inputTokens: totals.everyChunkReported ? totals.inputTokens : null,
      outputTokens: totals.everyChunkReported ? totals.outputTokens : null,
      actualCostUsd: actualCostFor(modelId, totals),
    };
  } catch (err) {
    return {
      modelId,
      status: "failed",
      ms: Date.now() - started,
      returned: 0,
      cards: [],
      dropped: [],
      error: errorMessage(err),
      inputTokens: null,
      outputTokens: null,
      actualCostUsd: null,
    };
  }
}

export async function runModelComparison(
  input: CompareModelsInput,
  extractChunk: ExtractChunk = defaultExtractChunk,
): Promise<ModelComparisonRunResult> {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const usable = input.modelIds.filter((id) => resolveUsableKnowledgeItemModelId(id) !== null);
  const mastra = new Mastra({ storage: new InMemoryStore() });

  const summary = await runExperiment(mastra, {
    name: `model-comparison-${runId}`,
    data: usable.map((modelId) => ({ id: modelId, input: { modelId, excerpt: input.excerpt } })),
    task: ({ input: raw, signal }) => {
      const item = experimentItemInput.parse(raw);

      return extractForModel(item.excerpt, item.modelId, extractChunk, signal);
    },
    maxConcurrency: MODEL_COMPARISON_CONCURRENCY,
    itemTimeout: MODEL_COMPARISON_ITEM_TIMEOUT_MS,
  });

  const byModel = new Map<string, ModelComparisonModelResult>();

  for (const item of summary.results) {
    const parsed = modelResultOutput.safeParse(item.output);

    byModel.set(
      item.itemId,
      parsed.success ? parsed.data : {
        modelId: item.itemId,
        status: "failed",
        ms: 0,
        returned: 0,
        cards: [],
        dropped: [],
        error: item.error?.message?.slice(0, 200) ?? "no_result",
        inputTokens: null,
        outputTokens: null,
        actualCostUsd: null,
      },
    );
  }

  const results = input.modelIds.map(
    (modelId) =>
      byModel.get(modelId) ?? {
        modelId,
        status: "failed" as const,
        ms: 0,
        returned: 0,
        cards: [],
        dropped: [],
        error: "model_unavailable",
        inputTokens: null,
        outputTokens: null,
        actualCostUsd: null,
      },
  );

  return { runId, startedAt, results };
}
