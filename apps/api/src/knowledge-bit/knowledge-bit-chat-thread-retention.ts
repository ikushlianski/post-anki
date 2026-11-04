import { createHourlyPurge } from "../auth/purge-expired-auth-rows.js";
import { deleteChatThreadsOfDecidedCards } from "./knowledge-bit-chat-queue-messages.repo.js";

export const sweepDecidedChatThreadsHourly = createHourlyPurge(async () => {
  await deleteChatThreadsOfDecidedCards();
});
