import { describe, expect, it } from "vitest";
import { isBlankKind } from "./cloze";
import {
  buildOrderedListCards,
  formatOrderedListText,
  parseOrderedListText,
  validateOrderedList,
} from "./ordered-list";

const list = { title: "Closing a sale", steps: ["Qualify", "Pitch", "Negotiate", "Close"] };

describe("buildOrderedListCards", () => {
  it("should produce N step cards, N-1 next-step cards and one overview card that states N", () => {
    const cards = buildOrderedListCards(list);

    expect(cards.filter((card) => card.kind === "list_step")).toHaveLength(4);
    expect(cards.filter((card) => card.kind === "list_next")).toHaveLength(3);

    const overview = cards.filter((card) => card.kind === "list_overview");

    expect(overview).toHaveLength(1);
    expect(overview[0]?.answer).toBe("4 steps\n1. Qualify\n2. Pitch\n3. Negotiate\n4. Close");
  });

  it("should ask for the step at the learner's position and answer with that step", () => {
    const step3 = buildOrderedListCards(list).find((card) => card.kind === "list_step" && card.order === 3);

    expect(step3).toEqual({
      kind: "list_step",
      order: 3,
      prompt: "In Closing a sale, what is step 3?",
      answer: "Negotiate",
    });
  });

  it("should blank the following step on a next-step card so it reads as a fill-in", () => {
    const next = buildOrderedListCards(list).find((card) => card.kind === "list_next" && card.order === 2);

    expect(next?.prompt).toBe('Closing a sale: after "Pitch" the next step is ____');
    expect(next?.answer).toBe("Negotiate");
    expect(isBlankKind("list_next")).toBe(true);
  });

  it("should give every card of one list a distinct slot", () => {
    const slots = buildOrderedListCards(list).map((card) => `${card.kind}:${card.order}`);

    expect(new Set(slots).size).toBe(slots.length);
  });
});

describe("validateOrderedList", () => {
  it("should refuse a list with duplicate steps", () => {
    expect(validateOrderedList({ title: "T", steps: ["a", "b", "A "] })).toEqual({
      ok: false,
      error: "duplicate_step",
    });
  });

  it("should refuse fewer than three and more than eight steps", () => {
    expect(validateOrderedList({ title: "T", steps: ["a", "b"] })).toEqual({ ok: false, error: "too_few_steps" });

    const many = Array.from({ length: 9 }, (_, index) => `step ${index}`);

    expect(validateOrderedList({ title: "T", steps: many })).toEqual({ ok: false, error: "too_many_steps" });
  });

  it("should refuse an empty title, an empty step and an over-long step", () => {
    expect(validateOrderedList({ title: " ", steps: ["a", "b", "c"] })).toEqual({ ok: false, error: "empty_title" });
    expect(validateOrderedList({ title: "T", steps: ["a", " ", "c"] })).toEqual({ ok: false, error: "empty_step" });
    expect(validateOrderedList({ title: "T", steps: ["a", "b", "x".repeat(121)] })).toEqual({
      ok: false,
      error: "step_too_long",
    });
  });

  it("should refuse text that would be mistaken for a blank", () => {
    expect(validateOrderedList({ title: "T", steps: ["a", "b ____", "c"] })).toEqual({
      ok: false,
      error: "reserved_blank",
    });
  });
});

describe("parseOrderedListText", () => {
  it("should read the title from line one and strip list numbering from steps", () => {
    const parsed = parseOrderedListText("Closing a sale\n1. Qualify\n2) Pitch\n- Negotiate\n\nClose");

    expect(parsed).toEqual({ ok: true, list });
  });

  it("should round-trip through the canonical text", () => {
    expect(parseOrderedListText(formatOrderedListText(list))).toEqual({ ok: true, list });
  });

  it("should refuse a title with fewer than three steps", () => {
    expect(parseOrderedListText("Only title\none\ntwo")).toEqual({ ok: false, error: "too_few_steps" });
  });
});
