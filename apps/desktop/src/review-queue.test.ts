import { describe, expect, it } from "vitest";
import type { ReviewCard } from "@/api/review-commands";
import { mergeIncoming, needsRefill, pendingNote, REFILL_THRESHOLD } from "@/review-queue";

const card = (id: string): ReviewCard => ({
  id,
  knowledgeBitId: `kb-${id}`,
  question: `Q${id}`,
  answer: `A${id}`,
  phase: "review",
  cardKey: null,
  intervals: null,
});

describe("needsRefill", () => {
  it("should ask for more cards once fewer than the threshold remain after the current one", () => {
    expect(needsRefill(REFILL_THRESHOLD - 1, false, false)).toBe(true);
  });

  it("should not ask for more while a refill is already running", () => {
    expect(needsRefill(0, true, false)).toBe(false);
  });

  it("should stop asking once the server has no further cards to add", () => {
    expect(needsRefill(0, false, true)).toBe(false);
  });

  it("should leave a healthy queue alone", () => {
    expect(needsRefill(REFILL_THRESHOLD, false, false)).toBe(false);
  });
});

describe("mergeIncoming", () => {
  it("should append only the cards not already held, keeping the held order", () => {
    const merged = mergeIncoming([card("a"), card("b")], [card("b"), card("c")]);

    expect(merged.map((item) => item.id)).toEqual(["a", "b", "c"]);
  });

  it("should not re-add a card the learner already graded earlier in the queue", () => {
    const merged = mergeIncoming([card("a"), card("b")], [card("a")]);

    expect(merged.map((item) => item.id)).toEqual(["a", "b"]);
  });
});

describe("pendingNote", () => {
  it("should show how many grades still wait to sync", () => {
    expect(pendingNote(3)).toBe("3 waiting to sync");
  });

  it("should show nothing when every grade has synced", () => {
    expect(pendingNote(0)).toBeNull();
  });
});
