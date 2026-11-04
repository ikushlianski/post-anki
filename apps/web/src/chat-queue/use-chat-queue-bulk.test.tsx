// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";

vi.mock("./chat-queue.api", () => ({
  returnFromChatQueue: vi.fn(),
}));

import { returnFromChatQueue } from "./chat-queue.api";
import { useChatQueueBulk } from "./use-chat-queue-bulk";

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("useChatQueueBulk selection hygiene", () => {
  it("should drop selected ids whose cards left the queue after a refresh", () => {
    const { result } = renderHook(() => useChatQueueBulk(vi.fn()));

    act(() => result.current.pickAll(["a", "b", "c"]));
    act(() => result.current.prune(["b", "c", "d"]));

    expect([...result.current.picked].sort()).toEqual(["b", "c"]);
  });

  it("should keep the same selection object when every selected card is still queued", () => {
    const { result } = renderHook(() => useChatQueueBulk(vi.fn()));

    act(() => result.current.pickAll(["a"]));

    const before = result.current.picked;

    act(() => result.current.prune(["a", "b"]));

    expect(result.current.picked).toBe(before);
  });

  it("should ignore toggles while a bulk move is running", async () => {
    let finish: (value: unknown) => void = () => {};

    vi.mocked(returnFromChatQueue).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }) as never,
    );
    const { result } = renderHook(() => useChatQueueBulk(vi.fn()));

    act(() => result.current.pickAll(["a"]));

    let moveDone: Promise<void> = Promise.resolve();

    act(() => {
      moveDone = result.current.move(["a"]);
    });
    act(() => result.current.toggle("b"));

    expect([...result.current.picked]).toEqual(["a"]);

    await act(async () => {
      finish({ ok: true });
      await moveDone;
    });
    act(() => result.current.toggle("b"));

    expect(result.current.picked.has("b")).toBe(true);
  });
});
