import { RequestContext } from "@mastra/core/request-context";
import { CHAT_MODEL_CONTEXT_KEY } from "@post-anki/shared";
import {
  CHAT_QUEUE_FALLBACK_CONTEXT_KEY,
  CHAT_QUEUE_LIGHT_MODEL_CONTEXT_KEY,
  CHAT_QUEUE_PROPOSAL_TOOLS_CONTEXT_KEY,
  CHAT_QUEUE_SUBJECT_INSTRUCTIONS_CONTEXT_KEY,
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
  modelId?: string;
  sink?: ChatQueueProposalSink;
  allowUpdate: boolean;
  subjectInstructions?: string;
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

  if (input.modelId && !input.fallback) {
    context.push([CHAT_MODEL_CONTEXT_KEY, input.modelId]);
  }

  if (web) {
    context.push([CHAT_QUEUE_WEB_TOOLS_CONTEXT_KEY, web]);
  }

  if (input.subjectInstructions) {
    context.push([CHAT_QUEUE_SUBJECT_INSTRUCTIONS_CONTEXT_KEY, input.subjectInstructions]);
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
