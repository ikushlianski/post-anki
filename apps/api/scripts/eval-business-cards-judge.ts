import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import process from "node:process";
import { Agent } from "@mastra/core/agent";
import { RequestContext } from "@mastra/core/request-context";
import type { ZodType } from "zod";
import { assertLocalDbTarget } from "../src/db/assert-local-db-target.ts";
import { closeDb } from "../src/db/client.ts";
import { dynamicKnowledgeItemModel } from "../src/mastra/model.ts";
import { readGenerateUsage } from "../src/mastra/generate-usage.ts";
import { loadEnv } from "../src/shared/env.ts";
import { tryParse } from "./eval-business-cards/analyse-cards.ts";
import { BASELINE_MODEL_ID, BASELINE_PRICING, readFullStore } from "./eval-business-cards/cheap-models.ts";
import { LABELS, buildCardPrompt, buildRankingPrompt, cardJudgeSchema, rankingSchema, seededShuffle, type AnonymousSet } from "./eval-business-cards/judge-prompts.ts";
import { JUDGE_FACTS_MARKER, JUDGE_MARKER, renderJudgeSection } from "./eval-business-cards/judge-report.ts";
import { APP_MODEL, APP_VERSION, cardKey, collectUnits, rankKey, readJudgeStore, totalJudgeCost, writeJudgeStore, type JudgeStore, type Unit } from "./eval-business-cards/judge-store.ts";
import { loadSources, pickSources } from "./eval-business-cards/load-sources.ts";

const PROMPT_DIR = new URL("./eval-prompts/", import.meta.url);
const REPORT_URL = new URL("../../../docs/ai-evals.md", import.meta.url);
const RESULTS_URL = new URL("../../../.planning/.runs/2026-10-25/ai-evals/results.json", import.meta.url);
const JUDGE_URL = new URL("../../../.planning/.runs/2026-10-25/ai-evals/judge.json", import.meta.url);
const JUDGE_MODEL = `openrouter/${BASELINE_MODEL_ID}`;
const MAX_TOTAL_COST_USD = 1.5;
const BUSINESS_SOURCE_COUNT = 2;
const CHARS_PER_TOKEN = 2.5;
const CARD_OUTPUT_TOKENS = 450;
const RANK_OUTPUT_TOKENS = 150;
const PROMPT_OVERHEAD_CHARS = 2200;

function costOf(input: number | null, output: number | null): number {
  return ((input ?? 0) * BASELINE_PRICING.inputPerMillion + (output ?? 0) * BASELINE_PRICING.outputPerMillion) / 1_000_000;
}

async function judgeCall<T>(agent: Agent, prompt: string, schema: ZodType<T>) {
  let failure = "unknown";
  let inputTokens = 0;
  let outputTokens = 0;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const result = await agent.generate(prompt, { requestContext: new RequestContext([["knowledgeItemModelId", JUDGE_MODEL]]) });
      const usage = readGenerateUsage(result);

      inputTokens += usage.inputTokens ?? 0;
      outputTokens += usage.outputTokens ?? 0;

      const parsed = tryParse(result.text);
      const checked = parsed ? schema.safeParse(parsed.value) : null;

      if (checked?.success) {
        return { value: checked.data, failure: null, inputTokens, outputTokens, costUsd: costOf(inputTokens, outputTokens) };
      }

      failure = "judge reply was not valid JSON for the expected shape";
    } catch (err) {
      failure = err instanceof Error ? err.message.slice(0, 200) : "error";
    }

    console.log(`judge call failed (attempt ${attempt})`);
  }

  return { value: null, failure, inputTokens, outputTokens, costUsd: costOf(inputTokens, outputTokens) };
}

function pendingCards(units: readonly Unit[], store: JudgeStore) {
  return units.flatMap((unit) =>
    (unit.analysis?.cards ?? []).map((card, cardIndex) => ({ unit, card, key: cardKey({ model: unit.model, version: unit.version, sourceId: unit.source.id, cardIndex }), cardIndex })),
  ).filter(({ key }) => !store.cards[key]?.judgement);
}

function rankingJobs(units: readonly Unit[], versions: readonly string[], store: JudgeStore) {
  const groups = new Map<string, Unit[]>();

  for (const unit of units.filter((u) => u.model !== APP_MODEL)) {
    groups.set(`${unit.model}|${unit.source.id}`, [...(groups.get(`${unit.model}|${unit.source.id}`) ?? []), unit]);
  }

  return [...groups.entries()].filter(([, own]) => versions.every((v) => own.some((u) => u.version === v))).flatMap(([group, ownRuns]) => {
    const app = units.find((u) => u.model === APP_MODEL && u.source.id === ownRuns[0]?.source.id);
    const own = app ? [...ownRuns, app] : ownRuns;
    const first = seededShuffle(app ? [...versions, APP_VERSION] : versions, group);
    const orders = [first, [...first].reverse()];

    return orders.map((order, i) => ({ own, order, pass: (i + 1) as 1 | 2, key: rankKey(own[0]?.model ?? "", own[0]?.source.id ?? "", i + 1) }));
  }).filter(({ key }) => !store.rankings[key]?.result);
}

function writeSection(store: JudgeStore, units: readonly Unit[], versions: readonly string[]) {
  const previous = existsSync(REPORT_URL) ? readFileSync(REPORT_URL, "utf8") : "";
  const start = previous.indexOf(`\n${JUDGE_MARKER}\n`);
  const head = start === -1 ? `${previous.trimEnd()}\n\n` : previous.slice(0, start + 1);
  const factsAt = start === -1 ? -1 : previous.indexOf(JUDGE_FACTS_MARKER);
  const facts = factsAt === -1 ? `${JUDGE_FACTS_MARKER}\n\n(pending)\n` : previous.slice(factsAt);
  const models = [...new Set(units.map((u) => u.model))];

  writeFileSync(REPORT_URL, head + renderJudgeSection(store, units, models, versions, facts));
}

async function main() {
  assertLocalDbTarget(process.env.DATABASE_URL);

  const versions = readdirSync(PROMPT_DIR).filter((f) => /^business-cards-.*\.prompt\.txt$/.test(f)).sort().map((f) => f.replace(/^business-cards-/, "").replace(/\.prompt\.txt$/, ""));
  const sources = pickSources(await loadSources()).slice(0, BUSINESS_SOURCE_COUNT);
  const units = collectUnits(readFullStore(RESULTS_URL), sources, versions);
  const store = readJudgeStore(JUDGE_URL);
  const cards = pendingCards(units, store);
  const ranks = rankingJobs(units, versions, store);
  const cardIn = cards.reduce((sum, { unit, card }) => sum + Math.ceil((PROMPT_OVERHEAD_CHARS + unit.source.text.length + JSON.stringify(card).length) / CHARS_PER_TOKEN), 0);
  const rankIn = ranks.reduce((sum, { own }) => sum + Math.ceil((PROMPT_OVERHEAD_CHARS + (own[0]?.source.text.length ?? 0) + own.reduce((s, u) => s + (u.analysis?.cards.length ?? 0) * 700, 0)) / CHARS_PER_TOKEN), 0);
  const estimate = costOf(cardIn + rankIn, cards.length * CARD_OUTPUT_TOKENS + ranks.length * RANK_OUTPUT_TOKENS);
  const spent = totalJudgeCost(store);

  console.log(`judge: ${JUDGE_MODEL}; models: ${[...new Set(units.map((u) => u.model))].length}; units: ${units.length}`);
  sources.forEach((src) => console.log(`source ${src.id}: ${src.subjectPath}, ${src.totalWords} words, starts: ${src.text.slice(0, 50)}`));
  console.log(`card scorings to run: ${cards.length}; set rankings to run: ${ranks.length}`);
  console.log(`estimated cost: about $${estimate.toFixed(4)} (already spent on judging: $${spent.toFixed(4)})`);

  if (!process.argv.includes("--run") || process.env.EVAL_REAL_MODEL !== "1") {
    console.log("not run: this calls a real model. Pass --run and set EVAL_REAL_MODEL=1 to run it.");
    await closeDb();

    return;
  }

  if (spent + estimate > MAX_TOTAL_COST_USD) {
    throw new Error("estimated cost exceeds the cap, aborting");
  }

  const agent = new Agent({ id: "eval-business-cards-judge", name: "Eval Business Cards Judge", instructions: "", model: dynamicKnowledgeItemModel(loadEnv()) });

  for (const { unit, card, key, cardIndex } of cards) {
    const reply = await judgeCall(agent, buildCardPrompt(unit.source.text, card), cardJudgeSchema);

    store.cards[key] = { model: unit.model, version: unit.version, sourceId: unit.source.id, cardIndex, judgement: reply.value, failure: reply.failure, inputTokens: reply.inputTokens, outputTokens: reply.outputTokens, costUsd: reply.costUsd };
    writeJudgeStore(JUDGE_URL, store);
  }

  for (const { own, order, pass, key } of ranks) {
    const sets: AnonymousSet[] = order.map((version, i) => {
      const unit = own.find((u) => u.version === version);

      return { label: LABELS[i] ?? "A", cards: unit?.analysis?.cards ?? [], note: unit?.skippedNote ?? "" };
    });
    const reply = await judgeCall(agent, buildRankingPrompt(own[0]?.source.text ?? "", sets), rankingSchema);
    const valid = reply.value && new Set(reply.value.ranking).size === sets.length && reply.value.ranking.every((l) => l.charCodeAt(0) - 65 < sets.length) ? reply.value : null;

    store.rankings[key] = { model: own[0]?.model ?? "", sourceId: own[0]?.source.id ?? "", pass, order, result: valid, failure: valid ? null : (reply.failure ?? "ranking repeats a set"), inputTokens: reply.inputTokens, outputTokens: reply.outputTokens, costUsd: reply.costUsd };
    writeJudgeStore(JUDGE_URL, store);
  }

  writeSection(store, units, [...versions, APP_VERSION]);
  console.log(`done; judge spend $${totalJudgeCost(store).toFixed(4)}`);
  await closeDb();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : "failed");
  process.exit(1);
});
