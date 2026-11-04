import type { ReplyDecision } from "../conversation/reply.js";
import { DECLINE_REPLY } from "../conversation/reply.js";
import type { HandlerDeps } from "./webhook.handler.js";

export async function dispatchCommand(
  decision: ReplyDecision,
  chatId: number,
  deps: HandlerDeps,
): Promise<boolean> {
  const decline = () => deps.sendMessage(chatId, DECLINE_REPLY);

  if (decision.kind === "study") {
    await (deps.onStudy ? deps.onStudy(chatId, decision.name) : decline());

    return true;
  }

  if (decision.kind === "continue") {
    if (decision.tool) {
      await (deps.onStudy ? deps.onStudy(chatId, decision.tool) : decline());
    } else {
      await (deps.onStart ? deps.onStart(chatId) : decline());
    }

    return true;
  }

  if (decision.kind === "chat") {
    await (deps.onChat ? deps.onChat(chatId, decision.arg) : decline());

    return true;
  }

  if (decision.kind === "digest") {
    await (deps.onDigest ? deps.onDigest(chatId) : decline());

    return true;
  }

  if (decision.kind === "rejected") {
    await (deps.onRejected ? deps.onRejected(chatId, decision.arg) : decline());

    return true;
  }

  if (decision.kind === "inbox") {
    await (deps.onInbox ? deps.onInbox(chatId) : decline());

    return true;
  }

  if (decision.kind === "find") {
    await (deps.onFind ? deps.onFind(chatId, decision.arg) : decline());

    return true;
  }

  if (decision.kind === "pause") {
    await (deps.onPause ? deps.onPause(chatId, decision.arg) : decline());

    return true;
  }

  if (decision.kind === "resume") {
    await (deps.onResume ? deps.onResume(chatId) : decline());

    return true;
  }

  if (decision.kind === "streak") {
    await (deps.onStreak ? deps.onStreak(chatId) : decline());

    return true;
  }

  return false;
}
