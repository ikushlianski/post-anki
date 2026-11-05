import { log } from "../shared/log.js";
import type { GenerateItemsDeps } from "./detect-knowledge-bits.types.js";

export interface AskAiChatHandle {
  bitId: string;
  reply: () => Promise<void>;
}

export function firstGapText(gaps: Iterable<string | undefined>): string | undefined {
  for (const gap of gaps) {
    if (gap) {
      return gap;
    }
  }

  return undefined;
}

export function firstGapByChunk(gapByChunk: ReadonlyMap<number, string>): string | undefined {
  const first = [...gapByChunk.keys()].sort((a, b) => a - b)[0];

  return first === undefined ? undefined : gapByChunk.get(first);
}

export async function openAskAiChatSafely(
  sourceId: string,
  gapText: string | undefined,
  deps: Pick<GenerateItemsDeps, "openAskAiChat">,
): Promise<AskAiChatHandle | null> {
  if (!gapText || !deps.openAskAiChat) {
    return null;
  }

  try {
    return await deps.openAskAiChat(sourceId, gapText);
  } catch (err) {
    log.warn({ err, knowledgeSourceId: sourceId }, "ask_ai_chat_open_failed");

    return null;
  }
}

export async function replyAskAiChatSafely(handle: AskAiChatHandle | null): Promise<void> {
  if (!handle) {
    return;
  }

  try {
    await handle.reply();
  } catch (err) {
    log.warn({ err, bitId: handle.bitId }, "ask_ai_chat_reply_failed");
  }
}
