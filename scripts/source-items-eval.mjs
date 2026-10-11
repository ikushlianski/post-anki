// Usage: node --import tsx scripts/source-items-eval.mjs [runsPerCase=2] [filterText] [filterModel]
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturesDir = path.join(root, "scripts/fixtures/source-items");
const runs = Number(process.argv[2] ?? 2);
const textFilter = process.argv[3];
const modelFilter = process.argv[4];
const outFile = process.env.EVAL_OUT;
const MODELS = [
  "google/gemma-4-31b-it",
  "google/gemini-2.5-flash-lite",
  "mistralai/mistral-small-24b-instruct-2501",
];

process.env.DATABASE_URL ??= "postgres://unused:unused@127.0.0.1:1/unused";
process.env.OPENROUTER_API_KEY ??= "unused-by-eval-script";

const { INSTRUCTIONS, buildKnowledgeBitSourceItemsPrompt, SOURCE_ITEMS_MAX_PER_CHUNK } = await import(
  path.join(root, "apps/api/src/mastra/knowledge-bit-source-items.agent.ts")
);
const { validateSourceItems } = await import(
  path.join(root, "apps/api/src/knowledge-bit/knowledge-bit-source-item-validation.ts")
);
const { generateItemsForSource } = await import(
  path.join(root, "apps/api/src/knowledge-bit/detect-knowledge-bits.orchestrator.ts")
);
const { detectSourceLanguage } = await import(
  path.join(root, "apps/api/src/knowledge-bit/knowledge-bit-source-language.ts")
);

const envFile = readFileSync(path.join(root, "apps/api/.env.local"), "utf8");
const apiKey = /^OPENROUTER_API_KEY=(.*)$/m.exec(envFile)?.[1]?.trim().replace(/^["']|["']$/g, "");

if (!apiKey) {
  console.error("OPENROUTER_API_KEY not found in apps/api/.env.local");
  process.exit(1);
}

const catalog = (await (await fetch("https://openrouter.ai/api/v1/models")).json()).data;
const price = Object.fromEntries(catalog.map((m) => [m.id, { in: Number(m.pricing.prompt), out: Number(m.pricing.completion) }]));

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
  properties: { items: { type: "array", items: itemSchema, minItems: 1, maxItems: SOURCE_ITEMS_MAX_PER_CHUNK } },
  required: ["items"],
  additionalProperties: false,
};

async function callModel(model, chunk, strictLanguage, stats) {
  const startedAt = Date.now();
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: INSTRUCTIONS },
        { role: "user", content: buildKnowledgeBitSourceItemsPrompt(chunk, strictLanguage) },
      ],
      response_format: { type: "json_schema", json_schema: { name: "source_items", strict: true, schema } },
      usage: { include: true },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  stats.ms += Date.now() - startedAt;

  if (!response.ok) {
    throw new Error(`http_${response.status}: ${(await response.text()).slice(0, 150)}`);
  }

  const body = await response.json();
  const usage = body.usage ?? {};

  stats.cost += usage.cost ?? (usage.prompt_tokens ?? 0) * price[model].in + (usage.completion_tokens ?? 0) * price[model].out;

  const items = JSON.parse(body.choices?.[0]?.message?.content ?? "{}").items ?? [];
  const result = validateSourceItems(items, chunk);

  stats.calls += 1;
  stats.returned += items.length;
  stats.valid += result.valid.length;
  stats.dropped.push(...result.dropped);

  for (const item of items) {
    const single = validateSourceItems([item], chunk);

    if (single.dropped.length > 0) {
      stats.droppedItems.push({ reason: single.dropped[0], item });
    }
  }

  return items;
}

async function runCase(model, text) {
  const stats = { ms: 0, cost: 0, calls: 0, returned: 0, valid: 0, dropped: [], droppedItems: [] };
  const stored = [];
  const deps = {
    writeItems: (chunk, options) => callModel(model, chunk, options.strictLanguage === true, stats),
    getInsertState: async () => ({ nextOrdinal: 0, existingStatements: [] }),
    insertItems: async (input) => {
      stored.push(...input.items);

      return input.items.length;
    },
    markDetected: async () => true,
    markFailed: async () => true,
  };
  let result;

  try {
    result = await generateItemsForSource({ id: "eval", rawText: text, claimedAt: new Date() }, { modelId: model }, deps);
  } catch (err) {
    result = { status: "failed", inserted: 0, failureReason: String(err.message).slice(0, 120) };
  }

  return { stats, stored, result };
}

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const texts = readdirSync(fixturesDir)
  .filter((f) => f.endsWith(".txt") && (!textFilter || f.includes(textFilter)))
  .sort()
  .map((f) => ({ id: f.replace(/\.txt$/, ""), text: readFileSync(path.join(fixturesDir, f), "utf8").trim() }));
const models = MODELS.filter((m) => !modelFilter || m.includes(modelFilter));
const rows = [];
const outputs = [];

const jobs = texts.flatMap((t) => models.map((m) => ({ t, m })));

await Promise.all(
  jobs.map(async ({ t, m }) => {
    const attempts = await Promise.all(Array.from({ length: runs }, () => runCase(m, t.text)));
    const first = attempts[0];
    const language = detectSourceLanguage(t.text);
    const dropped = {};

    for (const reason of first.stats.dropped) {
      dropped[reason] = (dropped[reason] ?? 0) + 1;
    }

    const languageOk = first.stored.length > 0 && first.stored.every((item) => detectSourceLanguage(`${item.statement} ${item.question} ${item.answer}`) === language);

    rows.push({
      text: t.id,
      model: m.split("/")[1],
      status: first.result.status === "detected" ? "ok" : `FAIL ${first.result.failureReason}`,
      "returned/valid": `${first.stats.returned}/${first.stats.valid}`,
      stored: first.stored.length,
      dropped: JSON.stringify(dropped),
      languageOk,
      "median ms": median(attempts.map((a) => a.stats.ms)),
      "cost $": Number((attempts.reduce((s, a) => s + a.stats.cost, 0) / runs).toFixed(5)),
    });
    outputs.push({ text: t.id, model: m, status: first.result.status, failureReason: first.result.failureReason, items: first.stored, droppedItems: first.stats.droppedItems });
  }),
);

rows.sort((a, b) => a.text.localeCompare(b.text) || a.model.localeCompare(b.model));
console.table(rows);

if (outFile) {
  writeFileSync(outFile, JSON.stringify(outputs, null, 2));
}

for (const o of outputs.sort((a, b) => a.text.localeCompare(b.text) || a.model.localeCompare(b.model))) {
  console.log(`\n===== ${o.text} | ${o.model} | ${o.status} ${o.failureReason ?? ""}`);

  for (const [i, item] of o.items.entries()) {
    console.log(`#${i + 1} [${item.kind}]\n  S: ${item.statement}\n  Q: ${item.question}\n  A: ${item.answer}\n  quote: ${item.quote}`);
  }

  for (const d of o.droppedItems) {
    console.log(`DROPPED(${d.reason}) [${d.item.kind}] Q: ${d.item.question} | A: ${d.item.answer} | S: ${d.item.statement}`);
  }
}
