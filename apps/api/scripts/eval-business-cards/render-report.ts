import { countWords, type Analysis, type AnalysedCard } from "./analyse-cards.ts";
import type { EvalSource } from "./load-sources.ts";

export interface StoredCall {
  raw: string | null;
  failure: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number;
  maxCards: number;
  language: string;
  knownFronts: string[];
}

export type Store = Record<string, Record<string, StoredCall>>;

export interface VersionRun {
  version: string;
  call: StoredCall | null;
  analysis: Analysis | null;
  knownRepeats: number | null;
}

export const EXISTING_CARDS_LIMIT = 5;

function cell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");
}

function excerpt(text: string): string {
  return text.split(/\s+/).slice(0, 45).join(" ") + " ...";
}

function stats(runs: readonly VersionRun[]) {
  const cards = runs.flatMap((run) => run.analysis?.cards ?? []);
  const parsed = runs.filter((run) => run.analysis?.schemaOk).length;

  return {
    cards,
    parsed,
    calls: runs.length,
    verbatim: cards.filter((card) => card.quoteVerbatim).length,
    avgBack: cards.length === 0 ? 0 : cards.reduce((sum, card) => sum + card.backWords, 0) / cards.length,
    avgFront: cards.length === 0 ? 0 : cards.reduce((sum, card) => sum + card.frontWords, 0) / cards.length,
    meta: cards.filter((card) => card.metaWords.length > 0).length,
    cost: runs.reduce((sum, run) => sum + (run.call?.costUsd ?? 0), 0),
  };
}

function statsRow(label: string, runs: readonly VersionRun[]): string {
  const s = stats(runs);

  return `| ${label} | ${s.cards.length} | ${s.parsed}/${s.calls} | ${s.verbatim}/${s.cards.length} | ${s.avgFront.toFixed(1)} | ${s.avgBack.toFixed(1)} | ${s.meta} | $${s.cost.toFixed(5)} |`;
}

export function comparisonTable(sources: readonly EvalSource[], versions: readonly string[], runs: Map<string, VersionRun>): string[] {
  const head = ["| Source | Version | Cards | JSON ok | Quotes verbatim | Avg front words | Avg back words | Meta-word fronts | Cost |", "|---|---|---|---|---|---|---|---|---|"];
  const rows: string[] = [];

  sources.forEach((source, index) => {
    for (const version of versions) {
      const run = runs.get(`${version}|${source.id}`);

      if (!run) {
        continue;
      }

      const s = stats([run]);

      rows.push(`| ${index + 1}. ${cell(source.subjectPath)} | ${version} | ${s.cards.length} | ${run.analysis?.schemaOk ? "yes" : "no"}${run.analysis?.fenceNeeded ? " (fence)" : ""} | ${s.verbatim}/${s.cards.length} | ${s.avgFront.toFixed(1)} | ${s.avgBack.toFixed(1)} | ${s.meta} | $${s.cost.toFixed(5)} |`);
    }
  });

  const total = ["| Version | Cards | JSON ok | Quotes verbatim | Avg front words | Avg back words | Meta-word fronts | Cost |", "|---|---|---|---|---|---|---|---|"];

  for (const version of versions) {
    const own = [...runs.values()].filter((run) => run.version === version);

    total.push(statsRow(version, own));
  }

  return ["### Per source", "", ...head, ...rows, "", "### Totals per version", "", ...total, ""];
}

export function extraMetrics(versions: readonly string[], runs: Map<string, VersionRun>): string[] {
  const lines = ["### Version-specific counts", ""];

  for (const version of versions) {
    const own = [...runs.values()].filter((run) => run.version === version && run.analysis?.schemaOk);
    const cards = own.flatMap((run) => run.analysis?.cards ?? []);
    const dropped = own.flatMap((run) => run.analysis?.droppedIdeas ?? []);
    const patterns = new Map<string, number>();

    cards.forEach((card) => patterns.set(card.pattern ?? "(none)", (patterns.get(card.pattern ?? "(none)") ?? 0) + 1));

    const types = ["basic", "cloze"].map((type) => `${type} ${cards.filter((card) => card.type === type).length}`).join(", ");
    const parts = [`types: ${types}`];

    if (own.some((run) => run.analysis?.droppedIdeas)) {
      parts.push(`dropped_ideas total ${dropped.length}`);
    }

    if (patterns.size > 0 && !patterns.has("(none)")) {
      parts.push(`patterns: ${[...patterns].map(([name, n]) => `${name} ${n}`).join(", ")}; definition cards ${patterns.get("definition") ?? 0}`);
    }

    if (own.some((run) => run.knownRepeats !== null)) {
      parts.push(`cards repeating a known front: ${own.reduce((sum, run) => sum + (run.knownRepeats ?? 0), 0)} (known fronts supplied: ${own.reduce((sum, run) => sum + (run.call?.knownFronts.length ?? 0), 0)})`);
    }

    lines.push(`- ${version}: ${parts.join("; ")}`);
  }

  return [...lines, ""];
}

function cardBlock(card: AnalysedCard, index: number): string[] {
  const mark = card.quoteVerbatim ? "" : " **[NOT VERBATIM]**";
  const pattern = card.pattern ? [`   - pattern: ${card.pattern}`] : [];

  return [
    `${index + 1}. type: ${card.type}`,
    `   - front: ${cell(card.front)}`,
    `   - back: ${cell(card.back) || "(empty)"}`,
    `   - context: ${cell(card.context) || "(empty)"}`,
    `   - example: ${cell(card.example) || "(empty)"}`,
    ...pattern,
    `   - source_quote: ${cell(card.source_quote) || "(empty)"}${mark}`,
  ];
}

export function versionBlock(run: VersionRun): string[] {
  const { call, analysis } = run;
  const lines = [`### ${run.version}`, ""];

  if (!call || call.failure) {
    return [...lines, `Call failed: ${call?.failure ?? "not run"}`, ""];
  }

  lines.push(`tokens: ${call.inputTokens ?? "?"} in, ${call.outputTokens ?? "?"} out; max_cards ${call.maxCards}; cost $${call.costUsd.toFixed(5)}`, "");

  if (!analysis?.schemaOk) {
    return [...lines, `Response did not parse: ${analysis?.error ?? "unknown"}`, "", "```", (call.raw ?? "").slice(0, 3000), "```", ""];
  }

  lines.push(...analysis.cards.flatMap(cardBlock), "", `skipped_note: ${analysis.skippedNote || "(empty)"}`);

  if (analysis.droppedIdeas) {
    lines.push("", "dropped_ideas:", ...analysis.droppedIdeas.map((d) => `- ${cell(d.idea)} (${cell(d.reason)})`));
  }

  return [...lines, ""];
}

export function sourceSection(source: EvalSource, index: number, versions: readonly string[], runs: Map<string, VersionRun>): string {
  const first = versions.map((version) => runs.get(`${version}|${source.id}`)?.call).find(Boolean);
  const lines = [
    `## Source ${index + 1}: ${source.subjectPath}`,
    "",
    `- id: ${source.id}${source.url ? `, url: ${source.url}` : ""}`,
    `- words sent: ${countWords(source.text)} of ${source.totalWords}; output language given: ${first?.language ?? "?"}; max cards: ${first?.maxCards ?? "?"}`,
    `- excerpt: "${excerpt(source.text)}"`,
    "",
    ...versions.flatMap((version) => {
      const run = runs.get(`${version}|${source.id}`);

      return run ? versionBlock(run) : [];
    }),
    `### Existing app cards (${Math.min(EXISTING_CARDS_LIMIT, source.bits.length)} of ${source.bits.length} bits)`,
    "",
  ];

  if (source.bits.length === 0) {
    lines.push("(none)", "");
  }

  for (const bit of source.bits.slice(0, EXISTING_CARDS_LIMIT)) {
    lines.push(`- statement: ${cell(bit.statement)}`);
    bit.variants.forEach((variant) => lines.push(`  - [${variant.kind}] ${cell(variant.prompt)} -> ${cell(variant.answer)}`));
  }

  return [...lines, ""].join("\n");
}
