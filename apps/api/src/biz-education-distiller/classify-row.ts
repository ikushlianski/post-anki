import { z } from "zod";
import { getMastra, AGENT_KEYS } from "../mastra/mastra.js";
import { generateWithRetry } from "../mastra/generate-with-retry.js";
import type { HierarchyTopic } from "./distiller.repo.js";

const classificationResultSchema = z
  .object({
    matchedTopicId: z.string().nullable(),
    suggestedPlacement: z.string().nullable(),
  })
  .refine((result) => (result.matchedTopicId === null) !== (result.suggestedPlacement === null), {
    message: "exactly one of matchedTopicId or suggestedPlacement must be set",
  });

export type ClassificationResult = z.infer<typeof classificationResultSchema>;

function buildPrompt(noteText: string, hierarchy: HierarchyTopic[]): string {
  const candidates = hierarchy
    .map((t) => `- id: ${t.topicId}, title: "${t.topicTitle}", curriculum: "${t.curriculumName}", subject: "${t.subjectName}"`)
    .join("\n");

  return [
    "<note>",
    noteText,
    "</note>",
    "",
    "Existing topics:",
    candidates.length > 0 ? candidates : "(no topics exist yet)",
  ].join("\n");
}

export async function classifyRow(
  noteText: string,
  hierarchy: HierarchyTopic[],
): Promise<ClassificationResult> {
  const agent = getMastra().getAgent(AGENT_KEYS.bizEducationClassifier);
  const prompt = buildPrompt(noteText, hierarchy);

  const result = await generateWithRetry(
    "biz_education_classification",
    null,
    AGENT_KEYS.bizEducationClassifier,
    () => agent.generate(prompt, { structuredOutput: { schema: classificationResultSchema } }),
  );

  const parsed = classificationResultSchema.safeParse(result.object);

  if (!parsed.success) {
    throw new Error(`biz_education_classifier_invalid_output: ${parsed.error.message}`);
  }

  return parsed.data;
}
