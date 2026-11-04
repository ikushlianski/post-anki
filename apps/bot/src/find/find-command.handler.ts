import type { SearchResponse } from "@post-anki/shared";
import { log } from "../telegram/log.js";
import { FIND_USAGE_REPLY, formatFindReply, normalizeFindQuery } from "./find-command.js";

export const FIND_UNREACHABLE_REPLY = "Couldn't search right now — try again in a moment.";

export interface FindCommandDeps {
  search: (query: string) => Promise<SearchResponse>;
  sendMessage: (chatId: number, text: string) => Promise<void>;
  webBaseUrl?: string;
}

export async function handleFindCommand(chatId: number, arg: string | null, deps: FindCommandDeps): Promise<void> {
  const query = normalizeFindQuery(arg);

  if (!query) {
    await deps.sendMessage(chatId, FIND_USAGE_REPLY);

    return;
  }

  let result: SearchResponse;

  try {
    result = await deps.search(query);
  } catch (err) {
    log.error({ err, chat_id: chatId }, "find_command_fetch_failed");
    await deps.sendMessage(chatId, FIND_UNREACHABLE_REPLY);

    return;
  }

  await deps.sendMessage(chatId, formatFindReply(query, result, deps.webBaseUrl));
}
