import { log } from "../shared/log.js";
import { sendChatQueueMessage } from "./knowledge-bit-chat-queue.service.js";
import { clearChatFirstPromptIf, loadChatCardContext } from "./knowledge-bit-chat-queue.repo.js";
import { createChatQueueWebTools } from "./knowledge-bit-chat-queue-web-tools.js";
import { listChatQueueMessages } from "./knowledge-bit-chat-queue-messages.repo.js";

export async function answerFirstChatPrompt(bitId: string): Promise<void> {
  const card = await loadChatCardContext(bitId);

  if (!card?.chatFirstPrompt || card.approvalState !== "chat") {
    return;
  }

  if ((await listChatQueueMessages(bitId)).length > 0) {
    return;
  }

  const webTools = createChatQueueWebTools(bitId, card.sourceUrl);
  const result = await sendChatQueueMessage(
    bitId,
    { clientMessageId: `first-${bitId}`, message: card.chatFirstPrompt },
    { webTools: webTools.deps, getWebUsage: webTools.getUsage, firstPrompt: true },
  );

  if (!result.ok) {
    log.warn({ bitId, error: result.error }, "chat_first_reply_failed");
    await clearChatFirstPromptIf(bitId, card.chatFirstPrompt);
  }
}
