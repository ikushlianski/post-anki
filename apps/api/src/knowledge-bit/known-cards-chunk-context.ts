import { KNOWN_CARDS_MAX_CHUNKS_PER_SOURCE } from "../known-cards/known-cards.config.js";
import { log } from "../shared/log.js";
import type { GenerateItemsDeps } from "./detect-knowledge-bits.types.js";

export async function loadKnownCardsSafely(
  chunk: string,
  context: { knowledgeSourceId: string; chunkIndex: number },
  deps: Pick<GenerateItemsDeps, "loadKnownCards">,
): Promise<string> {
  if (!deps.loadKnownCards || context.chunkIndex >= KNOWN_CARDS_MAX_CHUNKS_PER_SOURCE) {
    return "";
  }

  try {
    return await deps.loadKnownCards(chunk, context);
  } catch (err) {
    log.warn({ err, knowledgeSourceId: context.knowledgeSourceId }, "known_cards_load_failed");

    return "";
  }
}
