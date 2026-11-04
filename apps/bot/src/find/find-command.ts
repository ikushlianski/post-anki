import type { SearchResponse } from "@post-anki/shared";
import { sliceWithoutSplittingPairs } from "../telegram/safe-slice.js";

export const FIND_USAGE_REPLY = "Usage: /find <words>, for example /find kubernetes";
export const FIND_MAX_RESULTS = 5;
export const FIND_LABEL_CHARS = 80;
export const FIND_QUERY_CHARS = 100;

function clipLabel(label: string): string {
  const flat = label.replace(/\s+/g, " ").trim();

  return flat.length > FIND_LABEL_CHARS ? `${sliceWithoutSplittingPairs(flat, FIND_LABEL_CHARS)}…` : flat;
}

export function normalizeFindQuery(arg: string | null): string | null {
  const flat = arg?.replace(/\s+/g, " ").trim();

  if (!flat) return null;

  return sliceWithoutSplittingPairs(flat, FIND_QUERY_CHARS).trim();
}

export function formatFindReply(query: string, result: SearchResponse, webBaseUrl?: string): string {
  const entries = [
    ...result.subjects.map((item) => `📚 ${clipLabel(item.label)}`),
    ...result.curricula.map((item) => `🎓 ${clipLabel(item.label)}`),
    ...result.topics.map((item) => `📝 ${clipLabel(item.label)}`),
  ];

  if (entries.length === 0) return `Nothing found for "${query}".`;

  const shown = entries.slice(0, FIND_MAX_RESULTS);
  const lines = [`Top matches for "${query}":`, ...shown];

  if (entries.length > shown.length) lines.push(`…and ${entries.length - shown.length} more`);

  if (webBaseUrl) lines.push(`${webBaseUrl.replace(/\/+$/, "")}/find`);

  return lines.join("\n");
}
