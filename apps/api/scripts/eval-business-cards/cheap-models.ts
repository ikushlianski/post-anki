import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { Store } from "./render-report.ts";

export interface CheapModel {
  id: string;
  inputPerMillion: number;
  outputPerMillion: number;
}

export const BASELINE_MODEL_ID = "anthropic/claude-haiku-5.5";
export const BASELINE_PRICING = { inputPerMillion: 0.1, outputPerMillion: 0.5 };

export const CHEAP_MODELS: readonly CheapModel[] = [
  { id: "openai/gpt-oss-20b", inputPerMillion: 0.018, outputPerMillion: 0.09 },
  { id: "qwen/qwen3.7-flash", inputPerMillion: 0.03, outputPerMillion: 0.13 },
  { id: "deepseek/deepseek-v4-flash-0731", inputPerMillion: 0.04444, outputPerMillion: 0.13332 },
  { id: "mistralai/mistral-nemo", inputPerMillion: 0.029, outputPerMillion: 0.03 },
  { id: "~z-ai/glm-flash-latest", inputPerMillion: 0.0175, outputPerMillion: 0.1425 },
];

export interface FullStore {
  baseline: Store;
  byModel: Record<string, Store>;
}

export function findCheapModel(id: string): CheapModel {
  const model = CHEAP_MODELS.find((m) => m.id === id);

  if (!model) {
    throw new Error(`--model must be one of: ${CHEAP_MODELS.map((m) => m.id).join(", ")}`);
  }

  return model;
}

export function readFullStore(url: URL): FullStore {
  if (!existsSync(url)) {
    return { baseline: {}, byModel: {} };
  }

  const { byModel, ...baseline } = JSON.parse(readFileSync(url, "utf8")) as Store & { byModel?: Record<string, Store> };

  return { baseline: baseline as Store, byModel: byModel ?? {} };
}

export function writeFullStore(url: URL, full: FullStore): void {
  writeFileSync(url, JSON.stringify({ ...full.baseline, byModel: full.byModel }, null, 2));
}
