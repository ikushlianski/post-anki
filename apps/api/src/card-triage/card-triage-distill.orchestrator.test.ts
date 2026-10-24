import { describe, expect, it, vi } from "vitest";

vi.mock("../shared/log.js", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("../db/client.js", () => ({ getDb: vi.fn() }));
vi.mock("../mastra/card-style-notes-distiller.agent.js", () => ({ runCardStyleNotesDistiller: vi.fn() }));
vi.mock("./card-style-note.repo.js", () => ({ listActiveStyleNotes: vi.fn(), replaceActiveStyleNotes: vi.fn() }));
vi.mock("./card-triage-session.repo.js", () => ({ getTriageSessionRow: vi.fn() }));

const { toNewStyleNotes } = await import("./card-triage-distill.orchestrator.js");

describe("toNewStyleNotes", () => {
  it("should scope a subject note to the session subject and a global note to everyone", () => {
    expect(
      toNewStyleNotes(
        [
          { text: "short fronts", scope: "subject" },
          { text: "always write in plain words", scope: "global" },
        ],
        "subj_1",
      ),
    ).toEqual([
      { text: "short fronts", subjectId: "subj_1" },
      { text: "always write in plain words", subjectId: null },
    ]);
  });

  it("should make every note global when the session had no subject", () => {
    expect(toNewStyleNotes([{ text: "short fronts", scope: "subject" }], null)).toEqual([
      { text: "short fronts", subjectId: null },
    ]);
  });

  it("should drop duplicate and blank notes and cap the list at 8", () => {
    const proposed = [
      { text: "Short fronts", scope: "global" as const },
      { text: "  short   fronts ", scope: "global" as const },
      { text: "   ", scope: "global" as const },
      ...Array.from({ length: 12 }, (_, index) => ({ text: `note ${String(index)}`, scope: "global" as const })),
    ];

    const notes = toNewStyleNotes(proposed, null);

    expect(notes).toHaveLength(8);
    expect(notes[0]?.text).toBe("Short fronts");
  });
});
