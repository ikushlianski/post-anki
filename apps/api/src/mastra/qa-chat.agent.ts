import { Agent } from "@mastra/core/agent";
import type { RequestContext } from "@mastra/core/request-context";
import { loadEnv } from "../shared/env.js";
import { dynamicResolvedModel } from "./model.js";
import { createQaChatTools, type QaChatToolsDeps } from "./qa-chat-tools.js";

// App-wide AI Q&A (the bottom-right chat panel). Like structure-editor.agent.ts,
// this agent's tools are built dynamically from each `generate()` call's
// `requestContext` — the tools close over that turn's in-memory state (suggested
// sub-topics and web citations the caller reads back after the call) rather than
// being fixed at construction time. Never use Mastra's `clientTools` here: that
// mechanism strips `execute` before sending tools to the model, which is wrong
// for tools executed server-side by Mastra's own loop.
const INSTRUCTIONS = [
  "You are a knowledgeable tutor answering a learner's free-text questions from anywhere in a",
  "learning app.",
  "",
  "You are given the topic or curriculum currently in view (when one is), a compact summary of",
  "the course's existing modules and sub-topics (when a course is in view), and the conversation",
  "so far. Ground your answers in that material when it is relevant; when nothing is in view,",
  "answer from your own knowledge.",
  "",
  "You have two tools, both optional:",
  "- suggestSubtopics: propose new sub-topics (title + one-line rationale) to grow the course.",
  "  READ-ONLY — it only records a proposal the learner must confirm in the UI; it never adds",
  "  anything to their course. Use it only when the learner asks how to grow/expand their course",
  "  and a curriculum is actually in view.",
  "- searchWeb: fetch current, authoritative web information for a question. This is a paid call,",
  "  so use it only when the question needs up-to-date external facts your own knowledge and the",
  "  in-view material cannot supply — never as a routine first step.",
  "",
  "Hard rule on any url you mention in your reply: it MUST be copied verbatim from a searchWeb",
  "result. Never invent, guess, paraphrase, or alter a url, even if it looks plausible — if you",
  "aren't quoting a url a tool actually gave you, don't include one.",
  "",
  "Never claim you created, moved, or changed anything in the learner's course. Suggested",
  "sub-topics are proposals, not actions.",
  "",
  "Reply in plain text, conversational and concise — a chat answer, not a lecture. No markdown",
  "headers.",
].join("\n");

export function createQaChatAgent(): Agent {
  const env = loadEnv();

  return new Agent({
    id: "qa-chat",
    name: "Q&A Chat",
    instructions: INSTRUCTIONS,
    model: dynamicResolvedModel(env),
    tools: ({ requestContext }: { requestContext: RequestContext }) => {
      const deps = requestContext.get("qaChatDeps") as QaChatToolsDeps;

      return createQaChatTools(deps);
    },
  });
}
