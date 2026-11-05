import { log } from "../shared/log.js";

let running = false;

export function retryHeldAskAiRepliesInBackground(): void {
  if (running) {
    return;
  }

  running = true;
  void import("./ask-ai-chat.orchestrator.js")
    .then(({ retryHeldAskAiReplies }) => retryHeldAskAiReplies())
    .catch((err) => log.warn({ err }, "ask_ai_chat_retry_failed"))
    .finally(() => {
      running = false;
    });
}
