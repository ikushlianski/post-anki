import { parseOrderedListText } from "@post-anki/shared";
import { normalizeForQuoteMatch } from "./knowledge-bit-source-quote.js";

export function isValidAiOrderedList(listText: string, sourceText: string): boolean {
  const parsed = parseOrderedListText(listText);

  if (!parsed.ok) {
    return false;
  }

  const source = normalizeForQuoteMatch(sourceText);

  return parsed.list.steps.every((step) => source.includes(normalizeForQuoteMatch(step)));
}
