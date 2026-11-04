import type { TriageHistoryRow } from "./card-triage-history.repo.js";

export const MEANING_MIN_SIMILARITY = 0.35;
export const MEANING_EMBED_CAP = 100;

export interface RankedHistoryRow {
  row: TriageHistoryRow;
  score: number | null;
  matchedBy: "text" | "meaning" | "both" | null;
}

export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;

    dot += x * y;
    normA += x * x;
    normB += y * y;
  }

  return normA === 0 || normB === 0 ? 0 : dot / Math.sqrt(normA * normB);
}

export function historyRowText(row: TriageHistoryRow): string {
  const text = [row.front, row.back].filter(Boolean).join("\n");

  return text || row.bitBody || "";
}

function byRecency(a: RankedHistoryRow, b: RankedHistoryRow): number {
  return b.row.decidedAt.getTime() - a.row.decidedAt.getTime();
}

export function rankHistoryRows(
  rows: TriageHistoryRow[],
  options: { query: string; useText: boolean; similarities: Map<string, number> | null },
): RankedHistoryRow[] {
  if (!options.query) {
    return rows.map((row) => ({ row, score: null, matchedBy: null }));
  }

  const ranked: RankedHistoryRow[] = [];

  for (const row of rows) {
    const similarity = options.similarities?.get(row.id);
    const text = options.useText && row.textMatch;
    const meaning = similarity !== undefined && similarity >= MEANING_MIN_SIMILARITY;

    if (!text && !meaning) {
      continue;
    }

    ranked.push({
      row,
      score: text ? 1 + Math.max(similarity ?? 0, 0) : (similarity ?? 0),
      matchedBy: text && meaning ? "both" : text ? "text" : "meaning",
    });
  }

  return ranked.sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || byRecency(a, b));
}
