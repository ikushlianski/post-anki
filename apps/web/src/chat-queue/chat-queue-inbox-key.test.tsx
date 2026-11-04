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
import { CHAT_QUEUE_SHORTCUTS } from "./chat-queue-shortcuts";

function item(id: string, minute: number): ChatQueueKnowledgeBit {
  return {
    id,
    body: `Fact ${id}`,
    background: null,
    origin: "extracted",
    subjectName: null,
    chatAt: `2026-10-28T10:0${minute}:00.000Z`,
    turnsLeft: 8,
    snoozedUntil: null,
  };
}

function load() {
  vi.mocked(getChatQueue).mockResolvedValue({
    ok: true as const,
    data: { items: [item("a", 1), item("b", 2), item("c", 3)], count: 3 },
  });
}

beforeEach(() => {
  vi.mocked(returnFromChatQueue).mockResolvedValue({ ok: true } as never);
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("ChatQueueScreen i shortcut", () => {
  it("should list the i shortcut in the shortcut help", () => {
    expect(CHAT_QUEUE_SHORTCUTS.some((shortcut) => shortcut.keys === "i")).toBe(
      true,
    );
  });

  it("should move only the highlighted card to Inbox and keep the highlight on the next card", async () => {
    load();
    render(<ChatQueueScreen />);
    await screen.findByTestId("chat-queue-row-a");
    await userEvent.keyboard("jj");
    await userEvent.keyboard("i");

    await waitFor(() =>
      expect(screen.queryByTestId("chat-queue-row-b")).toBeNull(),
    );
    expect(returnFromChatQueue).toHaveBeenCalledTimes(1);
    expect(returnFromChatQueue).toHaveBeenCalledWith({ data: { bitId: "b" } });
    expect(screen.getByTestId("chat-queue-row-a")).toBeTruthy();
    expect(screen.getByTestId("chat-queue-row-c")).toBeTruthy();
  });

  it("should keep the existing bulk selection intact when moving the highlighted card", async () => {
    load();
    render(<ChatQueueScreen />);
    await userEvent.click(
      await screen.findByRole("checkbox", { name: "Select Fact a" }),
    );
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Select Fact b" }),
    );
    await userEvent.click(document.body);
    await userEvent.keyboard("jjj");
    await userEvent.keyboard("i");

    await waitFor(() =>
      expect(screen.queryByTestId("chat-queue-row-c")).toBeNull(),
    );
    expect(returnFromChatQueue).toHaveBeenCalledTimes(1);
    expect(returnFromChatQueue).toHaveBeenCalledWith({ data: { bitId: "c" } });
    expect(screen.getByTestId("chat-queue-bulk-count").textContent).toBe(
      "2 selected",
    );
  });

  it("should do nothing when no card is highlighted", async () => {
    load();
    render(<ChatQueueScreen />);
    await screen.findByTestId("chat-queue-row-a");
    await userEvent.keyboard("{Control>}i{/Control}");
    await userEvent.keyboard("i");

    expect(returnFromChatQueue).not.toHaveBeenCalled();
  });

  it("should ignore i with a modifier key", async () => {
    load();
    render(<ChatQueueScreen />);
    await screen.findByTestId("chat-queue-row-a");
    await userEvent.keyboard("j");
    await userEvent.keyboard("{Control>}i{/Control}");
    await userEvent.keyboard("{Meta>}i{/Meta}");

    expect(returnFromChatQueue).not.toHaveBeenCalled();
  });

  it("should not move a card while typing in a text field", async () => {
    load();
    render(<ChatQueueScreen />);
    await screen.findByTestId("chat-queue-row-a");
    await userEvent.keyboard("j");
    await userEvent.type(screen.getByTestId("chat-queue-search"), "ii");

    expect(returnFromChatQueue).not.toHaveBeenCalled();
  });

  it("should ignore a second i while a move is still running", async () => {
    load();
    let release: () => void = () => undefined;

    vi.mocked(returnFromChatQueue).mockReturnValue(
      new Promise((resolve) => {
        release = () => resolve({ ok: true } as never);
      }),
    );
    render(<ChatQueueScreen />);
    await screen.findByTestId("chat-queue-row-a");
    await userEvent.keyboard("j");
    await userEvent.keyboard("i");
    await userEvent.keyboard("j");
    await userEvent.keyboard("i");

    expect(returnFromChatQueue).toHaveBeenCalledTimes(1);
    release();
    await waitFor(() =>
      expect(screen.queryByTestId("chat-queue-row-a")).toBeNull(),
    );
  });
});
