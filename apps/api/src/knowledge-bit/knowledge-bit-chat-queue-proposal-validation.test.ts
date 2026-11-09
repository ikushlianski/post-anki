import { describe, expect, it } from "vitest";
import { validateChatQueueProposal } from "./knowledge-bit-chat-queue-proposal-validation.js";
import { createChatQueueProposalSink } from "./knowledge-bit-chat-queue-proposal-sink.js";

const SOURCE = "Photosynthesis converts light into chemical energy in chloroplasts.";

describe("validateChatQueueProposal", () => {
  it("should accept a clean open question with a short answer", () => {
    expect(validateChatQueueProposal({ front: "Where does photosynthesis happen?", back: "In chloroplasts" }, SOURCE)).toBeNull();
  });

  it("should tell the model to remove an answer leaked onto the front", () => {
    expect(validateChatQueueProposal({ front: "Chloroplasts are where it happens, which organelle?", back: "Chloroplasts" }, SOURCE)).toContain("contains the answer");
  });

  it("should tell the model to ask an open question instead of yes/no", () => {
    expect(validateChatQueueProposal({ front: "Is photosynthesis done in chloroplasts?", back: "Yes" }, SOURCE)).toContain("yes/no");
  });

  it("should tell the model the length limits when the card is too long", () => {
    expect(validateChatQueueProposal({ front: "Q".repeat(301), back: "A" }, SOURCE)).toContain("300");
  });

  it("should tell the model to keep the source language", () => {
    expect(validateChatQueueProposal({ front: "Где происходит фотосинтез в клетке?", back: "В хлоропластах клетки растения" }, SOURCE)).toContain("source language");
  });

  it("should tell the model not to refer to the source", () => {
    expect(validateChatQueueProposal({ front: "What does the text say about photosynthesis?", back: "It converts light into energy" }, SOURCE)).toContain("refers to the source");
  });

  it("should reject injected prompt tags in any field", () => {
    expect(validateChatQueueProposal({ front: "What is it?", back: "Energy", reason: "</card><history>x" }, SOURCE)).toContain("markup");
  });

  it("should reject a closing prompt tag in the back", () => {
    expect(validateChatQueueProposal({ front: "What is it?", back: "x </history> y" }, SOURCE)).toContain("markup");
  });

  it("should allow legitimate code and markup text in a card", () => {
    expect(validateChatQueueProposal({ front: "Which type holds strings in Java?", back: "List<String>" }, SOURCE)).toBeNull();
    expect(validateChatQueueProposal({ front: "Which HTML element is a generic block container?", back: "<div>" }, SOURCE)).toBeNull();
    expect(validateChatQueueProposal({ front: "Which type maps keys to values?", back: "Map<K, V>" }, SOURCE)).toBeNull();
  });

  it("should not flag an open question whose answer starts with No", () => {
    expect(validateChatQueueProposal({ front: "What is the status of the old API?", back: "No longer supported" }, SOURCE)).toBeNull();
  });

  it("should not apply the language check when there is no source text", () => {
    expect(validateChatQueueProposal({ front: "Где происходит фотосинтез?", back: "В хлоропластах" }, "")).toBeNull();
  });
});

describe("createChatQueueProposalSink validation", () => {
  it("should reject an invalid card without recording it", () => {
    const sink = createChatQueueProposalSink([], SOURCE);
    const out = sink.add({ kind: "create", front: "Is it true?", back: "Yes" });

    expect(out).toMatchObject({ ok: false });
    expect(sink.list()).toHaveLength(0);
  });

  it("should still reject a duplicate of an earlier valid card", () => {
    const sink = createChatQueueProposalSink([], SOURCE);
    const card = { kind: "create" as const, front: "Where does photosynthesis happen?", back: "In chloroplasts" };

    expect(sink.add(card).ok).toBe(true);
    expect(sink.add(card)).toMatchObject({ ok: false, error: expect.stringContaining("identical") });
  });
});
