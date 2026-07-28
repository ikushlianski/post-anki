import type { GeneratedProbeQuestion, ProbeQuestionType } from "@post-anki/shared";
import {
  alignOptionExplanations,
  reindexOptions,
  reindexParallelArray,
} from "@post-anki/core";
import type { ProbeSessionQuestionInsert } from "./probe-session.repo.js";

export function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function identityPermutation(length: number): number[] {
  return Array.from({ length }, (_, i) => i);
}

export interface BuildRowsParams {
  sessionId: string;
  generated: GeneratedProbeQuestion[];
  defaultTopicId: string;
  topicIdByTitle: Map<string, string>;
  gapIdByKey: Map<string, string>;
  makeId: (index: number) => string;
  allowMultiSelect?: boolean;
  makePermutation?: (length: number) => number[];
  orderOffset?: number;
}

export function buildQuestionRows(
  params: BuildRowsParams,
): ProbeSessionQuestionInsert[] {
  const makePermutation = params.makePermutation ?? identityPermutation;
  const orderOffset = params.orderOffset ?? 0;

  return params.generated.map((q, index) => {
    const topicId =
      (q.topicTitle && params.topicIdByTitle.get(normalize(q.topicTitle))) ||
      params.defaultTopicId;

    const gapId =
      (q.gapLabel &&
        params.gapIdByKey.get(`${topicId}::${normalize(q.gapLabel)}`)) ||
      null;

    const options = q.options.length > 0 ? q.options : ["True", "False"];
    const { type, rawCorrectIndexes } = resolveCorrectIndexes(
      q,
      options.length,
      params.allowMultiSelect ?? false,
    );

    const permutation = makePermutation(options.length);
    const reindexed = reindexOptions(options, permutation, rawCorrectIndexes);
    const correctAnswerIndex = Math.min(...reindexed.correctIndexes);

    const aligned = alignOptionExplanations(options, q.optionExplanations ?? []);
    const optionExplanations = reindexParallelArray(aligned, permutation);

    return {
      id: params.makeId(index),
      sessionId: params.sessionId,
      order: orderOffset + index + 1,
      topicId,
      gapId,
      // Generalized recall-gap mastery tracking (issue #57) — persisted
      // even when unmatched at generation time (gapId stays null), so a
      // miss on a never-before-seen concept can still spawn a new gap at
      // answer time (SCENARIO 2).
      gapLabel: q.gapLabel ?? null,
      prompt: q.prompt,
      options: reindexed.options,
      correctAnswerIndex,
      difficulty: q.difficulty,
      kind: q.format,
      type,
      correctAnswerIndexes: type === "multi" ? reindexed.correctIndexes : null,
      answeredIndex: null,
      answeredIndexes: null,
      outcome: null,
      answeredAt: null,
      optionExplanations,
    };
  });
}

function resolveCorrectIndexes(
  q: GeneratedProbeQuestion,
  optionsLength: number,
  allowMultiSelect: boolean,
): { type: ProbeQuestionType; rawCorrectIndexes: number[] } {
  const fallbackSingle = [clamp(q.correctAnswerIndex, 0, optionsLength - 1)];

  if (!allowMultiSelect || q.type !== "multi") {
    return { type: "single", rawCorrectIndexes: fallbackSingle };
  }

  const clamped = (q.correctAnswerIndexes ?? [])
    .map((i) => clamp(i, 0, optionsLength - 1))
    .filter((i, idx, arr) => arr.indexOf(i) === idx);

  if (clamped.length === 0) {
    return { type: "single", rawCorrectIndexes: fallbackSingle };
  }

  return { type: "multi", rawCorrectIndexes: clamped };
}
