import type http from "node:http";
import type { ChatUsage } from "@post-anki/shared";
import { countRecentLlmCallEventsByOp } from "../llm-call-events/llm-call-events.repo.js";
import {
  CHAT_QUEUE_HOURLY_CAP,
  CHAT_QUEUE_REPLY_OP,
} from "../knowledge-bit/knowledge-bit-chat-queue.service.js";
import { sendJson } from "../shared/http.js";
import {
  LlmBudgetCheckUnavailableError,
  LlmBudgetExceededError,
  assertLlmBudgetAvailable,
} from "../shared/spend-guard.js";
import { getChatUsageTotals } from "./chat-usage.repo.js";

const HOUR_MS = 60 * 60 * 1000;

async function budgetStatus(): Promise<ChatUsage["budgetStatus"]> {
  try {
    await assertLlmBudgetAvailable();

    return "ok";
  } catch (err) {
    if (err instanceof LlmBudgetExceededError || err instanceof LlmBudgetCheckUnavailableError) {
      return "paused";
    }

    throw err;
  }
}

export async function handleGetChatUsage(res: http.ServerResponse): Promise<void> {
  const now = new Date();
  const [totals, currentHourCount, status] = await Promise.all([
    getChatUsageTotals(CHAT_QUEUE_REPLY_OP, now),
    countRecentLlmCallEventsByOp(CHAT_QUEUE_REPLY_OP, HOUR_MS),
    budgetStatus(),
  ]);

  const body: ChatUsage = {
    day: now.toISOString().slice(0, 10),
    ...totals,
    hourlyCap: CHAT_QUEUE_HOURLY_CAP,
    currentHourCount,
    budgetStatus: status,
  };

  sendJson(res, 200, body);
}
