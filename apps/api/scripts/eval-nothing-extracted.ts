import process from "node:process";
import {
  BUSINESS_LEARNING_INTENT,
  DEFAULT_KNOWLEDGE_ITEM_MODEL_ID,
  knowledgeItemModelIdSchema,
} from "@post-anki/shared";
import { assertLocalDbTarget } from "../src/db/assert-local-db-target.ts";
import { closeDb } from "../src/db/client.ts";
import { NOTHING_EXTRACTED_EVAL_CASES } from "../src/knowledge-bit/knowledge-bit-nothing-extracted-eval.fixture.ts";
import { runKnowledgeBitSourceItems } from "../src/mastra/knowledge-bit-source-items.agent.ts";

const SUBJECT_KINDS = ["other", "business"] as const;

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);

  return index === -1 ? undefined : process.argv[index + 1];
}

async function main() {
  const modelId = knowledgeItemModelIdSchema.parse(argValue("--model") ?? DEFAULT_KNOWLEDGE_ITEM_MODEL_ID);

  console.log(`cases: ${NOTHING_EXTRACTED_EVAL_CASES.length} x ${SUBJECT_KINDS.length} subject kinds, model: ${modelId}`);

  if (!process.argv.includes("--run") || process.env.EVAL_REAL_MODEL !== "1") {
    console.log("not run: this calls a real model. Pass --run and set EVAL_REAL_MODEL=1 to run it.");

    return;
  }

  assertLocalDbTarget(process.env.DATABASE_URL);

  let failures = 0;

  for (const subjectKind of SUBJECT_KINDS) {
    for (const testCase of NOTHING_EXTRACTED_EVAL_CASES) {
      let deliberateEmpty = false;
      const lessons = await runKnowledgeBitSourceItems(testCase.text, {
        modelId,
        subjectKind,
        learningIntent: BUSINESS_LEARNING_INTENT,
        onNothingWorthKeeping: () => {
          deliberateEmpty = true;
        },
      });
      const passed = testCase.expectation === "card" ? lessons.length > 0 : lessons.length === 0 && deliberateEmpty;

      failures += passed ? 0 : 1;
      console.log(
        `${passed ? "PASS" : "FAIL"} [${subjectKind}] ${testCase.name}: expected ${testCase.expectation}, ` +
          `got ${lessons.length} lesson(s), deliberate empty: ${deliberateEmpty}`,
      );
    }
  }

  await closeDb();

  if (failures > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
