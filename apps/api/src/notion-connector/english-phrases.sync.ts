import { log } from "../shared/log.js";
import { newResult, type EnglishPhrasesDeps, type EnglishPhrasesOptions, type EnglishPhrasesResult } from "./english-phrases.types.js";
import { walkAndImport } from "./english-phrases.walker.js";

export type {
  EnglishPhrasesDeps,
  EnglishPhrasesOptions,
  EnglishPhrasesResult,
  FiledNote,
  ImportLogEntry,
  NoteCounts,
} from "./english-phrases.types.js";
export { isNotionAccessError, NOTION_ACCESS_HELP, NotionAccessError } from "./notion-access.error.js";

export async function importEnglishPhrases(
  deps: EnglishPhrasesDeps,
  options: EnglishPhrasesOptions,
): Promise<EnglishPhrasesResult> {
  const result = newResult(options);

  await walkAndImport(deps, options, result);

  if (!options.dryRun) {
    log.info(result, "notion_english_phrases_done");
  }

  return result;
}
