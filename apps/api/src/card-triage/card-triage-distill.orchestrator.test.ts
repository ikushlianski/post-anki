import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../shared/log.js", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("../db/client.js", () => ({ getDb: vi.fn() }));
vi.mock("../mastra/card-style-notes-distiller.agent.js", () => ({ runCardStyleNotesDistiller: vi.fn() }));
vi.mock("./card-style-note.repo.js", () => ({ listActiveStyleNotes: vi.fn(), replaceActiveStyleNotes: vi.fn() }));
vi.mock("./card-triage-session.repo.js", () => ({ getTriageSessionRow: vi.fn() }));

const { distillTriageSession, toNewStyleNotes } = await import("./card-triage-distill.orchestrator.js");
const { getTriageSessionRow } = await import("./card-triage-session.repo.js");

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

describe("distillTriageSession", () => {
  const session = { id: "cts_1", subjectId: null, status: "saved_text_only", feedbackText: null } as Awaited<
    ReturnType<typeof getTriageSessionRow>
  >;
  const baseInput = {
    feedbackText: "",
    acceptedCount: 1,
    rejectedCount: 1,
    rejectedExamples: [],
    cardFeedback: [],
    currentNotes: [],
  };

  const run = vi.fn();
  const replace = vi.fn();
  const loadInput = vi.fn();
  const deps = { run, replace, loadInput };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getTriageSessionRow).mockResolvedValue(session);
    run.mockResolvedValue([{ text: "short fronts", scope: "global" }]);
  });

  it("should run the single model call when only per-card feedback exists", async () => {
    loadInput.mockResolvedValue({
      ...baseInput,
      cardFeedback: [{ verdict: "rejected", reason: "bad_format", note: null, front: "Q" }],
    });

    await expect(distillTriageSession("cts_1", deps)).resolves.toBe("distilled");

    expect(run).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("should not call the model when there is neither overall text nor card feedback", async () => {
    loadInput.mockResolvedValue(baseInput);

    await expect(distillTriageSession("cts_1", deps)).resolves.toBe("skipped");

    expect(run).not.toHaveBeenCalled();
  });

  it("should not call the model for a discarded session", async () => {
    vi.mocked(getTriageSessionRow).mockResolvedValue({ ...session!, status: "discarded" });

    await expect(distillTriageSession("cts_1", deps)).resolves.toBe("skipped");

    expect(loadInput).not.toHaveBeenCalled();
  });
});
