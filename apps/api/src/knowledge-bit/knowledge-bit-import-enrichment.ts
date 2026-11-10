import { MAX_CARD_SOURCES } from "@post-anki/shared";
import { isSafeSourceUrl } from "@post-anki/core";
import { log } from "../shared/log.js";
import { createKnowledgeBitWebTools, type KnowledgeBitWebTools } from "./knowledge-bit-web-tools.deps.js";
import { hasInjectedMarkup } from "./knowledge-bit-source-item-markup-guard.js";
import type { LessonDraft } from "./knowledge-bit-source-item-validation.js";

export const IMPORT_ENRICH_SEARCHES_PER_CHUNK = 2;
export const IMPORT_ENRICH_MAX_CHUNKS = 2;

const EXAMPLE_MAX_CHARS = 200;
const EXAMPLE_MIN_SENTENCE_CUT = 100;
const SENTENCE_END = /[.!?]/g;

export function importEnrichBudget(ankiImport: boolean | undefined, chunkIndex: number): number {
  return ankiImport && chunkIndex < IMPORT_ENRICH_MAX_CHUNKS ? IMPORT_ENRICH_SEARCHES_PER_CHUNK : 0;
}

export function cutExampleText(text: string): string {
  if (text.length <= EXAMPLE_MAX_CHARS) {
    return text.trim();
  }

  const head = text.slice(0, EXAMPLE_MAX_CHARS);
  let sentenceCut = -1;

  for (const match of head.matchAll(SENTENCE_END)) {
    const after = text.charAt(match.index + 1);

    if (after === "" || /\s/.test(after)) {
      sentenceCut = match.index + 1;
    }
  }

  if (sentenceCut > EXAMPLE_MIN_SENTENCE_CUT) {
    return head.slice(0, sentenceCut).trim();
  }

  const nextIsSpace = /\s/.test(text.charAt(EXAMPLE_MAX_CHARS));
  const wordCut = nextIsSpace ? head.length : head.search(/\s\S*$/);

  return (wordCut > 0 ? head.slice(0, wordCut) : head).trim();
}

async function enrichOne(item: LessonDraft, tools: KnowledgeBitWebTools): Promise<LessonDraft> {
  try {
    const found = await tools.deps.searchWeb(item.statement);
    const example = cutExampleText(found.text.trim());
    const webSources = found.citations.filter((url) => isSafeSourceUrl(url).allowed).slice(0, MAX_CARD_SOURCES);

    if (example.length === 0 || webSources.length === 0 || hasInjectedMarkup([example], item.statement)) {
      return item;
    }

    return { ...item, example, webSources };
  } catch (err) {
    log.warn({ err }, "knowledge_bit_import_enrichment_failed");

    return item;
  }
}

export async function enrichImportedItems(items: readonly LessonDraft[], budget: number): Promise<LessonDraft[]> {
  const tools = createKnowledgeBitWebTools({
    knowledgeBitId: "import-enrichment",
    searchOp: "knowledge_bit_import_enrichment",
    searchPurpose: "Give one short real-world example or nearby fact, at most two sentences, in the language of the query",
    maxSearches: budget,
    forceTier: "cheap",
  });
  const enriched: LessonDraft[] = [];

  for (const item of items) {
    const needsExample = item.example === null && tools.getUsage().searches < budget;

    enriched.push(needsExample ? await enrichOne(item, tools) : item);
  }

  return enriched;
}
