import { hasClozeMarkup, importedFactText } from "./knowledge-bit-import-facts.js";
import { chunkSourceText, chunkSourceTextWithOffsets } from "./knowledge-bit-source-chunking.js";
import { planFocusedChunks, type FocusedChunk } from "./knowledge-bit-focus.js";
import { CHUNK_MAX_CHARS } from "./detect-knowledge-bits.orchestrator.js";
import type { DurableStepDeps } from "./durable-extraction.steps.js";

type PlanDeps = Pick<DurableStepDeps, "loadRawText" | "loadIsAnkiImport" | "loadHighlights">;

export type PlannedChunk =
  | { status: "ready"; entry: FocusedChunk }
  | { status: "deliberate_empty" }
  | { status: "missing" };

export async function isClozeShaped(sourceId: string, rawText: string | null, deps: PlanDeps): Promise<boolean> {
  return Boolean(await deps.loadIsAnkiImport?.(sourceId)) || (rawText !== null && hasClozeMarkup(rawText));
}

export async function loadSourceText(sourceId: string, deps: PlanDeps): Promise<string | null> {
  const rawText = await deps.loadRawText(sourceId);

  return rawText && (await isClozeShaped(sourceId, rawText, deps)) ? importedFactText(rawText) : rawText;
}

export async function planChunk(sourceId: string, index: number, deps: PlanDeps): Promise<PlannedChunk> {
  const rawText = await loadSourceText(sourceId, deps);
  const highlights = await deps.loadHighlights?.(sourceId);
  const planned = rawText
    ? planFocusedChunks(chunkSourceTextWithOffsets(rawText, CHUNK_MAX_CHARS), highlights)
    : [];
  const entry = planned.find((candidate) => candidate.index === index);

  if (entry !== undefined) {
    return { status: "ready", entry };
  }

  const total = rawText ? chunkSourceText(rawText, CHUNK_MAX_CHARS).length : 0;

  return index < total && highlights && highlights.length > 0 ? { status: "deliberate_empty" } : { status: "missing" };
}
