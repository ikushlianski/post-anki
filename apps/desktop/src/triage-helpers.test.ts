import { describe, expect, it } from "vitest";
import type { TriageItem } from "@/api/triage-commands";
import {
  decisionForKey,
  focusActionForKey,
  focusKeyLabel,
  proposedSubject,
  toggleSelected,
  withoutIds,
} from "@/triage-helpers";

const item: TriageItem = {
  id: "b1",
  body: "Mitochondria make ATP",
  background: null,
  subjectName: null,
  suggestedSubjectName: null,
};

describe("decisionForKey", () => {
  it("should map A, R and S to accept, reject and skip regardless of case", () => {
    expect(decisionForKey("a")).toBe("accept");
    expect(decisionForKey("R")).toBe("reject");
    expect(decisionForKey("s")).toBe("skip");
  });

  it("should ignore keys that are not a triage shortcut", () => {
    expect(decisionForKey("x")).toBeNull();
    expect(decisionForKey("Enter")).toBeNull();
  });
});

describe("proposedSubject", () => {
  it("should show the assigned subject as settled when the item has one", () => {
    expect(proposedSubject({ ...item, subjectName: "Biology", suggestedSubjectName: "Chemistry" })).toEqual({
      name: "Biology",
      suggested: false,
    });
  });

  it("should show the suggested subject as a proposal when none is assigned", () => {
    expect(proposedSubject({ ...item, suggestedSubjectName: "Chemistry" })).toEqual({
      name: "Chemistry",
      suggested: true,
    });
  });

  it("should show no subject when the API gives neither", () => {
    expect(proposedSubject(item)).toBeNull();
  });
});

describe("focusActionForKey", () => {
  it("should map U to undo and C to send to chat on top of the decision keys", () => {
    expect(focusActionForKey("u")).toBe("undo");
    expect(focusActionForKey("C")).toBe("chat");
    expect(focusActionForKey("a")).toBe("accept");
  });

  it("should label each focus shortcut with its upper-case key", () => {
    expect(focusKeyLabel("undo")).toBe("U");
    expect(focusKeyLabel("skip")).toBe("S");
  });
});

describe("toggleSelected", () => {
  it("should add an unselected id and remove a selected one", () => {
    expect(toggleSelected(["b1"], "b2")).toEqual(["b1", "b2"]);
    expect(toggleSelected(["b1", "b2"], "b1")).toEqual(["b2"]);
  });
});

describe("withoutIds", () => {
  it("should drop the ids that were decided and keep the rest in order", () => {
    expect(withoutIds(["b1", "b2", "b3"], ["b2"])).toEqual(["b1", "b3"]);
  });
});
