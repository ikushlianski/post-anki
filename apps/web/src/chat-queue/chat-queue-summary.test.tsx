// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ChatQueueKnowledgeBit } from "@post-anki/shared";

import { chatQueueCounts } from "./chat-queue-counts";
import { ChatQueueSummary } from "./chat-queue-summary";

const FUTURE = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

function item(id: string, snoozedUntil: string | null = null): ChatQueueKnowledgeBit {
  return {
    id,
    body: `Fact ${id}`,
    background: null,
    origin: "extracted",
    subjectName: null,
    chatAt: "2026-10-16T12:00:00.000Z",
    turnsLeft: 8,
    snoozedUntil,
  };
}

describe("chatQueueCounts", () => {
  it("should count snoozed cards separately from waiting ones", () => {
    expect(chatQueueCounts([item("a"), item("b", FUTURE), item("c")])).toEqual({
      waiting: 2,
      snoozed: 1,
    });
  });
});

describe("chatQueueCounts with expired snoozes", () => {
  it("should count a card with an expired snooze as waiting", () => {
    const now = new Date("2026-10-28T12:00:00.000Z");

    expect(
      chatQueueCounts([item("a", "2026-10-20T00:00:00.000Z"), item("b", FUTURE)], now),
    ).toEqual({ waiting: 1, snoozed: 1 });
  });
});

describe("ChatQueueSummary", () => {
  afterEach(cleanup);

  it("should not mention snoozed when the only snooze has expired", () => {
    render(
      <ChatQueueSummary
        items={[item("a", "2026-10-20T00:00:00.000Z")]}
        now={new Date("2026-10-28T12:00:00.000Z")}
      />,
    );

    expect(screen.getByTestId("chat-queue-summary").textContent).toBe("1 waiting");
  });

  it("should show waiting and snoozed counts in the header", () => {
    render(<ChatQueueSummary items={[item("a"), item("b", FUTURE)]} />);

    expect(screen.getByTestId("chat-queue-summary").textContent).toBe("1 waiting · 1 snoozed");
  });

  it("should omit the snoozed part when nothing is snoozed", () => {
    render(<ChatQueueSummary items={[item("a"), item("b")]} />);

    expect(screen.getByTestId("chat-queue-summary").textContent).toBe("2 waiting");
  });

  it("should be hidden when the queue is empty", () => {
    render(<ChatQueueSummary items={[]} />);

    expect(screen.queryByTestId("chat-queue-summary")).toBeNull();
  });
});
