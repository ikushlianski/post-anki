import { RequestContext } from "@mastra/core/request-context";
import {
  CHAT_QUEUE_FALLBACK_CONTEXT_KEY,
  CHAT_QUEUE_LIGHT_MODEL_CONTEXT_KEY,
  CHAT_QUEUE_PROPOSAL_TOOLS_CONTEXT_KEY,
  CHAT_QUEUE_WEB_TOOLS_CONTEXT_KEY,
} from "../mastra/knowledge-bit-chat-queue.agent.js";
import type { KnowledgeBitChatToolsDeps } from "../mastra/knowledge-bit-chat-tools.js";
import type { ChatQueueProposalSink } from "./knowledge-bit-chat-queue-proposal-sink.js";

export const CHAT_QUEUE_MAX_STEPS = 7;
export const CHAT_QUEUE_FALLBACK_MAX_STEPS = 3;
export const CHAT_QUEUE_TOKEN_CEILING = 60_000;

export interface ChatQueueRunInput {
  fallback: boolean;
  webTools?: KnowledgeBitChatToolsDeps;
  lightModel?: boolean;
  sink?: ChatQueueProposalSink;
  allowUpdate: boolean;
}

type StepsWithUsage = {
  steps: ReadonlyArray<{ usage: { totalTokens?: number | undefined } }>;
};

export function tokenCeilingReached({ steps }: StepsWithUsage): boolean {
  return steps.reduce((sum, step) => sum + (step.usage.totalTokens ?? 0), 0) >= CHAT_QUEUE_TOKEN_CEILING;
}

type StepCount = { steps: ReadonlyArray<unknown> };

export function stepLimitReached(limit: number): (state: StepCount) => boolean {
  return ({ steps }) => steps.length >= limit;
}

export function buildChatQueueRunOptions(input: ChatQueueRunInput) {
  const context: [string, unknown][] = [];
  const web = input.fallback ? undefined : input.webTools;

  if (input.fallback) {
    context.push([CHAT_QUEUE_FALLBACK_CONTEXT_KEY, true]);
  }

  if (input.lightModel) {
    context.push([CHAT_QUEUE_LIGHT_MODEL_CONTEXT_KEY, true]);
  }

  if (web) {
    context.push([CHAT_QUEUE_WEB_TOOLS_CONTEXT_KEY, web]);
  }

  if (input.sink) {
    context.push([CHAT_QUEUE_PROPOSAL_TOOLS_CONTEXT_KEY, { sink: input.sink, allowUpdate: input.allowUpdate }]);
  }

  const maxSteps = web ? CHAT_QUEUE_MAX_STEPS : input.sink ? CHAT_QUEUE_FALLBACK_MAX_STEPS : 1;

  return {
    stopWhen: [tokenCeilingReached, stepLimitReached(maxSteps)],
    ...(context.length ? { requestContext: new RequestContext<unknown>(context) } : {}),
  };
}
