import type http from "node:http";
import { sendJson } from "../shared/http.js";
import { listNextQuestionVariantsToAnswer } from "./knowledge-bit-question-variant.repo.js";

const DEFAULT_LIMIT = 5;

export async function handleListNextKnowledgeBitQuestionVariants(
  res: http.ServerResponse,
  search: string,
): Promise<void> {
  const params = new URLSearchParams(search);
  const rawLimit = params.get("limit");
  const limit = rawLimit && Number.isInteger(Number(rawLimit)) ? Number(rawLimit) : DEFAULT_LIMIT;
  const tagId = params.get("tagId") ?? undefined;
  const topicId = params.get("topicId") ?? undefined;
  const knowledgeBitId = params.get("knowledgeBitId") ?? undefined;

  const variants = await listNextQuestionVariantsToAnswer(limit, {
    tagId,
    topicId,
    knowledgeBitId,
  });

  sendJson(res, 200, variants);
}
