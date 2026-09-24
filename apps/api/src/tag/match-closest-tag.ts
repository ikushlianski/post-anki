import { z } from "zod";
import { buildTagMatchPrompt } from "@post-anki/core";
import { getMastra, AGENT_KEYS } from "../mastra/mastra.js";
import { generateWithRetry } from "../mastra/generate-with-retry.js";

const tagMatchResultSchema = z.object({
  matchedTagName: z.string().nullable(),
});

export type TagMatchResult = z.infer<typeof tagMatchResultSchema>;

export async function matchClosestTag(
  candidateName: string,
  context: string | undefined,
  existingTagNames: string[],
  forceMatch: boolean,
): Promise<TagMatchResult> {
  const agent = getMastra().getAgent(AGENT_KEYS.tagAutoAssign);
  const prompt = buildTagMatchPrompt(candidateName, context, existingTagNames, forceMatch);

  const result = await generateWithRetry("tag_auto_assign_match", null, AGENT_KEYS.tagAutoAssign, () =>
    agent.generate(prompt, { structuredOutput: { schema: tagMatchResultSchema } }),
  );

  const parsed = tagMatchResultSchema.safeParse(result.object);

  if (!parsed.success) {
    throw new Error(`tag_auto_assign_invalid_output: ${parsed.error.message}`);
  }

  if (forceMatch && parsed.data.matchedTagName === null) {
    throw new Error("tag_auto_assign_forced_match_returned_null");
  }

  return parsed.data;
}
