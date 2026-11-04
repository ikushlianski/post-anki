// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ChatQueueKnowledgeBit } from "@post-anki/shared";

vi.mock("./chat-queue.api", () => ({
  getChatQueue: vi.fn(),
  getChatQueueThread: vi.fn(),
  returnFromChatQueue: vi.fn(),
  snoozeChatQueueCard: vi.fn(),
  unsnoozeChatQueueCard: vi.fn(),
  exportChatQueueMarkdown: vi.fn(),
}));

import { getChatQueue, returnFromChatQueue } from "./chat-queue.api";
import { ChatQueueScreen } from "./chat-queue-screen";
import { PENDING_REVIEW_CHANGED_EVENT } from "../knowledge-bit/knowledge-bit-review-events";

function item(
  id: string,
  subjectName: string | null = null,
): ChatQueueKnowledgeBit {
  return {
    id,
    body: `Fact ${id}`,
    background: null,
    origin: "extracted",
    subjectName,
    chatAt: "2026-10-28T10:00:00.000Z",
    turnsLeft: 8,
    snoozedUntil: null,
  };
}

function ok<T>(data: T) {
  return { ok: true as const, data };
}

function load(items: ChatQueueKnowledgeBit[]) {
  vi.mocked(getChatQueue).mockResolvedValue(ok({ items, count: items.length }));
}

async function box(id: string) {
  return (await screen.findByRole("checkbox", {
    name: `Select Fact ${id}`,
  })) as HTMLInputElement;
}

beforeEach(() => {
  vi.mocked(returnFromChatQueue).mockResolvedValue(ok({ ok: true }) as never);
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("ChatQueueScreen bulk move to Inbox", () => {
  it("should move the selected cards to Inbox, drop them from the list and refresh the badge once", async () => {
    load([item("a"), item("b"), item("c")]);
    const changed = vi.fn();

    window.addEventListener(PENDING_REVIEW_CHANGED_EVENT, changed);
    render(<ChatQueueScreen />);
    await userEvent.click(await box("a"));
    await userEvent.click(await box("c"));

    expect(screen.getByTestId("chat-queue-bulk-count").textContent).toBe(
      "2 selected",
    );

    await userEvent.click(screen.getByTestId("chat-queue-bulk-move"));

    await waitFor(() =>
      expect(screen.queryByTestId("chat-queue-row-a")).toBeNull(),
    );
    expect(screen.queryByTestId("chat-queue-row-c")).toBeNull();
    expect(screen.getByTestId("chat-queue-row-b")).toBeTruthy();
    expect(returnFromChatQueue).toHaveBeenCalledTimes(2);
    expect(changed).toHaveBeenCalledTimes(1);
    window.removeEventListener(PENDING_REVIEW_CHANGED_EVENT, changed);
  });

  it("should select all only among the cards matching the active subject filter", async () => {
    load([item("a", "Rust"), item("b", "Go"), item("c", "Rust")]);
    render(<ChatQueueScreen />);
    await userEvent.selectOptions(
      await screen.findByTestId("chat-queue-subject"),
      "Rust",
    );
    await userEvent.click(screen.getByTestId("chat-queue-select-all"));

    expect(screen.getByTestId("chat-queue-bulk-count").textContent).toBe(
      "2 selected",
    );

    await userEvent.click(screen.getByTestId("chat-queue-bulk-move"));
    await waitFor(() => expect(returnFromChatQueue).toHaveBeenCalledTimes(2));

    const ids = vi
      .mocked(returnFromChatQueue)
      .mock.calls.map(([arg]) => (arg?.data as { bitId: string }).bitId)
      .sort();

    expect(ids).toEqual(["a", "c"]);
  });

  it("should keep failed cards selected and say how many failed", async () => {
    load([item("a"), item("b"), item("c")]);
    vi.mocked(returnFromChatQueue).mockImplementation(async (arg) =>
      (arg?.data as { bitId: string }).bitId === "b"
        ? ({ ok: false, failure: "offline" } as never)
        : (ok({ ok: true }) as never),
    );
    render(<ChatQueueScreen />);
    await userEvent.click(await screen.findByTestId("chat-queue-select-all"));
    await userEvent.click(screen.getByTestId("chat-queue-bulk-move"));

    expect(
      (await screen.findByTestId("chat-queue-bulk-error")).textContent,
    ).toContain("1 card could not be moved");
    expect(screen.queryByTestId("chat-queue-row-a")).toBeNull();
    expect(screen.queryByTestId("chat-queue-row-c")).toBeNull();
    expect((await box("b")).checked).toBe(true);
    expect(screen.getByTestId("chat-queue-bulk-count").textContent).toBe(
      "1 selected",
    );
  });

  it("should ask for confirmation before moving more than 5 cards", async () => {
    load(["a", "b", "c", "d", "e", "f"].map((id) => item(id)));
    render(<ChatQueueScreen />);
    await userEvent.click(await screen.findByTestId("chat-queue-select-all"));
    await userEvent.click(screen.getByTestId("chat-queue-bulk-move"));

    expect(returnFromChatQueue).not.toHaveBeenCalled();
    expect(screen.getByTestId("chat-queue-bulk-confirm-text").textContent).toBe(
      "Move 6 cards to Inbox?",
    );

    await userEvent.click(screen.getByTestId("chat-queue-bulk-cancel"));

    expect(returnFromChatQueue).not.toHaveBeenCalled();

    await userEvent.click(screen.getByTestId("chat-queue-bulk-move"));
    await userEvent.click(screen.getByTestId("chat-queue-bulk-confirm"));

    await waitFor(() => expect(returnFromChatQueue).toHaveBeenCalledTimes(6));
  });

  it("should move 5 cards without a confirm step", async () => {
    load(["a", "b", "c", "d", "e"].map((id) => item(id)));
    render(<ChatQueueScreen />);
    await userEvent.click(await screen.findByTestId("chat-queue-select-all"));
    await userEvent.click(screen.getByTestId("chat-queue-bulk-move"));

    await waitFor(() => expect(returnFromChatQueue).toHaveBeenCalledTimes(5));
  });

  it("should clear the selection with Clear", async () => {
    load([item("a"), item("b")]);
    render(<ChatQueueScreen />);
    await userEvent.click(await box("a"));
    await userEvent.click(screen.getByTestId("chat-queue-bulk-clear"));

    expect(screen.queryByTestId("chat-queue-bulk-bar")).toBeNull();
    expect((await box("a")).checked).toBe(false);
  });

  it("should toggle the highlighted card with x while j/k keep moving", async () => {
    load([item("a"), item("b")]);
    render(<ChatQueueScreen />);
    await screen.findByTestId("chat-queue-row-a");
    await userEvent.keyboard("jj");
    await userEvent.keyboard("x");

    expect((await box("b")).checked).toBe(true);
    expect((await box("a")).checked).toBe(false);

    await userEvent.keyboard("x");

    expect((await box("b")).checked).toBe(false);
  });
});

describe("ChatQueueScreen select stale cards", () => {
  const NOW = new Date("2026-10-28T12:00:00.000Z");

  function aged(id: string, chatAt: string): ChatQueueKnowledgeBit {
    return { ...item(id), chatAt };
  }

  it("should select every card waiting over 14 days and move them to Inbox", async () => {
    load([
      aged("a", "2026-10-01T12:00:00.000Z"),
      aged("b", "2026-10-27T12:00:00.000Z"),
      aged("c", "2026-09-20T12:00:00.000Z"),
    ]);
    render(<ChatQueueScreen now={NOW} />);
    await userEvent.click(await screen.findByTestId("chat-queue-select-stale"));

    expect(screen.getByTestId("chat-queue-bulk-count").textContent).toBe(
      "2 selected",
    );
    expect((await box("b")).checked).toBe(false);

    await userEvent.click(screen.getByTestId("chat-queue-bulk-move"));

    await waitFor(() =>
      expect(screen.queryByTestId("chat-queue-row-a")).toBeNull(),
    );
    expect(screen.queryByTestId("chat-queue-row-c")).toBeNull();
    expect(screen.getByTestId("chat-queue-row-b")).toBeTruthy();
    expect(returnFromChatQueue).toHaveBeenCalledTimes(2);
  });

  it("should show no stale control when every card is recent", async () => {
    load([aged("a", "2026-10-27T12:00:00.000Z")]);
    render(<ChatQueueScreen now={NOW} />);
    await box("a");

    expect(screen.queryByTestId("chat-queue-select-stale")).toBeNull();
  });
});
