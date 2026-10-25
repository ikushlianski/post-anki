import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { LlmBudgetExceededError } from "../shared/spend-guard.js";
import type { EvidenceBit, EvidenceSubject } from "./subject-suggestion-evidence.repo.js";
import { runSubjectSuggestionScanWith } from "./subject-suggestion-scan.js";
import type { ScanDeps } from "./subject-suggestion-scan.types.js";

const THEME_A = [1, 0, 0];
const THEME_B = [0, 1, 0];

function bits(prefix: string, count: number, embedding: number[]): EvidenceBit[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}${i}`,
    body: `${prefix} body ${i}`,
    embedding: [embedding[0]! + i * 0.001, embedding[1]!, embedding[2]!],
  }));
}

function subject(id: string, name: string, embedding: number[] | null, parentId: string | null = null): EvidenceSubject {
  return { id, name, description: null, parentId, embedding };
}

function makeDeps(overrides: {
  unplaced?: EvidenceBit[];
  subjects?: EvidenceSubject[];
  counts?: Map<string, number>;
  poolBits?: EvidenceBit[];
} = {}) {
  const deps = {
    store: {
      insertSuggestionIfNew: vi.fn().mockResolvedValue(true),
      countPending: vi.fn().mockResolvedValue(0),
      getLastRun: vi.fn().mockResolvedValue(null),
      recordRun: vi.fn().mockResolvedValue(undefined),
    },
    evidence: {
      listUnplacedBits: vi.fn().mockResolvedValue(overrides.unplaced ?? []),
      listSubjects: vi.fn().mockResolvedValue(overrides.subjects ?? [subject("s1", "Cooking", THEME_B)]),
      countBitsBySubject: vi.fn().mockResolvedValue(overrides.counts ?? new Map()),
      listBitsForSubjects: vi.fn().mockResolvedValue(overrides.poolBits ?? []),
    },
    grader: {
      gradeNewSubject: vi.fn().mockResolvedValue({ suggest: true, name: "Astronomy", reason: "Stars" }),
      gradeSubSubjects: vi.fn().mockResolvedValue({ modules: [] }),
    },
    embedMissingSubjects: vi.fn().mockResolvedValue(new Map()),
    now: vi.fn().mockReturnValue(new Date("2026-10-24T12:00:00Z")),
  };

  return deps satisfies ScanDeps;
}

const manual = { ignoreDailyCap: true };

describe("runSubjectSuggestionScanWith: new subjects", () => {
  let deps: ReturnType<typeof makeDeps>;

  beforeEach(() => {
    deps = makeDeps({ unplaced: bits("a", 10, THEME_A) });
  });

  it("should suggest a new subject for a tight unplaced group that no subject covers", async () => {
    const result = await runSubjectSuggestionScanWith(deps, manual);

    expect(result).toEqual({ created: 1, skipped: 0, calls: 1, budgetStopped: false });
    expect(deps.store.insertSuggestionIfNew).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "new-subject", parentSubjectId: null, proposedName: "Astronomy", evidenceCount: 10 }),
    );
  });

  it("should take evidence ids and samples from our own clustering, never from the model", async () => {
    deps.grader.gradeNewSubject.mockResolvedValue({
      suggest: true,
      name: "Astronomy",
      reason: "r",
      evidenceIds: ["evil"],
    });

    await runSubjectSuggestionScanWith(deps, manual);

    const params = deps.store.insertSuggestionIfNew.mock.calls[0]![0];

    expect(params.evidenceIds.every((id: string) => id.startsWith("a"))).toBe(true);
    expect(params.evidenceSamples).toHaveLength(3);
  });

  it("should not call the model below 8 unplaced bits", async () => {
    deps = makeDeps({ unplaced: bits("a", 7, THEME_A) });

    const result = await runSubjectSuggestionScanWith(deps, manual);

    expect(result.calls).toBe(0);
    expect(deps.grader.gradeNewSubject).not.toHaveBeenCalled();
  });

  it("should not call the model when an existing subject already covers the group", async () => {
    deps = makeDeps({ unplaced: bits("a", 10, THEME_A), subjects: [subject("s1", "Space", THEME_A)] });

    await runSubjectSuggestionScanWith(deps, manual);

    expect(deps.grader.gradeNewSubject).not.toHaveBeenCalled();
  });

  it("should not call the model for groups smaller than 8", async () => {
    deps = makeDeps({ unplaced: [...bits("a", 5, THEME_A), ...bits("b", 5, THEME_B)], subjects: [] });

    await runSubjectSuggestionScanWith(deps, manual);

    expect(deps.grader.gradeNewSubject).not.toHaveBeenCalled();
  });

  it("should drop a name that already exists as a top-level subject", async () => {
    deps.grader.gradeNewSubject.mockResolvedValue({ suggest: true, name: " cooking! ", reason: "r" });

    const result = await runSubjectSuggestionScanWith(deps, manual);

    expect(deps.store.insertSuggestionIfNew).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
  });

  it("should do nothing when the model says no", async () => {
    deps.grader.gradeNewSubject.mockResolvedValue({ suggest: false, name: null, reason: null });

    const result = await runSubjectSuggestionScanWith(deps, manual);

    expect(result).toEqual({ created: 0, skipped: 0, calls: 1, budgetStopped: false });
  });

  it("should reject a name with markup", async () => {
    deps.grader.gradeNewSubject.mockResolvedValue({ suggest: true, name: "<b>Hack</b>", reason: "r" });

    await runSubjectSuggestionScanWith(deps, manual);

    expect(deps.store.insertSuggestionIfNew).not.toHaveBeenCalled();
  });

  it("should not call the model while a new-subject suggestion is still pending", async () => {
    deps.store.countPending.mockResolvedValue(1);

    const result = await runSubjectSuggestionScanWith(deps, manual);

    expect(result.calls).toBe(0);
  });

  it("should end cleanly with budgetStopped when the spend budget runs out", async () => {
    deps.grader.gradeNewSubject.mockRejectedValue(new LlmBudgetExceededError(5, 5));

    const result = await runSubjectSuggestionScanWith(deps, manual);

    expect(result).toEqual({ created: 0, skipped: 0, calls: 1, budgetStopped: true });
    expect(deps.store.recordRun).toHaveBeenCalledOnce();
  });

  it("should carry on past a malformed model answer", async () => {
    deps.grader.gradeNewSubject.mockRejectedValue(new Error("subject_suggestion_grader_invalid_output"));

    const result = await runSubjectSuggestionScanWith(deps, manual);

    expect(result).toEqual({ created: 0, skipped: 1, calls: 1, budgetStopped: false });
  });
});

describe("runSubjectSuggestionScanWith: embedding subjects", () => {
  it("should end with no suggestions when subjects cannot be embedded", async () => {
    const deps = makeDeps({
      unplaced: bits("a", 10, THEME_A),
      subjects: [subject("s1", "Cooking", null)],
    });

    deps.embedMissingSubjects.mockRejectedValue(new Error("embeddings down"));

    const result = await runSubjectSuggestionScanWith(deps, manual);

    expect(result).toEqual({ created: 0, skipped: 0, calls: 0, budgetStopped: false });
    expect(deps.grader.gradeNewSubject).not.toHaveBeenCalled();
  });

  it("should use freshly computed subject embeddings for the similarity check", async () => {
    const deps = makeDeps({
      unplaced: bits("a", 10, THEME_A),
      subjects: [subject("s1", "Space", null)],
    });

    deps.embedMissingSubjects.mockResolvedValue(new Map([["s1", THEME_A]]));

    await runSubjectSuggestionScanWith(deps, manual);

    expect(deps.grader.gradeNewSubject).not.toHaveBeenCalled();
  });
});

describe("runSubjectSuggestionScanWith: daily pass", () => {
  it("should skip when it already ran today (UTC)", async () => {
    const deps = makeDeps({ unplaced: bits("a", 10, THEME_A) });

    deps.store.getLastRun.mockResolvedValue({ ranAt: new Date("2026-10-24T00:01:00Z"), poolSize: 0 });

    const result = await runSubjectSuggestionScanWith(deps, { ignoreDailyCap: false });

    expect(result.calls).toBe(0);
    expect(deps.store.recordRun).not.toHaveBeenCalled();
  });

  it("should skip when the unplaced pool grew by fewer than 8 since the last run", async () => {
    const deps = makeDeps({ unplaced: bits("a", 12, THEME_A) });

    deps.store.getLastRun.mockResolvedValue({ ranAt: new Date("2026-10-23T10:00:00Z"), poolSize: 5 });

    const result = await runSubjectSuggestionScanWith(deps, { ignoreDailyCap: false });

    expect(result.calls).toBe(0);
  });

  it("should run on a new day once the pool grew enough, recording it as a daily run", async () => {
    const deps = makeDeps({ unplaced: bits("a", 12, THEME_A) });

    deps.store.getLastRun.mockResolvedValue({ ranAt: new Date("2026-10-23T10:00:00Z"), poolSize: 3 });

    const result = await runSubjectSuggestionScanWith(deps, { ignoreDailyCap: false });

    expect(result.created).toBe(1);
    expect(deps.store.recordRun).toHaveBeenCalledWith({ trigger: "daily", calls: 1, created: 1, poolSize: 12 });
  });

  it("should let an explicit scan ignore the daily cap", async () => {
    const deps = makeDeps({ unplaced: bits("a", 10, THEME_A) });

    deps.store.getLastRun.mockResolvedValue({ ranAt: new Date("2026-10-24T00:01:00Z"), poolSize: 10 });

    const result = await runSubjectSuggestionScanWith(deps, manual);

    expect(result.calls).toBe(1);
    expect(deps.store.recordRun).toHaveBeenCalledWith(expect.objectContaining({ trigger: "manual" }));
  });
});

describe("runSubjectSuggestionScanWith: sub-subjects", () => {
  const parent = subject("p", "Business", null);
  const poolBits = [...bits("x", 20, THEME_A), ...bits("y", 20, THEME_B)];

  function subDeps() {
    const deps = makeDeps({
      subjects: [parent],
      counts: new Map([["p", 45]]),
      poolBits,
    });

    deps.embedMissingSubjects.mockResolvedValue(new Map());
    deps.grader.gradeSubSubjects.mockResolvedValue({
      modules: [
        { clusterIndex: 0, name: "Sales", reason: "r1" },
        { clusterIndex: 1, name: "Ops", reason: "r2" },
      ],
    });

    return deps;
  }

  it("should propose one row per module for a big subject with two clear clusters", async () => {
    const deps = subDeps();

    const result = await runSubjectSuggestionScanWith(deps, manual);

    expect(result.created).toBe(2);
    expect(deps.store.insertSuggestionIfNew).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "sub-subject", parentSubjectId: "p", proposedName: "Sales", evidenceCount: 20 }),
    );
  });

  it("should not call the model for a subject under 40 bits", async () => {
    const deps = subDeps();

    deps.evidence.countBitsBySubject.mockResolvedValue(new Map([["p", 39]]));

    await runSubjectSuggestionScanWith(deps, manual);

    expect(deps.grader.gradeSubSubjects).not.toHaveBeenCalled();
  });

  it("should not call the model when the bits form fewer than two clusters", async () => {
    const deps = subDeps();

    deps.evidence.listBitsForSubjects.mockResolvedValue(bits("x", 45, THEME_A));

    await runSubjectSuggestionScanWith(deps, manual);

    expect(deps.grader.gradeSubSubjects).not.toHaveBeenCalled();
  });

  it("should not suggest under a subject already at the depth cap", async () => {
    const deps = subDeps();

    deps.evidence.listSubjects.mockResolvedValue([
      subject("r", "Root", null),
      subject("m", "Mid", null, "r"),
      subject("p", "Deep", null, "m"),
    ]);
    deps.evidence.countBitsBySubject.mockResolvedValue(new Map([["p", 45]]));

    await runSubjectSuggestionScanWith(deps, manual);

    expect(deps.grader.gradeSubSubjects).not.toHaveBeenCalled();
  });

  it("should use the Common child's bits when the subject only has a Common child", async () => {
    const deps = subDeps();

    deps.evidence.listSubjects.mockResolvedValue([parent, subject("c", "Common", null, "p")]);
    deps.evidence.countBitsBySubject.mockResolvedValue(new Map([["c", 50]]));

    const result = await runSubjectSuggestionScanWith(deps, manual);

    expect(result.created).toBe(2);
    expect(deps.evidence.listBitsForSubjects).toHaveBeenCalledWith(["p", "c"], expect.any(Number));
  });

  it("should suggest for a parent whose own cards are enough even with ordinary sub-subjects", async () => {
    const deps = subDeps();

    deps.evidence.listSubjects.mockResolvedValue([parent, subject("s", "Support", null, "p")]);
    deps.evidence.countBitsBySubject.mockResolvedValue(new Map([["p", 45]]));

    const result = await runSubjectSuggestionScanWith(deps, manual);

    expect(result.created).toBe(2);
    expect(deps.evidence.listBitsForSubjects).toHaveBeenCalledWith(["p"], expect.any(Number));
  });

  it("should add a Common child's cards to the parent's own cards to reach the minimum", async () => {
    const deps = subDeps();

    deps.evidence.listSubjects.mockResolvedValue([parent, subject("c", "Common", null, "p")]);
    deps.evidence.countBitsBySubject.mockResolvedValue(new Map([["p", 25], ["c", 25]]));

    await runSubjectSuggestionScanWith(deps, manual);

    expect(deps.grader.gradeSubSubjects).toHaveBeenCalled();
  });

  it("should never split a Common sub-subject itself", async () => {
    const deps = subDeps();

    deps.evidence.listSubjects.mockResolvedValue([parent, subject("c", "Common", null, "p")]);
    deps.evidence.countBitsBySubject.mockResolvedValue(new Map([["c", 50]]));

    await runSubjectSuggestionScanWith(deps, manual);

    expect(deps.evidence.listBitsForSubjects).not.toHaveBeenCalledWith(["c"], expect.any(Number));
  });

  it("should skip a parent that already has 6 pending suggestions", async () => {
    const deps = subDeps();

    deps.store.countPending.mockImplementation(async (kind: string) => (kind === "sub-subject" ? 6 : 0));

    await runSubjectSuggestionScanWith(deps, manual);

    expect(deps.grader.gradeSubSubjects).not.toHaveBeenCalled();
  });

  it("should drop a module named like an existing child", async () => {
    const deps = subDeps();

    deps.evidence.listSubjects.mockResolvedValue([parent, subject("c", "Sales", null, "p"), subject("d", "Common", null, "p")]);
    deps.evidence.countBitsBySubject.mockResolvedValue(new Map([["d", 50]]));

    const result = await runSubjectSuggestionScanWith(deps, manual);

    expect(result.created).toBe(1);
    expect(deps.store.insertSuggestionIfNew).not.toHaveBeenCalledWith(expect.objectContaining({ proposedName: "Sales" }));
  });

  it("should propose nothing when the model returns fewer than two valid modules", async () => {
    const deps = subDeps();

    deps.grader.gradeSubSubjects.mockResolvedValue({ modules: [{ clusterIndex: 0, name: "Sales", reason: "r" }] });

    const result = await runSubjectSuggestionScanWith(deps, manual);

    expect(result.created).toBe(0);
  });

  it("should ignore module cluster indexes the model made up", async () => {
    const deps = subDeps();

    deps.grader.gradeSubSubjects.mockResolvedValue({
      modules: [
        { clusterIndex: 0, name: "Sales", reason: "r" },
        { clusterIndex: 9, name: "Ghost", reason: "r" },
      ],
    });

    const result = await runSubjectSuggestionScanWith(deps, manual);

    expect(result.created).toBe(0);
  });

  it("should stop at the 8-call cap", async () => {
    const subjects = Array.from({ length: 12 }, (_, i) => subject(`p${i}`, `Parent ${i}`, null));
    const deps = subDeps();

    deps.evidence.listSubjects.mockResolvedValue(subjects);
    deps.evidence.countBitsBySubject.mockResolvedValue(new Map(subjects.map((s) => [s.id, 50])));
    deps.grader.gradeSubSubjects.mockResolvedValue({ modules: [] });

    const result = await runSubjectSuggestionScanWith(deps, manual);

    expect(result.calls).toBe(8);
  });

  it("should end cleanly when the budget runs out mid-scan", async () => {
    const deps = subDeps();

    deps.grader.gradeSubSubjects.mockRejectedValue(new LlmBudgetExceededError(5, 5));

    const result = await runSubjectSuggestionScanWith(deps, manual);

    expect(result.budgetStopped).toBe(true);
  });
});
