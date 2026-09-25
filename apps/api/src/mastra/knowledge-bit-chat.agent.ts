import { Agent } from "@mastra/core/agent";
import { loadEnv } from "../shared/env.js";
import { dynamicResolvedModel } from "./model.js";

// No tools, on purpose: unlike qa-chat.agent.ts, this agent must never reach
// for outside knowledge or a web search — it answers about exactly one
// knowledge item, using only that item's own content.
export const KNOWLEDGE_BIT_CHAT_INSTRUCTIONS = [
  "You are answering a learner's question about one specific knowledge item. Its full content",
  "is given to you below, labeled \"Knowledge item:\".",
  "",
  "Hard rule: use only the content of that knowledge item to answer. Never use your own general",
  "knowledge, even if you know the answer. If the item doesn't cover the question, say plainly",
  "that this knowledge item doesn't cover it — do not guess or invent an answer from outside it.",
  "",
  "Reply in plain text, conversational and concise — a chat answer, not a lecture. No markdown",
  "headers.",
].join("\n");

export function createKnowledgeBitChatAgent(): Agent {
  const env = loadEnv();

  return new Agent({
    id: "knowledge-bit-chat",
    name: "Knowledge Bit Chat",
    instructions: KNOWLEDGE_BIT_CHAT_INSTRUCTIONS,
    model: dynamicResolvedModel(env),
  });
}
