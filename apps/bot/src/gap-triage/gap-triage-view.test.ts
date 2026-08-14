import { describe, it, expect } from "vitest";
import type { Gap } from "@post-anki/shared";
import {
  buildTriageKeyboard,
  buildResurfaceCheckinKeyboard,
  resurfaceMessageText,
  dismissedCheckinMessageText,
  importantConfirmationText,
  deferredGapListLabel,
  DEFER_CONFIRMATION_TEXT,
  DISMISS_CONFIRMATION_TEXT,
  CHECKIN_CONFIRM_TEXT,
  CHECKIN_REVISIT_TEXT,
  AUTO_FILED_SUFFIX,
  USER_DEFERRED_SUFFIX,
} from "./gap-triage-view.js";

function gap(overrides: Partial<Gap> & { id: string; label: string }): Gap {
  return {
    topicId: "t1",
    depth: "working",
    origin: "ai",
    state: "open",
    wanted: false,
    concern: null,
    lastEvaluatedAt: null,
    triageState: "untriaged",
    triagedAt: null,
    deferredUntil: null,
    deferralCount: 0,
    dismissedAt: null,
    dismissedCheckinSentAt: null,
    untriagedSince: "2020-01-01T00:00:00.000Z",
    autoDeferredAt: null,
    ...overrides,
  };
}

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

// SCENARIO 8 — the two Deferred labels read differently (formatter only, not
// wired to any live surface yet — see spec.md Decision 1, #43 imports this).
describe("deferredGapListLabel", () => {
  it("labels a user-deferred gap 'deferred by you' — the issue's copy verbatim", () => {
    const label = deferredGapListLabel(
      gap({ id: "g1", label: "Plugin API internals", triageState: "user_deferred" }),
    );

    expect(label).toBe("Plugin API internals (deferred by you)");
  });

  it("labels an auto-deferred gap 'auto-filed' — the issue's copy verbatim", () => {
    const label = deferredGapListLabel(
      gap({ id: "g2", label: "Hydration boundary behavior", triageState: "auto_deferred" }),
    );

    expect(label).toBe("Hydration boundary behavior (auto-filed)");
  });

  it.each(["untriaged", "important", "dismissed"] as const)(
    "returns the bare label with no suffix for a %s gap",
    (triageState) => {
      const label = deferredGapListLabel(gap({ id: "g3", label: "Bare label", triageState }));

      expect(label).toBe("Bare label");
    },
  );

  it("uses the exact suffix constants in the formatted output", () => {
    expect(AUTO_FILED_SUFFIX).toBe("(auto-filed)");
    expect(USER_DEFERRED_SUFFIX).toBe("(deferred by you)");
  });
});
