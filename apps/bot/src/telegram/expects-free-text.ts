import type { ReplyDecision } from "../conversation/reply.js";
import type { FlowDeps } from "../conversation/probe-flow.js";
import type { ChatContextLike } from "./webhook.handler.js";

export async function expectsFreeText(
  chatId: number,
  context: ChatContextLike | null,
  flow: FlowDeps,
): Promise<boolean> {
  if (context !== null && context.mode !== "idle") return true;

  return (await flow.getPending(chatId)) !== null;
}

export async function resolveUnknownCommand(
  chatId: number,
  context: ChatContextLike | null,
  flow: FlowDeps,
  text: string,
): Promise<ReplyDecision> {
  return (await expectsFreeText(chatId, context, flow))
    ? { kind: "process", text }
    : { kind: "unknown_command" };
}
