import type http from "node:http";
import {
  questionKindSchema,
  type DailyPushNudge,
  type DailyPushResponse,
  type QuestionKind,
} from "@post-anki/shared";
import { selectDailyPush, selectNudge, type NudgeCandidate } from "@post-anki/core";
import { sendJson } from "../shared/http.js";
import { buildProbeQuestionForGap } from "../probe/probe.service.js";
import { gatherNudgeCandidates } from "../liveness/nudge.repo.js";
import { gatherPushCandidates } from "./push.repo.js";

export async function handleDailyPush(
  res: http.ServerResponse,
  modeParam: string | null,
): Promise<void> {
  const parsedMode = questionKindSchema.safeParse(modeParam);
  const mode: QuestionKind = parsedMode.success ? parsedMode.data : "socratic";
  const now = new Date().toISOString();

  const [candidates, nudgeCandidates] = await Promise.all([
    gatherPushCandidates(),
    gatherNudgeCandidates(now),
  ]);

  const pick = selectDailyPush(candidates, now);
  const selection = selectNudge(nudgeCandidates, now);

  const question = pick
    ? await buildProbeQuestionForGap(pick.topicId, pick.gap, mode)
    : null;

  const body: DailyPushResponse = {
    push: pick,
    question,
    nudge: selection
      ? { ...toNudgeSubject(selection.target), related: selection.related.map(toNudgeSubject) }
      : null,
  };

  sendJson(res, 200, body);
}

function toNudgeSubject(candidate: NudgeCandidate): Omit<DailyPushNudge, "related"> {
  return {
    entityType: candidate.entityType,
    entityId: candidate.entityId,
    name: candidate.name,
    score: candidate.score,
  };
}
