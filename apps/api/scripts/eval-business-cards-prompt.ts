import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import process from "node:process";
import { Agent } from "@mastra/core/agent";
import { RequestContext } from "@mastra/core/request-context";
import { KNOWLEDGE_ITEM_MODELS, type KnowledgeItemModelId } from "@post-anki/shared";
import { assertLocalDbTarget } from "../src/db/assert-local-db-target.ts";
import { closeDb } from "../src/db/client.ts";
import { dynamicKnowledgeItemModel } from "../src/mastra/model.ts";
import { readGenerateUsage } from "../src/mastra/generate-usage.ts";
import { detectSourceLanguage } from "../src/knowledge-bit/knowledge-bit-source-language.ts";
import { loadEnv } from "../src/shared/env.ts";
import { analyseResponse, countKnownRepeats } from "./eval-business-cards/analyse-cards.ts";
import { loadKnownFronts, loadSources, pickSources, readConfiguredModelId, type EvalSource } from "./eval-business-cards/load-sources.ts";
import { comparisonTable, extraMetrics, sourceSection, type Store, type StoredCall, type VersionRun } from "./eval-business-cards/render-report.ts";

const PROMPT_DIR = new URL("./eval-prompts/", import.meta.url);
const REPORT_URL = new URL("../../../docs/ai-evals.md", import.meta.url);
const STORE_URL = new URL("../../../.planning/.runs/2026-10-25/ai-evals/results.json", import.meta.url);
const MAX_RUN_COST_USD = 1;
const MAX_TOTAL_COST_USD = 2;
const CHARS_PER_TOKEN = 2.5;
const ESTIMATE_OUTPUT_TOKENS = 2500;
const FACTS_MARKER = "## Facts observed";
const TOPIC_LEVEL = "2";

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);

  return index === -1 ? undefined : process.argv[index + 1];
}

function versionOf(file: string): string {
  return file.replace(/^business-cards-/, "").replace(/\.prompt\.txt$/, "");
}

function maxCardsFor(words: number): number {
  return Math.min(6, Math.max(3, Math.round(words / 500) * 3));
}

function fillPrompt(template: string, values: Record<string, string>): string {
  return template.replace(/\{(output_language|metadata|max_cards|text|topic_node|level|known_concepts)\}/g, (_m, key: string) => values[key] ?? "");
}

function costOf(modelId: KnowledgeItemModelId, input: number | null, output: number | null): number {
  const model = KNOWLEDGE_ITEM_MODELS[modelId];

  return ((input ?? 0) * model.inputPerMillion + (output ?? 0) * model.outputPerMillion) / 1_000_000;
}

async function callOnce(agent: Agent, modelId: string, prompt: string) {
  const result = await agent.generate(prompt, { requestContext: new RequestContext([["knowledgeItemModelId", modelId]]) });

  return { text: result.text, usage: readGenerateUsage(result) };
}

async function runCall(agent: Agent, modelId: KnowledgeItemModelId, template: string, source: EvalSource): Promise<StoredCall> {
  const language = detectSourceLanguage(source.text) ?? "English";
  const maxCards = maxCardsFor(source.text.split(/\s+/).length);
  const knownFronts = template.includes("{known_concepts}") ? await loadKnownFronts(source) : [];
  const prompt = fillPrompt(template, {
    output_language: language,
    metadata: `${source.url ?? "no title or URL"}; subject: ${source.subjectPath}`,
    max_cards: String(maxCards),
    text: source.text,
    topic_node: source.subjectPath,
    level: TOPIC_LEVEL,
    known_concepts: knownFronts.length > 0 ? knownFronts.join("\n") : "(none)",
  });
  const base = { maxCards, language, knownFronts };

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const { text, usage } = await callOnce(agent, modelId, prompt);

      return { ...base, raw: text, failure: null, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, costUsd: costOf(modelId, usage.inputTokens, usage.outputTokens) };
    } catch (err) {
      console.log(`call failed (attempt ${attempt}) for ${source.id}: ${err instanceof Error ? err.name : "error"}`);

      if (attempt === 2) {
        return { ...base, raw: null, failure: err instanceof Error ? err.message.slice(0, 200) : "unknown error", inputTokens: null, outputTokens: null, costUsd: 0 };
      }
    }
  }

  throw new Error("unreachable");
}

function buildRuns(sources: readonly EvalSource[], versions: readonly string[], store: Store): Map<string, VersionRun> {
  const runs = new Map<string, VersionRun>();

  for (const version of versions) {
    for (const source of sources) {
      const call = store[version]?.[source.id] ?? null;
      const analysis = call?.raw ? analyseResponse(call.raw, source.text) : null;
      const knownRepeats = call && call.knownFronts.length > 0 && analysis ? countKnownRepeats(analysis.cards, call.knownFronts) : null;

      if (call) {
        runs.set(`${version}|${source.id}`, { version, call, analysis, knownRepeats });
      }
    }
  }

  return runs;
}

function writeReport(modelId: string, sources: readonly EvalSource[], versions: readonly string[], store: Store) {
  const runs = buildRuns(sources, versions, store);
  const total = [...runs.values()].reduce((sum, run) => sum + (run.call?.costUsd ?? 0), 0);
  const previous = existsSync(REPORT_URL) ? readFileSync(REPORT_URL, "utf8") : "";
  const facts = previous.includes(FACTS_MARKER) ? previous.slice(previous.indexOf(FACTS_MARKER)) : `${FACTS_MARKER}\n\n(pending)\n`;
  const header = [
    "# AI prompt evals",
    "",
    "- date: 2026-10-25",
    `- model: ${modelId} (the knowledge-item model the app is configured with, via OpenRouter, default sampling settings)`,
    `- prompt files (apps/api/scripts/eval-prompts/, unedited): ${versions.map((v) => `business-cards-${v}.prompt.txt`).join(", ")}`,
    `- total cost: $${total.toFixed(5)} over ${runs.size} call(s), one call per source per version, filled prompt as a single user message, no system prompt`,
    "- done: real model calls and read-only SELECTs on the local dev database",
    "- not done: no database writes, no use of the app's lessons/cards pipeline, no cards saved anywhere",
    "- sources: only the sources that exist in the local dev database were used (see per-source sections); v2 used level 2 and known fronts from other sources in the same subject",
    "",
    "## Comparison",
    "",
    ...comparisonTable(sources, versions, runs),
    ...extraMetrics(versions, runs),
  ];

  writeFileSync(REPORT_URL, [...header, ...sources.map((s, i) => sourceSection(s, i, versions, runs)), facts].join("\n"));
}

async function main() {
  const allFiles = readdirSync(PROMPT_DIR).filter((f) => /^business-cards-.*\.prompt\.txt$/.test(f)).sort();
  const listed = argValue("--prompts")?.split(",").map((f) => f.trim());
  const files = listed ?? allFiles;
  const versions = files.map(versionOf);
  const only = argValue("--only");
  const toRun = only ? versions.filter((v) => v === only || v.startsWith(only)) : versions;

  if (toRun.length === 0) {
    throw new Error("--only matches no prompt version");
  }

  assertLocalDbTarget(process.env.DATABASE_URL);

  const modelId = await readConfiguredModelId();
  const sources = pickSources(await loadSources());
  const store: Store = existsSync(STORE_URL) ? (JSON.parse(readFileSync(STORE_URL, "utf8")) as Store) : {};
  const spent = Object.values(store).flatMap((v) => Object.values(v)).reduce((sum, call) => sum + call.costUsd, 0);
  const templates = new Map(files.map((file) => [versionOf(file), readFileSync(new URL(file, PROMPT_DIR), "utf8")]));
  const inputChars = toRun.reduce((sum, v) => sum + sources.reduce((s, src) => s + (templates.get(v)?.length ?? 0) + src.text.length, 0), 0);
  const estimate = costOf(modelId, Math.ceil(inputChars / CHARS_PER_TOKEN), toRun.length * sources.length * ESTIMATE_OUTPUT_TOKENS);

  console.log(`model: ${modelId}`);
  sources.forEach((s) => console.log(`source ${s.id}: ${s.subjectPath}, ${s.totalWords} words, ${s.bits.length} existing bits`));
  console.log(`versions to run: ${toRun.join(", ")}; calls: ${toRun.length * sources.length}`);
  console.log(`estimated cost: about $${estimate.toFixed(4)} (already spent in stored results: $${spent.toFixed(4)})`);

  if (!process.argv.includes("--run") || process.env.EVAL_REAL_MODEL !== "1") {
    console.log("not run: this calls a real model. Pass --run and set EVAL_REAL_MODEL=1 to run it.");
    await closeDb();

    return;
  }

  if (estimate > MAX_RUN_COST_USD || spent + estimate > MAX_TOTAL_COST_USD) {
    throw new Error("estimated cost exceeds the cap, aborting");
  }

  const agent = new Agent({ id: "eval-business-cards", name: "Eval Business Cards", instructions: "", model: dynamicKnowledgeItemModel(loadEnv()) });

  for (const version of toRun) {
    store[version] = {};

    for (const source of sources) {
      store[version][source.id] = await runCall(agent, modelId, templates.get(version) ?? "", source);
      writeFileSync(STORE_URL, JSON.stringify(store, null, 2));
    }
  }

  writeReport(modelId, sources, versions, store);
  console.log("done");
  await closeDb();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : "failed");
  process.exit(1);
});
