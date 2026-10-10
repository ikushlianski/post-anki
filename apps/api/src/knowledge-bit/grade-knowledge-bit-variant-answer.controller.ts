import type http from "node:http";
import { z } from "zod";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import { log } from "../shared/log.js";
import { gradeKnowledgeBitVariantAnswer } from "./grade-knowledge-bit-variant-answer.orchestrator.js";

const gradeVariantAnswerInput = z.object({
  userAnswer: z.string().trim().min(1),
});

// A grading failure is a real 502 — never a silent "no grade".
export async function handleGradeKnowledgeBitVariantAnswer(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  variantId: string,
): Promise<void> {
  const body = await readJsonBody(req, gradeVariantAnswerInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  try {
    const result = await gradeKnowledgeBitVariantAnswer(variantId, body.data.userAnswer);

    if (!result.ok) {
      const status =
        result.error === "not_approved" ? 403 : result.error === "kind_not_typed" ? 409 : 404;

      sendError(res, status, result.error);
      return;
    }

    sendJson(res, 200, result);
  } catch (err) {
    log.error({ err, variantId }, "knowledge_bit_variant_answer_grading_failed");

    const message = err instanceof Error ? err.message : "knowledge bit variant answer grading failed";

    sendError(res, 502, "grading_failed", message);
  }
}
