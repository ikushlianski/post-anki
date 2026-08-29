import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StructureTurn } from "@post-anki/shared";

// Avoids real p-retry backoff delays (default ~1s/2s between attempts) in
// the event-logging tests below, which only care about the wrapper's
// final-outcome behavior, not the retry timing itself (untested here,
// exercised for real by p-retry's own test suite).
vi.mock("p-retry", () => ({
  default: (fn: () => Promise<unknown>) => fn(),
}));

const getCurriculum = vi.fn();
const getCurriculumPromptContext = vi.fn();
const getLatestPendingResearchCandidates = vi.fn();
const getLatestStructureSnapshot = vi.fn();
const getStructureTurns = vi.fn();
const insertStructureResearchCandidates = vi.fn();
const insertStructureTurn = vi.fn();
const maxModuleOrder = vi.fn(async () => 0);
const saveCurriculumPlan = vi.fn();
const setCurriculumStatus = vi.fn();
const setCurriculumStrictOrder = vi.fn();
const setResearchCandidateStatuses = vi.fn();
const updateStructureTurn = vi.fn();

vi.mock("./curriculum.repo.js", () => ({
  getCurriculum: (...args: unknown[]) => getCurriculum(...args),
  getCurriculumPromptContext: (...args: unknown[]) => getCurriculumPromptContext(...args),
  getLatestPendingResearchCandidates: (...args: unknown[]) => getLatestPendingResearchCandidates(...args),
  getLatestStructureSnapshot: (...args: unknown[]) => getLatestStructureSnapshot(...args),
  getStructureTurns: (...args: unknown[]) => getStructureTurns(...args),
  insertStructureResearchCandidates: (...args: unknown[]) => insertStructureResearchCandidates(...args),
  insertStructureTurn: (...args: unknown[]) => insertStructureTurn(...args),
  maxModuleOrder: () => maxModuleOrder(),
  saveCurriculumPlan: (...args: unknown[]) => saveCurriculumPlan(...args),
  setCurriculumStatus: (...args: unknown[]) => setCurriculumStatus(...args),
  setCurriculumStrictOrder: (...args: unknown[]) => setCurriculumStrictOrder(...args),
  setResearchCandidateStatuses: (...args: unknown[]) => setResearchCandidateStatuses(...args),
  updateStructureTurn: (...args: unknown[]) => updateStructureTurn(...args),
}));

const agentGenerate = vi.fn();

vi.mock("../mastra/mastra.js", () => ({
  AGENT_KEYS: { docResearchArchitect: "docResearchArchitect", structureEditor: "structureEditor" },
  getMastra: () => ({
    getAgent: () => ({ generate: agentGenerate }),
  }),
}));

const gatherTrustedSourceCandidates = vi.fn();

vi.mock("./tech-research-grounding.js", () => ({
  gatherTrustedSourceCandidates: (...args: unknown[]) => gatherTrustedSourceCandidates(...args),
}));

const buildStructureToolTurnPrompt = vi.fn((..._args: unknown[]) => "tool turn prompt");

vi.mock("./curriculum-prompt.js", () => ({
  buildStructureDraftPrompt: vi.fn(() => "draft prompt"),
  buildStructureGuidedRegenPrompt: vi.fn(() => "regen prompt"),
  buildStructureToolTurnPrompt: (...args: unknown[]) => buildStructureToolTurnPrompt(...args),
}));

vi.mock("./source-text.js", () => ({
  assembleAllSourceText: vi.fn(async () => ""),
}));

vi.mock("../tag/tag.repo.js", () => ({
  listTags: vi.fn(async () => []),
}));

vi.mock("../shared/log.js", () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const recordLlmCallEvent = vi.fn();

vi.mock("../llm-call-events/llm-call-events.repo.js", () => ({
  recordLlmCallEvent: (...args: unknown[]) => recordLlmCallEvent(...args),
}));

const {
  generateDraftStructure,
  resolveSupplementalResearch,
  retryDraftStructure,
  submitStructureTurn,
} = await import("./curriculum-structure.js");

function uniqueViolation(): Error {
  const err = new Error(
    'duplicate key value violates unique constraint "curriculum_structure_turns_pending_assistant_unique"',
  );

  (err as Error & { code: string }).code = "23505";

  return err;
}

function makeTurn(overrides: Partial<StructureTurn> = {}): StructureTurn {
  return {
    id: "turn_1",
    curriculumId: "cur_1",
    role: "user",
    message: "hello",
    structureSnapshot: null,
    splitSuggestion: null,
    toolActions: [],
    status: "complete",
    pendingResearchCandidates: [],
    createdAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

const curriculum = {
  id: "cur_1",
  subjectId: "sub_1",
  name: "Event-Driven Systems",
  status: "shaping_structure",
  learningStatus: "not_started",
  speed: "normal",
  hinting: true,
  defaultDepth: "working",
  origin: "sources",
  strictOrder: false,
  preAssessmentCompletedAt: null,
} as const;

describe("submitStructureTurn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurriculum.mockResolvedValue(curriculum);
    getCurriculumPromptContext.mockResolvedValue({
      curriculumName: "Event-Driven Systems",
      curriculumDescription: null,
      subjectName: "Distributed Systems",
      subjectDescription: null,
    });
    gatherTrustedSourceCandidates.mockResolvedValue([]);
  });

  describe("the turn-count cap", () => {
    it("rejects with turn_limit_reached and never writes or calls the agent once the cap is hit", async () => {
      const existingTurns = Array.from({ length: 40 }, (_, i) => makeTurn({ id: `turn_${i}` }));

      getStructureTurns.mockResolvedValue(existingTurns);

      const result = await submitStructureTurn("cur_1", { message: "one more thing" });

      expect(result).toEqual({ ok: false, code: "turn_limit_reached" });
      expect(insertStructureTurn).not.toHaveBeenCalled();
      expect(agentGenerate).not.toHaveBeenCalled();
    });

    it("still proceeds normally just under the cap", async () => {
      const existingTurns = [
        ...Array.from({ length: 38 }, (_, i) => makeTurn({ id: `turn_${i}` })),
        makeTurn({
          id: "turn_last",
          role: "assistant",
          structureSnapshot: { modules: [], strictOrder: false },
        }),
      ];

      getStructureTurns.mockResolvedValue(existingTurns);
      getLatestStructureSnapshot.mockResolvedValue({ modules: [], strictOrder: false });
      insertStructureTurn.mockResolvedValue("pending_turn_id");
      agentGenerate.mockResolvedValue({ text: "Updated the draft." });

      const result = await submitStructureTurn("cur_1", { message: "tweak module two" });

      expect(result).toEqual({ ok: true });
      expect(insertStructureTurn).toHaveBeenCalled();
      expect(agentGenerate).toHaveBeenCalledTimes(1);
      expect(updateStructureTurn).toHaveBeenCalledWith(
        "pending_turn_id",
        expect.objectContaining({ status: "complete" }),
      );
    });
  });

  describe("the pending-assistant-turn conflict guard", () => {
    it("translates a unique-violation on the placeholder insert into turn_in_progress, without touching the LLM", async () => {
      getStructureTurns.mockResolvedValue([makeTurn({ structureSnapshot: { modules: [], strictOrder: false } })]);
      insertStructureTurn.mockImplementation(async (_curriculumId: string, draft: { role: string; status?: string }) => {
        if (draft.role === "assistant" && draft.status === "pending") {
          throw uniqueViolation();
        }

        return "user_turn_id";
      });

      const result = await submitStructureTurn("cur_1", { message: "double-submitted message" });

      expect(result).toEqual({ ok: false, code: "turn_in_progress" });
      expect(agentGenerate).not.toHaveBeenCalled();
    });

    it("still rethrows an unrelated insert failure instead of swallowing it", async () => {
      getStructureTurns.mockResolvedValue([makeTurn({ structureSnapshot: { modules: [], strictOrder: false } })]);
      insertStructureTurn.mockImplementation(async (_curriculumId: string, draft: { role: string; status?: string }) => {
        if (draft.role === "assistant" && draft.status === "pending") {
          throw new Error("connection reset");
        }

        return "user_turn_id";
      });

      await expect(submitStructureTurn("cur_1", { message: "hello" })).rejects.toThrow(
        "connection reset",
      );
    });
  });

  describe("finalizeStalePendingTurn's interaction with the conflict guard", () => {
    it("leaves a fresh (live) pending turn alone, so the index guard still catches the second call", async () => {
      const freshPendingTurn = makeTurn({
        id: "turn_pending_fresh",
        role: "assistant",
        status: "pending",
        createdAt: new Date().toISOString(),
      });

      getStructureTurns.mockResolvedValue([
        makeTurn({ id: "turn_0", structureSnapshot: { modules: [], strictOrder: false } }),
        freshPendingTurn,
      ]);
      insertStructureTurn.mockImplementation(async (_curriculumId: string, draft: { role: string; status?: string }) => {
        if (draft.role === "assistant" && draft.status === "pending") {
          throw uniqueViolation();
        }

        return "user_turn_id";
      });

      const result = await submitStructureTurn("cur_1", { message: "second tab, still in flight" });

      expect(result).toEqual({ ok: false, code: "turn_in_progress" });
      expect(updateStructureTurn).not.toHaveBeenCalledWith(
        "turn_pending_fresh",
        expect.objectContaining({ status: "failed" }),
      );
    });

    it("still finalizes a genuinely stale pending turn left by a crashed process", async () => {
      const staleTurn = makeTurn({
        id: "turn_pending_stale",
        role: "assistant",
        status: "pending",
        createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      });

      getStructureTurns.mockResolvedValue([staleTurn]);
      insertStructureTurn.mockResolvedValue("some_turn_id");

      await submitStructureTurn("cur_1", { message: "resend after a crash" });

      expect(updateStructureTurn).toHaveBeenCalledWith(
        "turn_pending_stale",
        expect.objectContaining({ status: "failed" }),
      );
    });
  });

  describe("the supplemental-research review gate (researchGapLabels flagged)", () => {
    it("gathers and persists candidates for review, without ever calling the structure-editor agent", async () => {
      const priorTurn = makeTurn({
        id: "turn_prior",
        role: "assistant",
        structureSnapshot: { modules: [], strictOrder: false },
      });

      getStructureTurns.mockResolvedValue([priorTurn]);
      getLatestStructureSnapshot.mockResolvedValue({ modules: [], strictOrder: false });
      insertStructureTurn.mockResolvedValue("pending_turn_id");
      gatherTrustedSourceCandidates.mockResolvedValue([
        { url: "https://example.com/a", title: "A trusted source", discoveryTier: "trusted_search" },
      ]);

      const result = await submitStructureTurn("cur_1", {
        message: "look into module 2 more",
        researchGapLabels: ["Module 2"],
      });

      expect(result).toEqual({ ok: true });
      expect(agentGenerate).not.toHaveBeenCalled();
      expect(insertStructureResearchCandidates).toHaveBeenCalledWith(
        "cur_1",
        "pending_turn_id",
        "Module 2",
        [{ url: "https://example.com/a", title: "A trusted source", discoveryTier: "trusted_search" }],
      );
      expect(updateStructureTurn).toHaveBeenCalledWith(
        "pending_turn_id",
        expect.objectContaining({ status: "complete", structureSnapshot: { modules: [], strictOrder: false } }),
      );
    });

    it("falls through to a normal edit turn when the supplemental search finds nothing to review", async () => {
      const priorTurn = makeTurn({
        id: "turn_prior",
        role: "assistant",
        structureSnapshot: { modules: [], strictOrder: false },
      });

      getStructureTurns.mockResolvedValue([priorTurn]);
      getLatestStructureSnapshot.mockResolvedValue({ modules: [], strictOrder: false });
      insertStructureTurn.mockResolvedValue("pending_turn_id");
      gatherTrustedSourceCandidates.mockResolvedValue([]);
      agentGenerate.mockResolvedValue({ text: "Updated the draft." });

      const result = await submitStructureTurn("cur_1", {
        message: "look into module 2 more",
        researchGapLabels: ["Module 2"],
      });

      expect(result).toEqual({ ok: true });
      expect(agentGenerate).toHaveBeenCalledTimes(1);
      expect(insertStructureResearchCandidates).not.toHaveBeenCalled();
    });
  });
});

describe("resolveSupplementalResearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurriculum.mockResolvedValue(curriculum);
    getCurriculumPromptContext.mockResolvedValue({
      curriculumName: "Event-Driven Systems",
      curriculumDescription: null,
      subjectName: "Distributed Systems",
      subjectDescription: null,
    });
    gatherTrustedSourceCandidates.mockResolvedValue([]);
  });

  const pendingBatch = [
    { id: "c1", label: "Module 2", title: "A trusted source", value: "https://example.com/a", approvalStatus: "pending" as const },
    { id: "c2", label: "Module 2", title: "B trusted source", value: "https://example.com/b", approvalStatus: "pending" as const },
  ];

  it("approves only the selected subset and feeds just those into the editor prompt as supplementalSources", async () => {
    const priorTurn = makeTurn({
      id: "turn_prior",
      role: "assistant",
      structureSnapshot: { modules: [], strictOrder: false },
    });

    getStructureTurns.mockResolvedValue([priorTurn]);
    getLatestPendingResearchCandidates.mockResolvedValue(pendingBatch);
    getLatestStructureSnapshot.mockResolvedValue({ modules: [], strictOrder: false });
    insertStructureTurn.mockResolvedValue("pending_turn_id");
    agentGenerate.mockResolvedValue({ text: "Updated the draft." });

    const result = await resolveSupplementalResearch("cur_1", { approvedCandidateIds: ["c1"] });

    expect(result).toEqual({ ok: true });
    expect(setResearchCandidateStatuses).toHaveBeenCalledWith(["c1"], "approved");
    expect(setResearchCandidateStatuses).toHaveBeenCalledWith(["c2"], "rejected");
    expect(agentGenerate).toHaveBeenCalledTimes(1);
    expect(buildStructureToolTurnPrompt).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      {
        researchGapLabels: ["Module 2"],
        supplementalSources: [{ url: "https://example.com/a", title: "A trusted source" }],
        existingTags: [],
      },
    );
  });

  it("treats an empty approval list as skip — rejects every surfaced candidate and edits with no supplemental sources", async () => {
    const priorTurn = makeTurn({
      id: "turn_prior",
      role: "assistant",
      structureSnapshot: { modules: [], strictOrder: false },
    });

    getStructureTurns.mockResolvedValue([priorTurn]);
    getLatestPendingResearchCandidates.mockResolvedValue(pendingBatch);
    getLatestStructureSnapshot.mockResolvedValue({ modules: [], strictOrder: false });
    insertStructureTurn.mockResolvedValue("pending_turn_id");
    agentGenerate.mockResolvedValue({ text: "Updated the draft." });

    const result = await resolveSupplementalResearch("cur_1", { approvedCandidateIds: [] });

    expect(result).toEqual({ ok: true });
    expect(setResearchCandidateStatuses).toHaveBeenCalledWith([], "approved");
    expect(setResearchCandidateStatuses).toHaveBeenCalledWith(["c1", "c2"], "rejected");
    expect(buildStructureToolTurnPrompt).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      { researchGapLabels: [], supplementalSources: [], existingTags: [] },
    );
  });

  it("rejects with turn_limit_reached without touching candidates once the turn cap is hit", async () => {
    const existingTurns = Array.from({ length: 40 }, (_, i) => makeTurn({ id: `turn_${i}` }));

    getStructureTurns.mockResolvedValue(existingTurns);

    const result = await resolveSupplementalResearch("cur_1", { approvedCandidateIds: ["c1"] });

    expect(result).toEqual({ ok: false, code: "turn_limit_reached" });
    expect(getLatestPendingResearchCandidates).not.toHaveBeenCalled();
    expect(agentGenerate).not.toHaveBeenCalled();
  });

  it("translates a unique-violation on the placeholder insert into turn_in_progress, without touching the LLM", async () => {
    getStructureTurns.mockResolvedValue([
      makeTurn({ structureSnapshot: { modules: [], strictOrder: false } }),
    ]);
    getLatestPendingResearchCandidates.mockResolvedValue(pendingBatch);
    insertStructureTurn.mockRejectedValue(uniqueViolation());

    const result = await resolveSupplementalResearch("cur_1", { approvedCandidateIds: ["c1"] });

    expect(result).toEqual({ ok: false, code: "turn_in_progress" });
    expect(agentGenerate).not.toHaveBeenCalled();
  });
});

describe("generateDraftStructure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("backs off quietly when another draft-generation attempt already owns the pending placeholder", async () => {
    insertStructureTurn.mockRejectedValue(uniqueViolation());

    await generateDraftStructure("cur_1");

    expect(insertStructureTurn).toHaveBeenCalledTimes(1);
    expect(getCurriculum).not.toHaveBeenCalled();
    expect(setCurriculumStatus).not.toHaveBeenCalled();
  });

  it("still rethrows an unrelated placeholder-insert failure", async () => {
    insertStructureTurn.mockRejectedValue(new Error("connection reset"));

    await expect(generateDraftStructure("cur_1")).rejects.toThrow("connection reset");
  });

  it("sets shaping_structure immediately after the placeholder insert succeeds, before the trusted-source search or the agent call", async () => {
    insertStructureTurn.mockResolvedValue("placeholder_turn_id");
    getCurriculum.mockResolvedValue(curriculum);
    getCurriculumPromptContext.mockResolvedValue({
      curriculumName: "Event-Driven Systems",
      curriculumDescription: null,
      subjectName: "Distributed Systems",
      subjectDescription: null,
    });
    gatherTrustedSourceCandidates.mockImplementation(() => new Promise(() => {}));

    void generateDraftStructure("cur_1");

    await vi.waitFor(() => {
      expect(setCurriculumStatus).toHaveBeenCalledWith("cur_1", "shaping_structure");
    });

    expect(agentGenerate).not.toHaveBeenCalled();
  });
});

describe("retryDraftStructure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurriculum.mockResolvedValue(curriculum);
    getCurriculumPromptContext.mockResolvedValue({
      curriculumName: "Event-Driven Systems",
      curriculumDescription: null,
      subjectName: "Distributed Systems",
      subjectDescription: null,
    });
    gatherTrustedSourceCandidates.mockResolvedValue([]);
  });

  it("finalizes a stranded stale pending turn before attempting a new draft, instead of silently no-oping on the unique-index conflict", async () => {
    const staleTurn = makeTurn({
      id: "turn_stale",
      role: "assistant",
      status: "pending",
      createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    });

    const callOrder: string[] = [];

    getStructureTurns.mockImplementation(async () => {
      callOrder.push("getStructureTurns");
      return [staleTurn];
    });
    updateStructureTurn.mockImplementation(async () => {
      callOrder.push("updateStructureTurn");
    });
    insertStructureTurn.mockImplementation(async () => {
      callOrder.push("insertStructureTurn");
      return "placeholder_turn_id";
    });
    agentGenerate.mockResolvedValue({ object: { modules: [], strictOrder: false } });

    await retryDraftStructure("cur_1");

    expect(updateStructureTurn).toHaveBeenCalledWith(
      "turn_stale",
      expect.objectContaining({ status: "failed" }),
    );
    expect(callOrder.indexOf("updateStructureTurn")).toBeGreaterThanOrEqual(0);
    expect(callOrder.indexOf("updateStructureTurn")).toBeLessThan(
      callOrder.indexOf("insertStructureTurn"),
    );
    expect(insertStructureTurn).toHaveBeenCalledTimes(1);
  });

  it("leaves a fresh pending turn alone and still lets the new attempt back off on the unique-index conflict", async () => {
    const freshTurn = makeTurn({
      id: "turn_fresh",
      role: "assistant",
      status: "pending",
      createdAt: new Date().toISOString(),
    });

    getStructureTurns.mockResolvedValue([freshTurn]);
    insertStructureTurn.mockRejectedValue(uniqueViolation());

    await retryDraftStructure("cur_1");

    expect(updateStructureTurn).not.toHaveBeenCalledWith(
      "turn_fresh",
      expect.objectContaining({ status: "failed" }),
    );
    expect(setCurriculumStatus).not.toHaveBeenCalled();
  });
});

describe("generateWithRetry event logging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurriculum.mockResolvedValue(curriculum);
    getCurriculumPromptContext.mockResolvedValue({
      curriculumName: "Event-Driven Systems",
      curriculumDescription: null,
      subjectName: "Distributed Systems",
      subjectDescription: null,
    });
    gatherTrustedSourceCandidates.mockResolvedValue([]);
  });

  it("records a successful generateDraftStructure call under the doc-research architect's agent key", async () => {
    insertStructureTurn.mockResolvedValue("placeholder_turn_id");
    agentGenerate.mockResolvedValue({ object: { modules: [], strictOrder: false } });

    await generateDraftStructure("cur_1");

    expect(recordLlmCallEvent).toHaveBeenCalledTimes(1);
    expect(recordLlmCallEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        curriculumId: "cur_1",
        op: "generateDraftStructure",
        agentKey: "docResearchArchitect",
        success: true,
        errorMessage: null,
      }),
    );
    expect(recordLlmCallEvent.mock.calls[0]![0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it("records a failed event once the retry sequence is exhausted, and still finalizes the turn as failed", async () => {
    insertStructureTurn.mockResolvedValue("placeholder_turn_id");
    agentGenerate.mockRejectedValue(new Error("model unavailable"));

    await generateDraftStructure("cur_1");

    expect(recordLlmCallEvent).toHaveBeenCalledTimes(1);
    expect(recordLlmCallEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        curriculumId: "cur_1",
        op: "generateDraftStructure",
        agentKey: "docResearchArchitect",
        success: false,
        errorMessage: "model unavailable",
      }),
    );
    expect(updateStructureTurn).toHaveBeenCalledWith(
      "placeholder_turn_id",
      expect.objectContaining({ status: "failed" }),
    );
  });

  it("records the structure-editor agent key for a normal submitStructureTurn call", async () => {
    const priorTurn = makeTurn({
      id: "turn_prior",
      role: "assistant",
      structureSnapshot: { modules: [], strictOrder: false },
    });

    getStructureTurns.mockResolvedValue([priorTurn]);
    getLatestStructureSnapshot.mockResolvedValue({ modules: [], strictOrder: false });
    insertStructureTurn.mockResolvedValue("pending_turn_id");
    agentGenerate.mockResolvedValue({ text: "Updated the draft." });

    await submitStructureTurn("cur_1", { message: "tweak module two" });

    expect(recordLlmCallEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        curriculumId: "cur_1",
        op: "submitStructureTurn",
        agentKey: "structureEditor",
        success: true,
        errorMessage: null,
      }),
    );
  });

  it("does not let an event-logging failure mask or break the real generate() outcome", async () => {
    insertStructureTurn.mockResolvedValue("placeholder_turn_id");
    agentGenerate.mockResolvedValue({ object: { modules: [], strictOrder: false } });
    recordLlmCallEvent.mockRejectedValue(new Error("db unavailable"));

    await expect(generateDraftStructure("cur_1")).resolves.toBeUndefined();

    expect(updateStructureTurn).toHaveBeenCalledWith(
      "placeholder_turn_id",
      expect.objectContaining({ status: "complete" }),
    );
  });
});
