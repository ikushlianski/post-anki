import { describe, expect, it } from "vitest";
import type { SourceStatus, SubjectAdvice } from "@/api/add-knowledge-commands";
import {
  advanceNote,
  canSubmit,
  isDuplicateRejection,
  isNoteActive,
  labelFromText,
  MAX_NOTE_POLLS,
  newNote,
  noteAfterStatus,
  noteStatusText,
  recommendationsFrom,
  rejectionMessage,
} from "@/add-knowledge-logic";

function status(partial: Partial<SourceStatus> & Pick<SourceStatus, "status">): SourceStatus {
  return { failureReason: null, cardCount: null, ...partial };
}

describe("canSubmit", () => {
  it("should allow saving without a subject once the text is not blank", () => {
    expect(canSubmit("Mitochondria make ATP", false)).toBe(true);
  });

  it("should block saving whitespace-only text", () => {
    expect(canSubmit("   \n", false)).toBe(false);
  });

  it("should block a second save while one is already in progress", () => {
    expect(canSubmit("Mitochondria make ATP", true)).toBe(false);
  });
});

describe("labelFromText", () => {
  it("should collapse whitespace and cut long notes to a short label", () => {
    expect(labelFromText("  Mitochondria\n  make   ATP  ")).toBe("Mitochondria make ATP");
    expect(labelFromText("a".repeat(100))).toHaveLength(60);
  });
});

describe("recommendationsFrom", () => {
  it("should offer nothing when the check found no match or was unavailable", () => {
    const none: SubjectAdvice = { status: "none" };
    const unavailable: SubjectAdvice = { status: "unavailable", reason: "budget" };

    expect(recommendationsFrom(none)).toEqual([]);
    expect(recommendationsFrom(unavailable)).toEqual([]);
  });

  it("should offer the suggested subjects when the check found matches", () => {
    const advice: SubjectAdvice = {
      status: "ok",
      recommendations: [{ subjectId: "s1", subjectLabel: "Biology", confidence: "high", reason: "Cells" }],
    };

    expect(recommendationsFrom(advice)).toHaveLength(1);
  });
});

describe("isDuplicateRejection and rejectionMessage", () => {
  it("should recognise a duplicate so the user can add it anyway", () => {
    expect(isDuplicateRejection({ kind: "duplicate", message: "Already there." })).toBe(true);
    expect(isDuplicateRejection({ kind: "message", message: "Too long." })).toBe(false);
  });

  it("should show the server's message for a rejection and the fallback for anything else", () => {
    expect(rejectionMessage({ kind: "message", message: "Too long." }, "Fallback")).toBe("Too long.");
    expect(rejectionMessage("Sign in to add knowledge.", "Fallback")).toBe("Sign in to add knowledge.");
    expect(rejectionMessage(new Error("boom"), "Fallback")).toBe("Fallback");
  });
});

describe("noteAfterStatus", () => {
  const note = newNote({ sourceId: "src-1", label: "Mitochondria" });

  it("should show the note as working while extraction is still running", () => {
    expect(noteAfterStatus(note, status({ status: "running" })).phase).toBe("working");
  });

  it("should show the card count once extraction finishes with cards", () => {
    expect(noteAfterStatus(note, status({ status: "done", cardCount: 3 }))).toMatchObject({
      phase: "ready",
      cardCount: 3,
    });
  });

  it("should say nothing was worth keeping when a note produced no cards", () => {
    expect(noteAfterStatus(note, status({ status: "nothing_extracted" })).phase).toBe("nothing");
    expect(noteAfterStatus(note, status({ status: "done", cardCount: 0 })).phase).toBe("nothing");
  });

  it("should flag a failed extraction so the user can add it again", () => {
    expect(noteAfterStatus(note, status({ status: "failed", failureReason: "model" })).phase).toBe("failed");
  });
});

describe("advanceNote", () => {
  it("should stop polling a note that has waited too long and say it is still working", () => {
    const almostSlow = { ...newNote({ sourceId: "src-1", label: "x" }), phase: "working" as const, polls: MAX_NOTE_POLLS - 1 };
    const slow = advanceNote(almostSlow, null);

    expect(slow.phase).toBe("slow");
    expect(isNoteActive(slow)).toBe(false);
    expect(noteStatusText(slow)).toBe("Still working. Check Triage for the result.");
  });

  it("should keep a note queued when the status could not be read this time", () => {
    const queued = newNote({ sourceId: "src-1", label: "x" });

    expect(advanceNote(queued, null)).toMatchObject({ phase: "queued", polls: 1 });
  });
});
