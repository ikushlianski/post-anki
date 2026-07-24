import type http from "node:http";
import { decideInput, decideResultSchema, type DecideResult } from "@post-anki/shared";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import { getMastra, AGENT_KEYS } from "../mastra/mastra.js";
import { log } from "../shared/log.js";

const FALLBACK: DecideResult = {
  strengths: [],
  blindSpots: [
    "The evaluator was unavailable — reason through the tradeoffs yourself and retry.",
  ],
  questions: [
    "What is the strongest argument against your current choice?",
    "What constraint would force you to decide differently?",
  ],
  verdict: "Could not evaluate right now. Your opinion stands unchallenged — retry shortly.",
};

export async function handleDecide(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const body = await readJsonBody(req, decideInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const prompt = [
    `Decision the learner faces: ${body.data.decision}`,
    "",
    `The learner's own opinion (formed before asking): ${body.data.opinion}`,
  ].join("\n");

  try {
    const agent = getMastra().getAgent(AGENT_KEYS.decide);
    const result = await agent.generate(prompt, {
      structuredOutput: { schema: decideResultSchema },
    });

    sendJson(res, 200, result.object ?? FALLBACK);
  } catch (err) {
    log.error({ err }, "decide_failed");
    sendError(res, 502, "evaluator_unavailable");
  }
}
