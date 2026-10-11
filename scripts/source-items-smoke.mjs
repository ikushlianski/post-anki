import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = process.argv[2];
const model = process.argv[3] ?? "google/gemma-4-31b-it";

if (!sourcePath) {
  console.error("usage: node --import tsx scripts/source-items-smoke.mjs <source.txt> [openrouter-model-id]");
  process.exit(1);
}

process.env.DATABASE_URL ??= "postgres://unused:unused@127.0.0.1:1/unused";
process.env.OPENROUTER_API_KEY ??= "unused-by-smoke-script";

const { INSTRUCTIONS, buildKnowledgeBitSourceItemsPrompt } = await import(
  path.join(root, "apps/api/src/mastra/knowledge-bit-source-items.agent.ts")
);
const { validateSourceItems } = await import(
  path.join(root, "apps/api/src/knowledge-bit/knowledge-bit-source-item-validation.ts")
);

const env = readFileSync(path.join(root, "apps/api/.env.local"), "utf8");
const apiKey = /^OPENROUTER_API_KEY=(.*)$/m.exec(env)?.[1]?.trim().replace(/^["']|["']$/g, "");

if (!apiKey) {
  console.error("OPENROUTER_API_KEY not found in apps/api/.env.local");
  process.exit(1);
}

const source = readFileSync(sourcePath, "utf8").trim();
const itemSchema = {
  type: "object",
  properties: {
    statement: { type: "string" },
    question: { type: "string" },
    answer: { type: "string" },
    kind: { type: "string", enum: ["basic", "why", "fill_blank"] },
    quote: { type: "string" },
  },
  required: ["statement", "question", "answer", "kind", "quote"],
  additionalProperties: false,
};
const schema = {
  type: "object",
  properties: { items: { type: "array", items: itemSchema, minItems: 1, maxItems: 8 } },
  required: ["items"],
  additionalProperties: false,
};

const startedAt = Date.now();
const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    model,
    messages: [
      { role: "system", content: INSTRUCTIONS },
      { role: "user", content: buildKnowledgeBitSourceItemsPrompt(source) },
    ],
    response_format: { type: "json_schema", json_schema: { name: "source_items", strict: true, schema } },
  }),
  signal: AbortSignal.timeout(90_000),
});
const elapsedMs = Date.now() - startedAt;

if (!response.ok) {
  console.error(`request failed: ${response.status} ${(await response.text()).slice(0, 300)}`);
  process.exit(1);
}

const body = await response.json();
const content = body.choices?.[0]?.message?.content ?? "";
const parsed = JSON.parse(content);
const { valid, dropped } = validateSourceItems(parsed.items ?? [], source);

console.log(`model=${model} elapsed_ms=${elapsedMs} usage=${JSON.stringify(body.usage ?? {})}`);
console.log(`returned=${parsed.items?.length ?? 0} valid=${valid.length} dropped=${JSON.stringify(dropped)}`);

for (const [index, item] of (parsed.items ?? []).entries()) {
  console.log(`\n#${index + 1} [${item.kind}]`);
  console.log(`  statement: ${item.statement}`);
  console.log(`  question:  ${item.question}`);
  console.log(`  answer:    ${item.answer}`);
  console.log(`  quote:     ${item.quote}`);
}
