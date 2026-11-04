// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";

vi.mock("./chat-queue.api", () => ({
  getChatQueueCount: vi.fn(),
}));

import { getChatQueueCount } from "./chat-queue.api";
import { useChatQueueCount } from "./use-chat-queue-count";

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("useChatQueueCount", () => {
  it("should report a fresh count when the refresh works", async () => {
    vi.mocked(getChatQueueCount).mockResolvedValue({ ok: true, data: { count: 3 } } as never);
    const { result } = renderHook(() => useChatQueueCount());

    await waitFor(() => expect(result.current).toEqual({ count: 3, stale: false }));
  });

  it("should flag the old count as stale when the refresh throws", async () => {
    vi.mocked(getChatQueueCount).mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useChatQueueCount());

    await waitFor(() => expect(result.current.stale).toBe(true));
  });

  it("should flag the count as stale when the server answers with a failure", async () => {
    vi.mocked(getChatQueueCount).mockResolvedValue({ ok: false } as never);
    const { result } = renderHook(() => useChatQueueCount());

    await waitFor(() => expect(result.current.stale).toBe(true));
  });
});
