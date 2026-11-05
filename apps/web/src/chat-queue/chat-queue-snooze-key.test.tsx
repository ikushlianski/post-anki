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

import {
  getChatQueue,
  returnFromChatQueue,
  snoozeChatQueueCard,
} from "./chat-queue.api";
import { ChatQueueScreen } from "./chat-queue-screen";
import { CHAT_QUEUE_SHORTCUTS } from "./chat-queue-shortcuts";

function item(
  id: string,
  minute: number,
  snoozedUntil: string | null = null,
): ChatQueueKnowledgeBit {
  return {
    id,
    body: `Fact ${id}`,
    background: null,
    origin: "extracted",
    subjectName: null,
    chatAt: `2026-10-28T10:0${minute}:00.000Z`,
    turnsLeft: 8,
    snoozedUntil,
  };
}

function load(items = [item("a", 1), item("b", 2), item("c", 3)]) {
  vi.mocked(getChatQueue).mockResolvedValue({
    ok: true as const,
    data: { items, count: items.length },
  });
}

beforeEach(() => {
  vi.mocked(snoozeChatQueueCard).mockResolvedValue({
    ok: true,
    data: { snoozedUntil: "2099-01-01T10:00:00.000Z" },
  } as never);
  vi.mocked(returnFromChatQueue).mockResolvedValue({ ok: true } as never);
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("ChatQueueScreen s shortcut", () => {
  it("should list the s shortcut in the shortcut help", () => {
    expect(CHAT_QUEUE_SHORTCUTS.some((shortcut) => shortcut.keys === "s")).toBe(
      true,
    );
  });

  it("should snooze only the highlighted card for the shortest preset", async () => {
    load();
    render(<ChatQueueScreen />);
    await screen.findByTestId("chat-queue-row-a");
    await userEvent.keyboard("jjs");

    await waitFor(() =>
      expect(screen.getByTestId("chat-queue-snoozed-b")).toBeTruthy(),
    );
    expect(snoozeChatQueueCard).toHaveBeenCalledTimes(1);
    expect(snoozeChatQueueCard).toHaveBeenCalledWith({
      data: { bitId: "b", days: 1 },
    });
    expect(screen.queryByTestId("chat-queue-snoozed-a")).toBeNull();
  });

  it("should drop only the snoozed card from the bulk selection", async () => {
    load();
    render(<ChatQueueScreen />);
    await userEvent.click(
      await screen.findByRole("checkbox", { name: "Select Fact a" }),
    );
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Select Fact b" }),
    );
    await userEvent.click(document.body);
    await userEvent.keyboard("jjs");

    await waitFor(() =>
      expect(screen.getByTestId("chat-queue-snoozed-b")).toBeTruthy(),
    );
    expect(screen.getByTestId("chat-queue-bulk-count").textContent).toBe(
      "1 selected",
    );
  });

  it("should do nothing on an already snoozed card", async () => {
    load([item("a", 1, "2099-01-01T10:00:00.000Z"), item("b", 2)]);
    render(<ChatQueueScreen />);
    await screen.findByTestId("chat-queue-row-a");
    await userEvent.keyboard("js");

    expect(snoozeChatQueueCard).not.toHaveBeenCalled();
  });

  it("should do nothing when no card is highlighted or a modifier is held", async () => {
    load();
    render(<ChatQueueScreen />);
    await screen.findByTestId("chat-queue-row-a");
    await userEvent.keyboard("s");
    await userEvent.keyboard("j");
    await userEvent.keyboard("{Control>}s{/Control}");
    await userEvent.keyboard("{Meta>}s{/Meta}");

    expect(snoozeChatQueueCard).not.toHaveBeenCalled();
  });

  it("should not snooze while typing in a text field", async () => {
    load();
    render(<ChatQueueScreen />);
    await screen.findByTestId("chat-queue-row-a");
    await userEvent.keyboard("j");
    await userEvent.type(screen.getByTestId("chat-queue-search"), "ss");

    expect(snoozeChatQueueCard).not.toHaveBeenCalled();
  });

  it("should ignore s while a move to Inbox is running", async () => {
    load();
    let release: () => void = () => undefined;

    vi.mocked(returnFromChatQueue).mockReturnValue(
      new Promise((resolve) => {
        release = () => resolve({ ok: true } as never);
      }),
    );
    render(<ChatQueueScreen />);
    await screen.findByTestId("chat-queue-row-a");
    await userEvent.keyboard("ji");
    await userEvent.keyboard("s");

    expect(snoozeChatQueueCard).not.toHaveBeenCalled();
    release();
    await waitFor(() =>
      expect(screen.queryByTestId("chat-queue-row-a")).toBeNull(),
    );
  });

  it("should leave the card unsnoozed when the request fails", async () => {
    load();
    vi.mocked(snoozeChatQueueCard).mockRejectedValue(new Error("boom"));
    render(<ChatQueueScreen />);
    await screen.findByTestId("chat-queue-row-a");
    await userEvent.keyboard("jjs");

    await waitFor(() => expect(snoozeChatQueueCard).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("chat-queue-snoozed-b")).toBeNull();
  });
});
