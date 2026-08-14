import { describe, it, expect } from "vitest";
import {
  buildTriageKeyboard,
  buildResurfaceCheckinKeyboard,
  resurfaceMessageText,
  dismissedCheckinMessageText,
  importantConfirmationText,
  DEFER_CONFIRMATION_TEXT,
  DISMISS_CONFIRMATION_TEXT,
  CHECKIN_CONFIRM_TEXT,
  CHECKIN_REVISIT_TEXT,
} from "./gap-triage-view.js";

describe("buildTriageKeyboard", () => {
  it("renders exactly Important / Defer again / Dismiss in one row below the reshow threshold", () => {
    const keyboard = buildTriageKeyboard("gap_1", 2);

    expect(keyboard).toHaveLength(1);
    expect(keyboard[0]!.map((b) => b.text)).toEqual(["Important", "Defer again", "Dismiss"]);
  });

  it("never leaks an internal identifier, enum value, or gap id into a button caption", () => {
    const keyboard = buildTriageKeyboard("gap_1", 3);

    for (const row of keyboard) {
      for (const button of row) {
        expect(button.text).not.toContain("gap_1");
        expect(button.text).not.toMatch(/user_deferred|triage_state/i);
      }
    }
  });

  it("adds the Actually dismiss? shortcut only after the 3rd re-deferral", () => {
    expect(buildTriageKeyboard("gap_1", 2).flat().map((b) => b.text)).not.toContain(
      "Actually dismiss?",
    );
    expect(buildTriageKeyboard("gap_1", 3).flat().map((b) => b.text)).toContain(
      "Actually dismiss?",
    );
  });

  it("chunks the post-3rd-deferral 4-button set via chunkButtons(_, 3) — a 3-button row plus a trailing 1-button row", () => {
    const keyboard = buildTriageKeyboard("gap_1", 3);

    expect(keyboard).toHaveLength(2);
    expect(keyboard[0]!.map((b) => b.text)).toEqual(["Important", "Defer again", "Dismiss"]);
    expect(keyboard[1]!.map((b) => b.text)).toEqual(["Actually dismiss?"]);
  });

  it("embeds the gap id in each button's callback_data so independently-pending messages route correctly", () => {
    const keyboard = buildTriageKeyboard("gap_42", 0);

    for (const button of keyboard.flat()) {
      expect("callback_data" in button && button.callback_data).toContain("gap_42");
    }
  });
});

describe("buildResurfaceCheckinKeyboard", () => {
  it("renders exactly the two check-in buttons", () => {
    const keyboard = buildResurfaceCheckinKeyboard("gap_1");

    expect(keyboard.flat().map((b) => b.text)).toEqual([
      "Yes, still got it",
      "Actually, let's revisit",
    ]);
  });
});

describe("message copy — explicit callbacks to the prior triage action", () => {
  it("the resurface notification names the gap, tool, and explicitly says 'back'", () => {
    const text = resurfaceMessageText("async iterators", "TypeScript");

    expect(text).toBe("Your deferred gap is back: async iterators (TypeScript)");
  });

  it("the dismissed check-in explicitly says 'dismissed'", () => {
    const text = dismissedCheckinMessageText("async iterators", "TypeScript");

    expect(text).toBe(
      "A few months back you dismissed this: async iterators (TypeScript). Still confident?",
    );
  });
});

describe("confirmation text", () => {
  it("Important confirms with the exact issue copy", () => {
    expect(importantConfirmationText("async iterators", "TypeScript")).toBe(
      "Noted — TypeScript: async iterators is flagged as important.",
    );
  });

  it("Defer again confirms silently with the exact issue copy", () => {
    expect(DEFER_CONFIRMATION_TEXT).toBe("Got it — deferred for 60 days.");
  });

  it("Dismiss (and the Actually dismiss? shortcut) confirm with the identical exact copy", () => {
    expect(DISMISS_CONFIRMATION_TEXT).toBe("Dismissed. I'll trust your judgment on this one.");
  });

  it("the check-in's two outcomes have distinct acknowledgment copy", () => {
    expect(CHECKIN_CONFIRM_TEXT).not.toBe(CHECKIN_REVISIT_TEXT);
  });
});
