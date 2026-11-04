import type { GenerateKnowledgeBitExampleResult, KnowledgeBitExampleError } from "@post-anki/shared";
import { runKnowledgeBitExampleGenerator } from "../mastra/knowledge-bit-example-generator.agent.js";
import { LlmBudgetCheckUnavailableError, LlmBudgetExceededError } from "../shared/spend-guard.js";
import { log } from "../shared/log.js";
import {
  checkExampleGate,
  getKnowledgeBitExampleState,
  writeKnowledgeBitExample,
} from "./knowledge-bit-example.repo.js";

export async function generateKnowledgeBitExample(
  id: string,
  overwrite: boolean,
): Promise<GenerateKnowledgeBitExampleResult | { error: KnowledgeBitExampleError }> {
  const state = await getKnowledgeBitExampleState(id);
  const gate = checkExampleGate(state, overwrite);

  if (gate !== null || !state) {
    return { error: gate ?? "not_found" };
  }

  let example: string;

  try {
    example = (await runKnowledgeBitExampleGenerator(state.body)).example;
  } catch (err) {
    if (err instanceof LlmBudgetExceededError || err instanceof LlmBudgetCheckUnavailableError) {
      return { error: "budget_exceeded" };
    }

    log.error({ err, knowledgeBitId: id }, "knowledge_bit_example_failed");

    return { error: "generation_failed" };
  }

  const written = await writeKnowledgeBitExample(id, example, overwrite);

  if (!written.ok) {
    return { error: written.reason };
  }

  return {
    knowledgeBitId: id,
    example,
    exampleAiGeneratedAt: written.exampleAiGeneratedAt.toISOString(),
    previousExample: written.previousExample,
    generationsLeft: written.generationsLeft,
  };
}
