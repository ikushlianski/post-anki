import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const excerptPath = process.argv[2] ?? path.join(root, "scripts/fixtures/source-items/ru.txt");
const modelIds = (process.argv[3] ?? "openrouter/anthropic/claude-haiku-5.5,openrouter/google/gemma-4-31b-it").split(",");

process.env.DATABASE_URL = process.env.PROBE_DATABASE_URL ?? "postgres://pet_projects:pet_projects@127.0.0.1:5999/pet_projects";

const envFile = readFileSync(path.join(root, "apps/api/.env.local"), "utf8");
const key = /^OPENROUTER_API_KEY=(.*)$/m.exec(envFile)?.[1]?.trim().replace(/^["']|["']$/g, "");

if (!key) {
  console.error("OPENROUTER_API_KEY not found in apps/api/.env.local");
  process.exit(1);
}

process.env.OPENROUTER_API_KEY = key;

const { Mastra } = await import("@mastra/core");
const { InMemoryStore } = await import("@mastra/core/storage");
const { runExperiment } = await import("@mastra/core/datasets");
const { createScorer } = await import("@mastra/core/evals");
const { runKnowledgeBitSourceItems } = await import(path.join(root, "apps/api/src/mastra/knowledge-bit-source-items.agent.ts"));
const { validateSourceItems } = await import(path.join(root, "apps/api/src/knowledge-bit/knowledge-bit-source-item-validation.ts"));

const excerpt = readFileSync(excerptPath, "utf8").trim();
const mastra = new Mastra({ storage: new InMemoryStore() });

const validShare = createScorer({
  id: "valid-share",
  description: "Share of returned items that pass the production validation guards",
}).generateScore(({ run }) => {
  const output = run.output;

  return output.returned === 0 ? 0 : output.valid / output.returned;
});

const summary = await runExperiment(mastra, {
  name: "model-probe",
  data: modelIds.map((modelId) => ({ id: modelId, input: { modelId, excerpt } })),
  task: async ({ input }) => {
    const started = Date.now();
    const items = await runKnowledgeBitSourceItems(input.excerpt, { modelId: input.modelId });
    const checked = validateSourceItems(items, input.excerpt);

    return {
      modelId: input.modelId,
      ms: Date.now() - started,
      returned: items.length,
      valid: checked.valid.length,
      dropped: checked.dropped,
      questions: checked.valid.map((item) => item.question),
    };
  },
  scorers: [validShare],
  maxConcurrency: 2,
  itemTimeout: 120_000,
});

console.log(JSON.stringify(summary, null, 2).slice(0, 6000));
