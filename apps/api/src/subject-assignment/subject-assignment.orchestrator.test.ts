import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SubjectCheckResponse } from "@post-anki/shared";

vi.mock("../shared/log.js", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("./subject-assignment.repo.js", () => ({
  listSourcesAwaitingSubject: vi.fn(),
  recordSubjectSuggestion: vi.fn(),
}));
vi.mock("../knowledge-source/knowledge-source-subject-check.orchestrator.js", () => ({ runSubjectCheck: vi.fn() }));
vi.mock("../knowledge-source/knowledge-source-subject-check.candidates.repo.js", () => ({
  listSubjectCheckCandidateSet: vi.fn(),
}));
vi.mock("../mastra/subject-assignment-escalation.agent.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../mastra/subject-assignment-escalation.agent.js")>()),
  runSubjectAssignmentEscalation: vi.fn(),
}));

import { listSubjectCheckCandidateSet } from "../knowledge-source/knowledge-source-subject-check.candidates.repo.js";
import { runSubjectCheck } from "../knowledge-source/knowledge-source-subject-check.orchestrator.js";
import {
  buildEscalationPrompt,
  runSubjectAssignmentEscalation,
} from "../mastra/subject-assignment-escalation.agent.js";
import { runSubjectAssignmentScan } from "./subject-assignment.orchestrator.js";
import { listSourcesAwaitingSubject, recordSubjectSuggestion } from "./subject-assignment.repo.js";

function source(id: string) {
  return { id, rawText: `text of ${id}`, summary: null, cardBodies: [`card of ${id}`] };
}

function ok(subjectId: string, confidence: "high" | "medium" | "low"): SubjectCheckResponse {
  return { status: "ok", recommendations: [{ subjectId, subjectLabel: subjectId, confidence, reason: "r" }], newSubject: null };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listSubjectCheckCandidateSet).mockResolvedValue({
    candidates: [{ id: "sub_x", label: "X", description: null, kind: "other", embedding: null, samples: [] }],
    parents: [],
    hierarchy: [],
  });
  vi.mocked(runSubjectAssignmentEscalation).mockImplementation(async (notes, subjects) => ({
    output: { assignments: notes.map((_note, index) => ({ note: `N${index + 1}`, subject: "S1", confidence: "high" as const })) },
    prompt: buildEscalationPrompt(notes, subjects),
  }));
});

describe("runSubjectAssignmentScan", () => {
  it("should send every low-confidence source to the stronger model in one single call", async () => {
    vi.mocked(listSourcesAwaitingSubject).mockResolvedValue([source("a"), source("b"), source("c")]);
    vi.mocked(runSubjectCheck)
      .mockResolvedValueOnce(ok("sub_a", "high"))
      .mockResolvedValueOnce(ok("sub_b", "low"))
      .mockResolvedValueOnce({ status: "none" });

    const result = await runSubjectAssignmentScan();

    expect(result).toEqual({ checked: 3, escalated: 2 });
    expect(runSubjectAssignmentEscalation).toHaveBeenCalledTimes(1);
    expect(vi.mocked(runSubjectAssignmentEscalation).mock.calls[0]?.[0].map((note) => note.sourceId)).toEqual(["b", "c"]);
    expect(recordSubjectSuggestion).toHaveBeenCalledWith("a", { subjectId: "sub_a", confidence: "high" });
    expect(recordSubjectSuggestion).toHaveBeenCalledWith("b", { subjectId: "sub_x", confidence: "high" });
    expect(recordSubjectSuggestion).toHaveBeenCalledWith("c", { subjectId: "sub_x", confidence: "high" });
  });

  it("should not call the stronger model when every source is confident", async () => {
    vi.mocked(listSourcesAwaitingSubject).mockResolvedValue([source("a")]);
    vi.mocked(runSubjectCheck).mockResolvedValue(ok("sub_a", "medium"));

    await runSubjectAssignmentScan();

    expect(runSubjectAssignmentEscalation).not.toHaveBeenCalled();
  });

  it("should keep the cheap low-confidence suggestion when the stronger model fails and not retry", async () => {
    vi.mocked(listSourcesAwaitingSubject).mockResolvedValue([source("a")]);
    vi.mocked(runSubjectCheck).mockResolvedValue(ok("sub_a", "low"));
    vi.mocked(runSubjectAssignmentEscalation).mockRejectedValue(new Error("boom"));

    await runSubjectAssignmentScan();

    expect(runSubjectAssignmentEscalation).toHaveBeenCalledTimes(1);
    expect(recordSubjectSuggestion).toHaveBeenCalledWith("a", { subjectId: "sub_a", confidence: "low" });
  });

  it("should leave remaining sources unchecked when the budget is out", async () => {
    vi.mocked(listSourcesAwaitingSubject).mockResolvedValue([source("a"), source("b")]);
    vi.mocked(runSubjectCheck).mockResolvedValue({ status: "unavailable", reason: "budget" });

    const result = await runSubjectAssignmentScan();

    expect(result).toEqual({ checked: 0, escalated: 0 });
    expect(runSubjectCheck).toHaveBeenCalledTimes(1);
    expect(recordSubjectSuggestion).not.toHaveBeenCalled();
  });
});
