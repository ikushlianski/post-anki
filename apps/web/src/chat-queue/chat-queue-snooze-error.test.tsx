// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
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

import { getChatQueue, snoozeChatQueueCard } from "./chat-queue.api";
import { ChatQueueScreen } from "./chat-queue-screen";

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

async function renderQueue() {
  const items = [item("a", 1), item("b", 2)];

  vi.mocked(getChatQueue).mockResolvedValue({
    ok: true as const,
    data: { items, count: items.length },
  });
  render(<ChatQueueScreen />);
  await screen.findByTestId("chat-queue-row-a");
}

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("ChatQueueScreen s shortcut failure", () => {
  it("should tell the user when snoozing the highlighted card fails", async () => {
    await renderQueue();
    vi.mocked(snoozeChatQueueCard).mockRejectedValue(new Error("boom"));
    await userEvent.keyboard("js");

    const alert = await screen.findByRole("alert");

    expect(alert.textContent).toBe("Could not snooze this card. Try again.");
  });

  it("should tell the user when the server refuses the snooze", async () => {
    await renderQueue();
    vi.mocked(snoozeChatQueueCard).mockResolvedValue({
      ok: false,
    } as never);
    await userEvent.keyboard("js");

    expect(await screen.findByTestId("chat-queue-snooze-error")).toBeTruthy();
  });

  it("should show no error when the snooze succeeds", async () => {
    await renderQueue();
    vi.mocked(snoozeChatQueueCard).mockResolvedValue({
      ok: true,
      data: { snoozedUntil: "2026-11-05T10:00:00.000Z" },
    } as never);
    await userEvent.keyboard("js");

    await waitFor(() =>
      expect(screen.getByTestId("chat-queue-snoozed-a")).toBeTruthy(),
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("should keep the card in the list unsnoozed when the snooze fails", async () => {
    await renderQueue();
    vi.mocked(snoozeChatQueueCard).mockRejectedValue(new Error("boom"));
    await userEvent.keyboard("js");
    await screen.findByRole("alert");

    expect(screen.getByTestId("chat-queue-row-a")).toBeTruthy();
    expect(screen.queryByTestId("chat-queue-snoozed-a")).toBeNull();
  });

  it("should clear the error on the next key press", async () => {
    await renderQueue();
    vi.mocked(snoozeChatQueueCard).mockRejectedValue(new Error("boom"));
    await userEvent.keyboard("js");
    await screen.findByRole("alert");
    await userEvent.keyboard("j");

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("should clear the error once a retry succeeds", async () => {
    await renderQueue();
    vi.mocked(snoozeChatQueueCard).mockRejectedValueOnce(new Error("boom"));
    vi.mocked(snoozeChatQueueCard).mockResolvedValue({
      ok: true,
      data: { snoozedUntil: "2026-11-05T10:00:00.000Z" },
    } as never);
    await userEvent.keyboard("js");
    await screen.findByRole("alert");
    await userEvent.keyboard("s");

    await waitFor(() =>
      expect(screen.getByTestId("chat-queue-snoozed-a")).toBeTruthy(),
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
