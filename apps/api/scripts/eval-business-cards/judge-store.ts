import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { analyseResponse, type Analysis } from "./analyse-cards.ts";
import { BASELINE_MODEL_ID, type FullStore } from "./cheap-models.ts";
import type { CardJudgement, RankingJudgement } from "./judge-prompts.ts";
import type { EvalSource } from "./load-sources.ts";

interface Usage {
  failure: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number;
}

export interface CardEntry extends Usage {
  model: string;
  version: string;
  sourceId: string;
  cardIndex: number;
  judgement: CardJudgement | null;
}

export interface RankEntry extends Usage {
  model: string;
  sourceId: string;
  pass: 1 | 2;
  order: string[];
  result: RankingJudgement | null;
}

export interface JudgeStore {
  cards: Record<string, CardEntry>;
  rankings: Record<string, RankEntry>;
}

export interface Unit {
  model: string;
  version: string;
  source: EvalSource;
  analysis: Analysis | null;
  skippedNote: string;
}

export function readJudgeStore(url: URL): JudgeStore {
  return existsSync(url) ? (JSON.parse(readFileSync(url, "utf8")) as JudgeStore) : { cards: {}, rankings: {} };
}

export function writeJudgeStore(url: URL, store: JudgeStore): void {
  writeFileSync(url, JSON.stringify(store, null, 2));
}

export const APP_MODEL = "app-pipeline";
export const APP_VERSION = "existing";
const EXISTING_CARDS_LIMIT = 5;

function appUnit(source: EvalSource): Unit {
  const cards = source.bits.slice(0, EXISTING_CARDS_LIMIT).flatMap((bit) => {
    const variant = bit.variants[0];

    return variant ? [{ type: "basic" as const, front: variant.prompt, back: variant.answer, context: "", example: "", tags: [], source_quote: "", quoteVerbatim: false, frontWords: 0, backWords: 0, metaWords: [], clozeCount: 0 }] : [];
  });

  return { model: APP_MODEL, version: APP_VERSION, source, skippedNote: "", analysis: { jsonOk: true, fenceNeeded: false, schemaOk: true, error: null, skippedNote: "", droppedIdeas: null, cards } };
}

export function collectUnits(full: FullStore, sources: readonly EvalSource[], versions: readonly string[]): Unit[] {
  const stores: [string, FullStore["baseline"]][] = [[BASELINE_MODEL_ID, full.baseline], ...Object.entries(full.byModel)];

  const app = sources.map(appUnit).filter((u) => (u.analysis?.cards.length ?? 0) > 0);

  return [...app, ...stores.flatMap(([model, store]) =>
    versions.flatMap((version) =>
      sources.flatMap((source) => {
        const call = store[version]?.[source.id];

        if (!call) {
          return [];
        }

        const analysis = call.raw ? analyseResponse(call.raw, source.text) : null;

        return [{ model, version, source, analysis, skippedNote: analysis?.skippedNote ?? "" }];
      }),
    ),
  )];
}

export const cardKey = (u: Pick<CardEntry, "model" | "version" | "sourceId" | "cardIndex">) => `${u.model}|${u.version}|${u.sourceId}|${u.cardIndex}`;
export const rankKey = (model: string, sourceId: string, pass: number) => `${model}|${sourceId}|${pass}`;

export function totalJudgeCost(store: JudgeStore): number {
  return [...Object.values(store.cards), ...Object.values(store.rankings)].reduce((sum, e) => sum + e.costUsd, 0);
}
