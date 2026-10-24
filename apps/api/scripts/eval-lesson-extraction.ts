import { readFileSync } from "node:fs";
import process from "node:process";
import {
  BUSINESS_LEARNING_INTENT,
  DEFAULT_KNOWLEDGE_ITEM_MODEL_ID,
  knowledgeItemModelIdSchema,
} from "@post-anki/shared";
import { assertLocalDbTarget } from "../src/db/assert-local-db-target.ts";
import { closeDb } from "../src/db/client.ts";
import { checkLessons } from "../src/knowledge-bit/knowledge-bit-lesson-eval.checks.ts";
import { runKnowledgeBitSourceItems } from "../src/mastra/knowledge-bit-source-items.agent.ts";
import { estimateModelComparisonCost } from "../src/model-comparison/model-comparison-cost.ts";

const FIXTURE_URL = new URL("../src/knowledge-bit/knowledge-bit-lesson-eval.fixture.ru.txt", import.meta.url);

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);

  return index === -1 ? undefined : process.argv[index + 1];
}

async function main() {
  const modelId = knowledgeItemModelIdSchema.parse(argValue("--model") ?? DEFAULT_KNOWLEDGE_ITEM_MODEL_ID);
  const filePath = argValue("--file");
  const sourceText = readFileSync(filePath ?? FIXTURE_URL, "utf8");
  const estimate = estimateModelComparisonCost(sourceText, [modelId]);
  const perModel = estimate.perModel[0];

  console.log(`source: ${filePath ?? "built-in fixture"} (${sourceText.length} chars, ${estimate.chunkCount} chunk(s))`);
  console.log(`model: ${modelId}`);
  console.log(
    `estimated cost: about $${estimate.totalEstimatedCostUsd.toFixed(4)} ` +
      `(${perModel?.inputTokens ?? 0} input tokens, ${perModel?.outputTokens ?? 0} output tokens, two model calls per chunk)`,
  );

  if (!process.argv.includes("--run") || process.env.EVAL_REAL_MODEL !== "1") {
    console.log("not run: this calls a real model. Pass --run and set EVAL_REAL_MODEL=1 to run it.");

    return;
  }

  assertLocalDbTarget(process.env.DATABASE_URL);

  const lessons = await runKnowledgeBitSourceItems(sourceText, {
    modelId,
    learningIntent: BUSINESS_LEARNING_INTENT,
    onUsage: (usage) => console.log(`usage: ${usage.inputTokens ?? "?"} input, ${usage.outputTokens ?? "?"} output tokens`),
  });

  lessons.forEach((lesson, index) => {
    console.log(`\nlesson ${index + 1}: ${lesson.statement}`);
    console.log(`  quote: ${lesson.quote}`);
    console.log(`  example: ${lesson.example ?? "-"}`);
    lesson.cards.forEach((card) => console.log(`  [${card.kind}] ${card.question} -> ${card.answer}`));
  });

  console.log("");

  const checks = checkLessons(lessons, sourceText);

  checks.forEach((check) => console.log(`${check.passed ? "PASS" : "FAIL"} ${check.name}: ${check.detail}`));
  await closeDb();

  if (checks.some((check) => !check.passed)) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
