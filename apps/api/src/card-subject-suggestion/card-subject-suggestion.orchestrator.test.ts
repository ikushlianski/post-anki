import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SubjectCheckResponse } from "@post-anki/shared";

vi.mock("../shared/log.js", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("./card-subject-suggestion.repo.js", () => ({
  listCardsAwaitingSubject: vi.fn(),
  insertCardSubjectSuggestions: vi.fn(),
}));
vi.mock("../knowledge-source/knowledge-source-subject-check.orchestrator.js", () => ({
  runSubjectCheck: vi.fn(),
}));

import { runSubjectCheck } from "../knowledge-source/knowledge-source-subject-check.orchestrator.js";
import { runCardSubjectSuggestionScan } from "./card-subject-suggestion.orchestrator.js";
import { insertCardSubjectSuggestions, listCardsAwaitingSubject } from "./card-subject-suggestion.repo.js";

function card(id: string, sourceId: string) {
  return { id, body: `body of ${id}`, knowledgeSourceId: sourceId };
}

function ok(subjectId: string, confidence: "high" | "medium" | "low"): SubjectCheckResponse {
  return {
    status: "ok",
    recommendations: [{ subjectId, subjectLabel: subjectId, confidence, reason: "r" }],
    newSubject: null,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  delete process.env.SUBJECT_ASSIGNMENT_ENABLED;
});

describe("runCardSubjectSuggestionScan", () => {
  it("should ask once per source and suggest the same subject for every unplaced card of it", async () => {
    vi.mocked(listCardsAwaitingSubject).mockResolvedValue([card("b1", "s1"), card("b2", "s1"), card("b3", "s2")]);
    vi.mocked(runSubjectCheck).mockResolvedValueOnce(ok("sub_a", "high")).mockResolvedValueOnce(ok("sub_b", "medium"));

    const result = await runCardSubjectSuggestionScan();

    expect(runSubjectCheck).toHaveBeenCalledTimes(2);
    expect(insertCardSubjectSuggestions).toHaveBeenNthCalledWith(1, [
      { knowledgeBitId: "b1", knowledgeSourceId: "s1", suggestedSubjectId: "sub_a", confidence: "high" },
      { knowledgeBitId: "b2", knowledgeSourceId: "s1", suggestedSubjectId: "sub_a", confidence: "high" },
    ]);
    expect(result).toEqual({ checked: 3, suggested: 3, noMatch: 0, calls: 2 });
  });

  it("should remember a no-match answer so the same cards are never paid for again", async () => {
    vi.mocked(listCardsAwaitingSubject).mockResolvedValue([card("b1", "s1"), card("b2", "s2")]);
    vi.mocked(runSubjectCheck).mockResolvedValueOnce(ok("sub_a", "low")).mockResolvedValueOnce({ status: "none" });

    const result = await runCardSubjectSuggestionScan();

    expect(insertCardSubjectSuggestions).toHaveBeenCalledWith([
      { knowledgeBitId: "b1", knowledgeSourceId: "s1", suggestedSubjectId: null, confidence: null },
    ]);
    expect(result).toMatchObject({ suggested: 0, noMatch: 2 });
  });

  it("should leave cards unrecorded when the AI call fails so a later run retries them", async () => {
    vi.mocked(listCardsAwaitingSubject).mockResolvedValue([card("b1", "s1")]);
    vi.mocked(runSubjectCheck).mockResolvedValue({ status: "unavailable", reason: "failed" });

    const result = await runCardSubjectSuggestionScan();

    expect(insertCardSubjectSuggestions).not.toHaveBeenCalled();
    expect(result.checked).toBe(0);
  });

  it("should stop the whole run when the spend budget is reached", async () => {
    vi.mocked(listCardsAwaitingSubject).mockResolvedValue([card("b1", "s1"), card("b2", "s2")]);
    vi.mocked(runSubjectCheck).mockResolvedValue({ status: "unavailable", reason: "budget" });

    const result = await runCardSubjectSuggestionScan();

    expect(runSubjectCheck).toHaveBeenCalledTimes(1);
    expect(result.calls).toBe(1);
  });

  it("should cap the number of AI calls in one run", async () => {
    vi.mocked(listCardsAwaitingSubject).mockResolvedValue(
      Array.from({ length: 9 }, (_, index) => card(`b${index}`, `s${index}`)),
    );
    vi.mocked(runSubjectCheck).mockResolvedValue(ok("sub_a", "high"));

    const result = await runCardSubjectSuggestionScan();

    expect(result.calls).toBe(5);
    expect(insertCardSubjectSuggestions).toHaveBeenCalledTimes(5);
  });

  it("should do nothing when subject assignment is switched off", async () => {
    process.env.SUBJECT_ASSIGNMENT_ENABLED = "off";

    const result = await runCardSubjectSuggestionScan();

    expect(listCardsAwaitingSubject).not.toHaveBeenCalled();
    expect(result).toEqual({ checked: 0, suggested: 0, noMatch: 0, calls: 0 });
  });
});
