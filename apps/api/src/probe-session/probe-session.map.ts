import type { GeneratedProbeQuestion } from "@post-anki/shared";
import type { ProbeSessionQuestionInsert } from "./probe-session.repo.js";

export function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export interface BuildRowsParams {
  sessionId: string;
  generated: GeneratedProbeQuestion[];
  defaultTopicId: string;
  topicIdByTitle: Map<string, string>;
  gapIdByKey: Map<string, string>;
  makeId: (index: number) => string;
}

export function buildQuestionRows(
  params: BuildRowsParams,
): ProbeSessionQuestionInsert[] {
  return params.generated.map((q, index) => {
    const topicId =
      (q.topicTitle && params.topicIdByTitle.get(normalize(q.topicTitle))) ||
      params.defaultTopicId;

    const gapId =
      (q.gapLabel &&
        params.gapIdByKey.get(`${topicId}::${normalize(q.gapLabel)}`)) ||
      null;

    const options = q.options.length > 0 ? q.options : ["True", "False"];
    const correctAnswerIndex = clamp(q.correctAnswerIndex, 0, options.length - 1);

    return {
      id: params.makeId(index),
      sessionId: params.sessionId,
      order: index + 1,
      topicId,
      gapId,
      prompt: q.prompt,
      options,
      correctAnswerIndex,
      difficulty: q.difficulty,
      kind: q.format,
      answeredIndex: null,
      outcome: null,
      answeredAt: null,
    };
  });
}
