import { Agent } from "@mastra/core/agent";
import { loadEnv } from "../shared/env.js";
import { dynamicResolvedModel } from "./model.js";

// No tools, on purpose: unlike qa-chat.agent.ts, this agent must never reach
// for outside knowledge or a web search by default.
const INSTRUCTIONS = [
  "You are answering a learner's question using only the flashcards they've provided below.",
  "",
  "Hard rule: use only the content of the cards given to you in this prompt. Never use your own",
  "general knowledge to answer, even if you know the answer. If the cards don't cover the",
  "question, say plainly that the learner's cards don't cover this yet — do not guess or invent",
  "an answer from outside the cards.",
  "",
  "Reply in plain text, conversational and concise — a chat answer, not a lecture. No markdown",
  "headers.",
].join("\n");

export function createGlobalCardChatAgent(): Agent {
  const env = loadEnv();

  return new Agent({
    id: "global-card-chat",
    name: "Global Card Chat",
    instructions: INSTRUCTIONS,
    model: dynamicResolvedModel(env),
  });
}
