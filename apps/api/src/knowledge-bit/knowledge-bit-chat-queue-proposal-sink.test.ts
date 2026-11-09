import { describe, expect, it } from "vitest";
import { CHAT_QUEUE_MAX_PROPOSALS, type ChatQueueProposal } from "@post-anki/shared";
import { createChatQueueProposalSink } from "./knowledge-bit-chat-queue-proposal-sink.js";

const card = (n: number) => ({ kind: "create" as const, front: `Front ${n}`, back: `Back ${n}` });

describe("createChatQueueProposalSink", () => {
  it("should stop the model from proposing more than the per-reply limit", () => {
    const sink = createChatQueueProposalSink();

    for (let n = 0; n < CHAT_QUEUE_MAX_PROPOSALS; n += 1) {
      expect(sink.add(card(n)).ok).toBe(true);
    }

    const over = sink.add(card(99));

    expect(over).toMatchObject({ ok: false });
    expect(sink.list()).toHaveLength(CHAT_QUEUE_MAX_PROPOSALS);
  });

  it("should tell the model to describe extra changes in text when the limit is hit", () => {
    const sink = createChatQueueProposalSink();

    sink.add(card(1));
    sink.add(card(2));

    const over = sink.add(card(3));

    expect(over.ok === false && over.error).toContain("in text");
  });

  it("should refuse the same card proposed twice in one reply ignoring case and spacing", () => {
    const sink = createChatQueueProposalSink();

    sink.add({ kind: "create", front: "What is X?", back: "A thing" });

    const dupe = sink.add({ kind: "update", front: " what is  x? ", back: "a THING" });

    expect(dupe.ok).toBe(false);
    expect(sink.list()).toHaveLength(1);
  });

  it("should refuse a card already pending or accepted earlier in the thread", () => {
    const earlier: ChatQueueProposal[] = [
      { index: 0, kind: "create", front: "Q1", back: "A1", status: "pending" },
      { index: 1, kind: "create", front: "Q2", back: "A2", status: "accepted" },
    ];
    const sink = createChatQueueProposalSink(earlier);

    expect(sink.add({ kind: "create", front: "Q1", back: "A1" }).ok).toBe(false);
    expect(sink.add({ kind: "create", front: "Q2", back: "A2" }).ok).toBe(false);
  });

  it("should allow re-proposing a card the learner rejected earlier", () => {
    const sink = createChatQueueProposalSink([
      { index: 0, kind: "create", front: "Q1", back: "A1", status: "rejected" },
    ]);

    expect(sink.add({ kind: "create", front: "Q1", back: "A1" }).ok).toBe(true);
  });

  it("should number proposals from zero and start each pending", () => {
    const sink = createChatQueueProposalSink();

    sink.add(card(1));
    sink.add({ ...card(2), example: "ex", reason: "clearer" });

    expect(sink.list()).toEqual([
      { index: 0, kind: "create", front: "Front 1", back: "Back 1", status: "pending" },
      { index: 1, kind: "create", front: "Front 2", back: "Back 2", example: "ex", reason: "clearer", status: "pending" },
    ]);
  });
});
