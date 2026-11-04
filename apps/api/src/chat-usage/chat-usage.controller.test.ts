import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./chat-usage.repo.js", () => ({ getChatUsageTotals: vi.fn() }));
vi.mock("../llm-call-events/llm-call-events.repo.js", () => ({
  countRecentLlmCallEventsByOp: vi.fn(),
}));
vi.mock("../shared/spend-guard.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../shared/spend-guard.js")>()),
  assertLlmBudgetAvailable: vi.fn(),
}));
vi.mock("../knowledge-bit/knowledge-bit-chat-queue.service.js", () => ({
  CHAT_QUEUE_HOURLY_CAP: 60,
  CHAT_QUEUE_REPLY_OP: "knowledge_bit_chat_queue_reply",
}));

import { countRecentLlmCallEventsByOp } from "../llm-call-events/llm-call-events.repo.js";
import { LlmBudgetExceededError, assertLlmBudgetAvailable } from "../shared/spend-guard.js";
import { handleGetChatUsage } from "./chat-usage.controller.js";
import { getChatUsageTotals } from "./chat-usage.repo.js";

function fakeRes() {
  const res = { writeHead: vi.fn(), end: vi.fn() };

  return res as unknown as http.ServerResponse & typeof res;
}

function bodyOf(res: ReturnType<typeof fakeRes>) {
  return JSON.parse(res.end.mock.calls[0]?.[0] as string);
}

describe("handleGetChatUsage", () => {
  beforeEach(() => {
    vi.mocked(getChatUsageTotals).mockResolvedValue({
      calls: 7,
      inputTokens: 1200,
      outputTokens: 300,
    });
    vi.mocked(countRecentLlmCallEventsByOp).mockResolvedValue(4);
    vi.mocked(assertLlmBudgetAvailable).mockReset();
  });

  it("should report today's totals, the hourly cap and ok when the budget guard allows calls", async () => {
    const res = fakeRes();

    await handleGetChatUsage(res);

    expect(res.writeHead.mock.calls[0]?.[0]).toBe(200);
    expect(bodyOf(res)).toMatchObject({
      calls: 7,
      inputTokens: 1200,
      outputTokens: 300,
      hourlyCap: 60,
      currentHourCount: 4,
      budgetStatus: "ok",
    });
  });

  it("should report paused when the daily spend guard refuses calls", async () => {
    vi.mocked(assertLlmBudgetAvailable).mockRejectedValue(new LlmBudgetExceededError(5, 5));
    const res = fakeRes();

    await handleGetChatUsage(res);

    expect(bodyOf(res).budgetStatus).toBe("paused");
  });
});
