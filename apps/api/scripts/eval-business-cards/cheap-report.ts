import { analyseResponse, type Analysis } from "./analyse-cards.ts";
import { BASELINE_MODEL_ID, BASELINE_PRICING, type CheapModel, type FullStore } from "./cheap-models.ts";
import type { EvalSource } from "./load-sources.ts";
import type { Store, VersionRun } from "./render-report.ts";

export const CHEAP_MARKER = "## Cheap model comparison";
export const CHEAP_FACTS_MARKER = "### Facts observed (cheap models)";
const CARD_SOURCE_INDEXES = [0, 1];
const CARDS_VERSION = "patterns";

interface Row {
  model: string;
  version: string;
  runs: VersionRun[];
}

function cyrillicShare(text: string): number {
  const letters = text.match(/\p{L}/gu)?.length ?? 0;

  return letters === 0 ? 0 : (text.match(/[Ѐ-ӿ]/g)?.length ?? 0) / letters;
}

function wrongLanguageCards(run: VersionRun): number {
  const expectRussian = run.call?.language === "Russian";

  return (run.analysis?.cards ?? []).filter((card) => {
    const share = cyrillicShare(`${card.front} ${card.back}`);

    return expectRussian ? share < 0.5 : share > 0.1;
  }).length;
}

function runsOf(store: Store, sources: readonly EvalSource[], version: string): VersionRun[] {
  return sources.flatMap((source) => {
    const call = store[version]?.[source.id];

    if (!call) {
      return [];
    }

    const analysis: Analysis | null = call.raw ? analyseResponse(call.raw, source.text) : null;

    return [{ version, call, analysis, knownRepeats: null }];
  });
}

function cell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");
}

function compactCards(run: VersionRun): string[] {
  if (!run.call || run.call.failure) {
    return [`call failed: ${run.call?.failure ?? "not run"}`, ""];
  }

  if (!run.analysis?.schemaOk) {
    return [`response did not parse: ${run.analysis?.error ?? "unknown"}`, ""];
  }

  const cards = run.analysis.cards.map((c, i) => `${i + 1}. [${c.pattern ?? c.type}] ${cell(c.front)} -> ${cell(c.back) || "(empty)"}${c.quoteVerbatim ? "" : " **[quote not verbatim]**"}`);

  return [`${run.call.inputTokens ?? "?"} in / ${run.call.outputTokens ?? "?"} out tokens, ${cards.length} card(s)${run.analysis.cards.length === 0 ? `; skipped_note: ${cell(run.analysis.skippedNote) || "(empty)"}` : ""}`, "", ...cards, ""];
}

function rowLine(row: Row): string {
  const { runs } = row;
  const cards = runs.flatMap((run) => run.analysis?.cards ?? []);
  const back = cards.length === 0 ? 0 : cards.reduce((sum, card) => sum + card.backWords, 0) / cards.length;
  const failed = runs.filter((run) => run.call?.failure).length;
  const overMax = runs.filter((run) => (run.analysis?.cards.length ?? 0) > (run.call?.maxCards ?? 99)).length;
  const wrong = runs.reduce((sum, run) => sum + wrongLanguageCards(run), 0);
  const cost = runs.reduce((sum, run) => sum + (run.call?.costUsd ?? 0), 0);

  return `| ${row.model} | ${row.version} | ${cards.length} | ${runs.filter((r) => r.analysis?.schemaOk).length}/${runs.length} | ${runs.filter((r) => r.analysis?.fenceNeeded).length} | ${cards.filter((c) => c.quoteVerbatim).length}/${cards.length} | ${back.toFixed(1)} | $${cost.toFixed(5)} | ${failed} | ${overMax} | ${wrong} |`;
}

function per1000(runs: readonly VersionRun[]): string {
  const ok = runs.filter((run) => run.call && !run.call.failure);

  return ok.length === 0 ? "n/a" : `$${((ok.reduce((sum, run) => sum + (run.call?.costUsd ?? 0), 0) / ok.length) * 1000).toFixed(2)}`;
}

export function renderCheapSection(full: FullStore, sources: readonly EvalSource[], versions: readonly string[], models: readonly CheapModel[], facts: string): string {
  const all: [string, Store][] = [[`${BASELINE_MODEL_ID} (baseline)`, full.baseline], ...models.map((m): [string, Store] => [m.id, full.byModel[m.id] ?? {}])];
  const rows = all.flatMap(([model, store]) => versions.map((version) => ({ model, version, runs: runsOf(store, sources, version) }))).filter((row) => row.runs.length > 0);
  const lines = [
    CHEAP_MARKER,
    "",
    "- date: 2026-10-25",
    `- same ${sources.length} sources, same 4 unedited prompt files, one call per source per version, single user message, default sampling, via OpenRouter; baseline rows are the earlier ${BASELINE_MODEL_ID} run (not re-run)`,
    `- prices per million tokens (in/out), checked against the live OpenRouter models list: ${[...models.map((m) => `${m.id} ${m.inputPerMillion}/${m.outputPerMillion}`), `${BASELINE_MODEL_ID} ${BASELINE_PRICING.inputPerMillion}/${BASELINE_PRICING.outputPerMillion}`].join("; ")}`,
    "- cost = returned token usage x list price; a model that returns reasoning tokens is billed for them if the provider counts them in output usage",
    "- wrong lang = cards whose front+back is not in the language the prompt asked for (Cyrillic share under 50% for Russian, over 10% for English)",
    "",
    "### Per model and prompt version (3 calls each)",
    "",
    "| Model | Version | Cards | JSON ok | Fence needed | Quotes verbatim | Avg back words | Cost | Failed calls | Calls over max_cards | Wrong-lang cards |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
    ...rows.map(rowLine),
    "",
    "### Estimated cost per 1000 sources",
    "",
    "Assumption: 1000 sources each like these 3 (49-120 words), one call each with the given prompt version, the mean measured cost per successful call here, no retries, no longer sources.",
    "",
    `| Model | ${versions.join(" | ")} |`,
    `|---|${versions.map(() => "---").join("|")}|`,
    ...all.map(([model, store]) => `| ${model} | ${versions.map((v) => per1000(runsOf(store, sources, v))).join(" | ")} |`),
    "",
    `### Cards for the ${CARDS_VERSION} prompt, per model (front -> back; context, example and quote omitted, see results.json)`,
  ];

  for (const index of CARD_SOURCE_INDEXES) {
    const source = sources[index];

    if (!source) {
      continue;
    }

    lines.push("", `#### Source ${index + 1}: ${source.subjectPath} (${source.totalWords} words)`, "");

    for (const [model, store] of all.slice(1)) {
      const run = runsOf(store, [source], versions.find((v) => v.includes(CARDS_VERSION)) ?? "")[0];

      lines.push(`##### ${model}`, "", ...(run ? compactCards(run) : ["not run", ""]));
    }
  }

  return [...lines, facts].join("\n");
}
