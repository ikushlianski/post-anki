import type { DecideSession } from "@post-anki/shared";
import { decideResultSchema } from "@post-anki/shared";
import { getMastra, AGENT_KEYS } from "../mastra/mastra.js";
import { log } from "../shared/log.js";
import { newId } from "../shared/id.js";
import { insertDecideSession } from "./decide.repo.js";

// Thrown for both agent-failure modes (a rejected agent call, and the agent
// returning no structured output) so the controller can map both to the
// same 502 evaluator_unavailable response — spec.md's Route design section:
// "both agent-failure branches now return 502 ... unified." Neither branch
// ever reaches insertDecideSession, so no row is persisted in either case.
export class EvaluatorUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("decide agent evaluation unavailable");
    this.name = "EvaluatorUnavailableError";

    if (cause instanceof Error) {
      this.cause = cause;
    }
  }
}

export function buildDecidePrompt(decision: string, opinion: string): string {
  return [
    `Decision the learner faces: ${decision}`,
    "",
    `The learner's own opinion (formed before asking): ${opinion}`,
  ].join("\n");
}

// decide.agent.ts's instructions and decideResultSchema (the LLM-facing
// shape) stay UNTOUCHED — the agent still returns blindSpots: string[].
// This orchestrator calls the agent, then persists one decide_sessions row
// plus one decide_blind_spots row per blind spot string, each with its own
// server-generated id (decide.repo.ts's insertDecideSession).
export async function submitDecideSession(
  decision: string,
  opinion: string,
): Promise<DecideSession> {
  const agent = getMastra().getAgent(AGENT_KEYS.decide);
  const prompt = buildDecidePrompt(decision, opinion);

  let object: unknown;

  try {
    const result = await agent.generate(prompt, {
      structuredOutput: { schema: decideResultSchema },
    });

    object = result.object;
  } catch (err) {
    log.error({ err }, "decide_agent_call_failed");
    throw new EvaluatorUnavailableError(err);
  }

  if (!object) {
    log.error({}, "decide_agent_returned_no_structured_output");
    throw new EvaluatorUnavailableError();
  }

  const parsed = decideResultSchema.safeParse(object);

  if (!parsed.success) {
    log.error({ issues: parsed.error.issues }, "decide_agent_returned_invalid_structured_output");
    throw new EvaluatorUnavailableError(parsed.error);
  }

  const session = await insertDecideSession({
    id: newId("decidesession"),
    decision,
    opinion,
    verdict: parsed.data.verdict,
    strengths: parsed.data.strengths,
    questions: parsed.data.questions,
    blindSpots: parsed.data.blindSpots,
  });

  log.info({ decideSessionId: session.id }, "decide_session_created");

  return session;
}
