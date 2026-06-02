import type http from "node:http";
import {
  questionKindSchema,
  type DailyPushResponse,
  type QuestionKind,
} from "@post-anki/shared";
import { selectDailyPush } from "@post-anki/core";
import { sendJson } from "../shared/http.js";
import { buildProbeQuestionForGap } from "../probe/probe.service.js";
import { gatherPushCandidates } from "./push.repo.js";

export async function handleDailyPush(
  res: http.ServerResponse,
  modeParam: string | null,
): Promise<void> {
  const parsedMode = questionKindSchema.safeParse(modeParam);
  const mode: QuestionKind = parsedMode.success ? parsedMode.data : "socratic";

  const candidates = await gatherPushCandidates();
  const pick = selectDailyPush(candidates, new Date().toISOString());

  const question = pick
    ? await buildProbeQuestionForGap(pick.topicId, pick.gap, mode)
    : null;

  const body: DailyPushResponse = { push: pick, question };

  sendJson(res, 200, body);
}
