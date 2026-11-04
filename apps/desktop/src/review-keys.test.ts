import { describe, expect, it } from "vitest";
import { mapReviewKey, type ReviewKeyEvent, type ReviewKeyScreen } from "@/review-keys";

const idle: ReviewKeyScreen = { hasCard: true, revealed: false, busy: false, editing: false, canUndo: true };
const shown: ReviewKeyScreen = { ...idle, revealed: true };

function key(code: string, overrides: Partial<ReviewKeyEvent> = {}): ReviewKeyEvent {
  return {
    code,
    repeat: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    targetIsEditable: false,
    targetIsControl: false,
    ...overrides,
  };
}

describe("mapReviewKey reveal", () => {
  it("should reveal the answer on Space and prevent the page from scrolling", () => {
    expect(mapReviewKey(key("Space"), idle)).toEqual({ action: { type: "reveal" }, preventDefault: true });
  });

  it("should reveal the answer on Enter and on the numpad Enter", () => {
    expect(mapReviewKey(key("Enter"), idle).action).toEqual({ type: "reveal" });
    expect(mapReviewKey(key("NumpadEnter"), idle).action).toEqual({ type: "reveal" });
  });

  it("should leave Space to a focused button so its own click still works", () => {
    expect(mapReviewKey(key("Space", { targetIsControl: true }), idle)).toEqual({ action: null, preventDefault: false });
  });

  it("should grade Good on Enter once the answer is shown", () => {
    expect(mapReviewKey(key("Enter"), shown).action).toEqual({ type: "grade", grade: "good" });
    expect(mapReviewKey(key("NumpadEnter"), shown).action).toEqual({ type: "grade", grade: "good" });
  });

  it("should leave Enter to a focused button once the answer is shown", () => {
    expect(mapReviewKey(key("Enter", { targetIsControl: true }), shown).action).toBeNull();
  });
});

describe("mapReviewKey grading", () => {
  it.each([
    ["Digit1", "again"],
    ["Digit2", "hard"],
    ["Digit3", "good"],
    ["Digit4", "easy"],
    ["Numpad1", "again"],
    ["Numpad2", "hard"],
    ["Numpad3", "good"],
    ["Numpad4", "easy"],
  ] as const)("should grade %s as %s once the answer is shown", (code, grade) => {
    expect(mapReviewKey(key(code), shown)).toEqual({ action: { type: "grade", grade }, preventDefault: true });
  });

  it("should not grade a digit before the answer is shown", () => {
    expect(mapReviewKey(key("Digit3"), idle).action).toBeNull();
  });

  it("should ignore digits that are not one to four", () => {
    expect(mapReviewKey(key("Digit5"), shown).action).toBeNull();
  });
});

describe("mapReviewKey undo", () => {
  it("should undo the last grade on U", () => {
    expect(mapReviewKey(key("KeyU"), shown).action).toEqual({ type: "undo" });
  });

  it("should not undo when there is nothing to undo", () => {
    expect(mapReviewKey(key("KeyU"), { ...shown, canUndo: false }).action).toBeNull();
  });
});

describe("mapReviewKey ignored input", () => {
  it("should ignore keys typed into an input, textarea or select", () => {
    expect(mapReviewKey(key("Digit3", { targetIsEditable: true }), shown).action).toBeNull();
    expect(mapReviewKey(key("Space", { targetIsEditable: true }), idle).action).toBeNull();
  });

  it("should ignore keys while the edit form is open", () => {
    expect(mapReviewKey(key("Digit3"), { ...shown, editing: true }).action).toBeNull();
  });

  it("should ignore keys while a grade or action is being saved", () => {
    expect(mapReviewKey(key("Digit3"), { ...shown, busy: true }).action).toBeNull();
  });

  it("should ignore Cmd, Ctrl and Alt combinations", () => {
    expect(mapReviewKey(key("Digit3", { metaKey: true }), shown).action).toBeNull();
    expect(mapReviewKey(key("Digit3", { ctrlKey: true }), shown).action).toBeNull();
    expect(mapReviewKey(key("Space", { altKey: true }), idle).action).toBeNull();
  });

  it("should ignore auto-repeated keys so holding a key does not grade many cards", () => {
    expect(mapReviewKey(key("Digit3", { repeat: true }), shown).action).toBeNull();
    expect(mapReviewKey(key("Space", { repeat: true }), idle).action).toBeNull();
  });

  it("should do nothing when no card is on screen", () => {
    expect(mapReviewKey(key("Space"), { ...idle, hasCard: false }).action).toBeNull();
  });
});
