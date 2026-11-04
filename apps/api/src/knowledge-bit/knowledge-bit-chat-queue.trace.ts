export type ChatQueueTraceOutcome = "ok" | "error" | "spend_guard" | "rate_limited" | "in_flight";

export type ChatQueueTraceMetadata = {
  feature: "chat-queue";
  knowledgeBitId: string;
  turn: number;
};

export function buildChatQueueTraceMetadata(bitId: string, userTurnsUsed: number): ChatQueueTraceMetadata {
  return { feature: "chat-queue", knowledgeBitId: bitId, turn: userTurnsUsed + 1 };
}

export function buildChatQueueTracingOptions(metadata: ChatQueueTraceMetadata) {
  return { metadata: { ...metadata }, tags: [metadata.feature] };
}

export function chatQueueOutcomeFor(failure: string | null, rateLimited = false): ChatQueueTraceOutcome {
  if (failure === null) {
    return "ok";
  }

  if (failure === "in_flight") {
    return "in_flight";
  }

  if (failure === "budget_paused") {
    return "spend_guard";
  }

  return rateLimited ? "rate_limited" : "error";
}
