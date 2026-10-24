import { sql } from "drizzle-orm";
import type { DbExecutor } from "./client.js";

export const MIN_EF_SEARCH = 100;
export const SUBJECT_FILTERED_EF_SEARCH = 400;
export const MAX_EF_SEARCH = 1000;

export function efSearchFor(topK: number, subjectFiltered = false): number {
  const floor = subjectFiltered ? SUBJECT_FILTERED_EF_SEARCH : MIN_EF_SEARCH;

  return Math.min(MAX_EF_SEARCH, Math.max(floor, topK));
}

export async function applyEfSearch(tx: DbExecutor, topK: number, subjectFiltered = false): Promise<void> {
  await tx.execute(sql`SELECT set_config('hnsw.ef_search', ${String(efSearchFor(topK, subjectFiltered))}, true)`);
}
