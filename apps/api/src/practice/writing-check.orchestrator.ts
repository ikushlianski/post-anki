import type { WritingCheck } from "@post-anki/shared";
import { RequestContext } from "@mastra/core/request-context";
import { getMastra, AGENT_KEYS } from "../mastra/mastra.js";
import { log } from "../shared/log.js";
import { newId } from "../shared/id.js";
import { writingCheckAgentSchema } from "./writing-check.schemas.js";
import { insertWritingCheck } from "./writing-check.repo.js";

export function buildWritingCheckPrompt(text: string): string {
  return [
    "Grade the following piece of writing for native-soundingness:",
    "",
    text,
  ].join("\n");
}

export async function gradeAndStoreWritingCheck(
  subjectId: string,
  text: string,
): Promise<WritingCheck> {
  const agent = getMastra().getAgent(AGENT_KEYS.writingCheck);
  const prompt = buildWritingCheckPrompt(text);

  const result = await agent.generate(prompt, {
    structuredOutput: { schema: writingCheckAgentSchema },
    requestContext: new RequestContext([["subjectId", subjectId]]),
  });

  if (!result.object) {
    throw new Error("writing check agent returned no structured output");
  }

  const row = await insertWritingCheck({
    id: newId("writingcheck"),
    subjectId,
    text,
    score: result.object.score,
    verdict: result.object.verdict,
    feedback: result.object.feedback,
    nativeAlternatives: result.object.nativeAlternatives,
  });

  log.info({ subjectId, writingCheckId: row.id }, "writing_check_graded");

  return row;
}
