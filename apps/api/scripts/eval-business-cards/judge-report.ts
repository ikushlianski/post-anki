import { CRITERIA, seededShuffle, type Criterion } from "./judge-prompts.ts";
import type { CardEntry, JudgeStore, Unit } from "./judge-store.ts";
import { totalJudgeCost } from "./judge-store.ts";

export const JUDGE_MARKER = "## AI judge";
export const JUDGE_FACTS_MARKER = "### Facts observed (judge)";
const LOWEST_LIMIT = 10;
const CALIBRATION_SIZE = 12;

function cell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");
}

function mean(values: readonly number[]): string {
  return values.length === 0 ? "n/a" : (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2);
}

function scored(store: JudgeStore): CardEntry[] {
  return Object.values(store.cards).filter((entry) => entry.judgement);
}

function scoreRow(label: string, entries: readonly CardEntry[]): string {
  const cols = CRITERIA.map((c: Criterion) => mean(entries.map((e) => e.judgement?.[c].score ?? 0)));
  const keep = entries.filter((e) => e.judgement?.keep.answer === "yes").length;

  return `| ${label} | ${entries.length} | ${cols.join(" | ")} | ${mean(entries.map((e) => e.judgement?.overall.score ?? 0))} | ${keep}/${entries.length} |`;
}

function scoreTables(store: JudgeStore, models: readonly string[], versions: readonly string[]): string[] {
  const entries = scored(store);
  const head = [`| Group | Cards judged | ${CRITERIA.join(" | ")} | overall | keep = yes |`, `|---|---|${CRITERIA.map(() => "---").join("|")}|---|---|`];
  const lines = ["### Mean scores per prompt version (1-5)", "", "Pooled over all models", "", ...head, ...versions.map((v) => scoreRow(v, entries.filter((e) => e.version === v))), "", "Per model", "", ...head];

  for (const model of models) {
    for (const version of versions) {
      const own = entries.filter((e) => e.model === model && e.version === version);

      if (own.length > 0) {
        lines.push(scoreRow(`${model} / ${version}`, own));
      }
    }
  }

  return [...lines, ""];
}

function rankingTables(store: JudgeStore, versions: readonly string[]): string[] {
  const rankings = Object.values(store.rankings).filter((r) => r.result);
  const wins = new Map<string, number>();
  const rankSum = new Map<string, number>();
  const seen = new Map<string, number>();
  const bad = new Map<string, number>();

  for (const r of rankings) {
    const byVersion = (label: string) => r.order[label.charCodeAt(0) - 65] ?? "?";

    r.order.forEach((v) => seen.set(v, (seen.get(v) ?? 0) + 1));
    r.result?.ranking.forEach((label, place) => rankSum.set(byVersion(label), (rankSum.get(byVersion(label)) ?? 0) + place + 1));
    wins.set(byVersion(r.result?.ranking[0] ?? "A"), (wins.get(byVersion(r.result?.ranking[0] ?? "A")) ?? 0) + 1);
    r.result?.unacceptable.forEach((label) => bad.set(byVersion(label), (bad.get(byVersion(label)) ?? 0) + 1));
  }

  const pairs = new Map<string, { first?: string[]; second?: string[] }>();

  for (const r of rankings) {
    const key = `${r.model}|${r.sourceId}`;
    const ordered = r.result?.ranking.map((l) => r.order[l.charCodeAt(0) - 65] ?? "?") ?? [];

    pairs.set(key, { ...pairs.get(key), [r.pass === 1 ? "first" : "second"]: ordered });
  }

  const complete = [...pairs.values()].filter((p) => p.first && p.second);
  const sameAll = complete.filter((p) => p.first?.join() === p.second?.join()).length;
  const sameTop = complete.filter((p) => p.first?.[0] === p.second?.[0]).length;

  return [
    "### Set rankings (blind, per model and source, two orders each)",
    "",
    `${rankings.length} rankings parsed. Wins = times a version's set was ranked first; mean place 1 = best; the set from the app pipeline (version existing) is the 5th candidate; unacceptable = times it was named unacceptable.`,
    "",
    "| Version | Wins | Mean place | Named unacceptable |",
    "|---|---|---|---|",
    ...versions.map((v) => `| ${v} | ${wins.get(v) ?? 0} | ${rankSum.has(v) ? ((rankSum.get(v) ?? 0) / (seen.get(v) ?? 1)).toFixed(2) : "n/a"} | ${bad.get(v) ?? 0} |`),
    "",
    `Agreement between the two order-swapped rankings (same model and source): identical full ranking ${sameAll}/${complete.length}; same first place ${sameTop}/${complete.length}.`,
    "",
  ];
}

function lowestCards(store: JudgeStore, textOf: (e: CardEntry) => string): string[] {
  const worst = scored(store).sort((a, b) => (a.judgement?.overall.score ?? 0) - (b.judgement?.overall.score ?? 0)).slice(0, LOWEST_LIMIT);

  return [
    `### Lowest-scoring cards (max ${LOWEST_LIMIT})`,
    "",
    "| Overall | Model | Version | Front | Judge reason |",
    "|---|---|---|---|---|",
    ...worst.map((e) => `| ${e.judgement?.overall.score} | ${e.model} | ${e.version} | ${cell(textOf(e))} | ${cell(e.judgement?.overall.reason ?? "")} |`),
    "",
  ];
}

function calibration(store: JudgeStore, units: readonly Unit[]): string[] {
  const byGroup = new Map<string, CardEntry[]>();

  for (const entry of scored(store)) {
    byGroup.set(`${entry.model}|${entry.version}`, [...(byGroup.get(`${entry.model}|${entry.version}`) ?? []), entry]);
  }

  const groups = seededShuffle([...byGroup.keys()].sort(), "calibration").map((key) => seededShuffle(byGroup.get(key) ?? [], key));
  const picked: CardEntry[] = [];

  for (let round = 0; picked.length < CALIBRATION_SIZE && round < 10; round += 1) {
    for (const group of groups) {
      const entry = group[round];

      if (entry && picked.length < CALIBRATION_SIZE) {
        picked.push(entry);
      }
    }
  }

  const sheet = seededShuffle(picked, "calibration-order");
  const sourceNo = (id: string) => [...new Set(units.map((u) => u.source.id))].indexOf(id) + 1;
  const cardOf = (e: CardEntry) => units.find((u) => u.model === e.model && u.version === e.version && u.source.id === e.sourceId)?.analysis?.cards[e.cardIndex];

  return [
    "### Calibration sheet",
    "",
    "12 cards from the business sources, anonymised and shuffled. Rate each 1-5 overall (1 = unusable, 5 = would keep as is) before looking at the lower table.",
    "",
    "| Id | Source | Type | Front | Back | Context | Example | My rating (1-5) |",
    "|---|---|---|---|---|---|---|---|",
    ...sheet.map((e, i) => {
      const c = cardOf(e);

      return `| C${i + 1} | ${sourceNo(e.sourceId)} | ${c?.type ?? ""} | ${cell(c?.front ?? "")} | ${cell(c?.back ?? "")} | ${cell(c?.context ?? "")} | ${cell(c?.example ?? "")} | |`;
    }),
    "",
    "Judge scores and origin for the sheet above (look only after rating).",
    "",
    "| Id | Model | Version | Judge overall |",
    "|---|---|---|---|",
    ...sheet.map((e, i) => `| C${i + 1} | ${e.model} | ${e.version} | ${e.judgement?.overall.score} |`),
    "",
  ];
}

export function renderJudgeSection(store: JudgeStore, units: readonly Unit[], models: readonly string[], versions: readonly string[], facts: string): string {
  const failures = [...Object.values(store.cards), ...Object.values(store.rankings)].filter((e) => e.failure).length;
  const textOf = (e: CardEntry) => units.find((u) => u.model === e.model && u.version === e.version && u.source.id === e.sourceId)?.analysis?.cards[e.cardIndex]?.front ?? "";
  const all = [...Object.values(store.cards), ...Object.values(store.rankings)];
  const tokens = [all.reduce((s, e) => s + (e.inputTokens ?? 0), 0), all.reduce((s, e) => s + (e.outputTokens ?? 0), 0)];
  const lines = [
    JUDGE_MARKER,
    "",
    "- date: 2026-10-25",
    "- judge: anthropic/claude-haiku-5.5 via OpenRouter, default sampling, prompts in apps/api/scripts/eval-business-cards/judge-prompts.ts",
    `- judge calls: ${Object.keys(store.cards).length} single-card scorings, ${Object.keys(store.rankings).length} set rankings; failed calls: ${failures}; tokens ${tokens[0]} in, ${tokens[1]} out; judge cost $${totalJudgeCost(store).toFixed(5)}`,
    "- persona: a working professional learning business who reviews the cards as spaced-repetition flashcards; criteria and 1/3/5 anchors are in the judge prompt file",
    "- sources judged: the two business sources only (the Business > Common anecdote and the 80/20 text); the English Temporal source is not judged",
    "- 'existing' = the app pipeline's cards already stored for the source (first 5 bits, first question variant of each, as listed under Existing app cards); it is scored as cards and enters each ranking as a 5th anonymous set",
    "- card scoring is blind: the judge sees the source text and one card, with no prompt version or model name; set ranking shows the sets under letters in a seeded order, the second pass uses the reverse order",
    "",
    ...scoreTables(store, models, versions),
    ...rankingTables(store, versions),
    ...lowestCards(store, textOf),
    "### Judge limits",
    "",
    "- The judge is Haiku 5.5, and the baseline cards were also written by Haiku 5.5 (possible self-preference).",
    "- Only 2 short business sources were judged (77 and 120 words); one of them is a personal anecdote.",
    "- The existing app cards are statement-based question variants and were reduced to one question per bit for judging; this changes their shape compared with the original set.",
    "- Each card got one judge pass; the two ranking passes differ only in set order.",
    "- The judge has not been calibrated against the owner's own ratings.",
    "",
    ...calibration(store, units),
  ];

  return [...lines, facts].join("\n");
}

