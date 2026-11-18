import { getDb } from "../db/client.js";
import { log } from "../shared/log.js";
import { BUDGET_PAUSED_REPLY, MODEL_FAILED_REPLY } from "./chat-queue-failure-replies.js";
import { clearChatFirstPrompt, lockChatFirstPrompt, lockChatState } from "./knowledge-bit-chat-queue.repo.js";
import { insertChatTurn } from "./knowledge-bit-chat-queue-messages.repo.js";

export async function saveFirstPromptFailure(
  bitId: string,
  prompt: string,
  error: "model_failed" | "budget_paused",
): Promise<void> {
  try {
    await getDb().transaction(async (tx) => {
      if ((await lockChatState(tx, bitId)) !== "chat" || (await lockChatFirstPrompt(tx, bitId)) !== prompt) {
        return;
      }

      await clearChatFirstPrompt(tx, bitId);
      await insertChatTurn(
        bitId,
        {
          clientMessageId: `first-${bitId}`,
          userText: prompt,
          assistantText: error === "budget_paused" ? BUDGET_PAUSED_REPLY : MODEL_FAILED_REPLY,
          modelId: null,
          inputTokens: null,
          outputTokens: null,
        },
        tx,
      );
    });
  } catch (err) {
    log.warn({ err, bitId }, "chat_first_reply_failure_save_failed");
  }
}
