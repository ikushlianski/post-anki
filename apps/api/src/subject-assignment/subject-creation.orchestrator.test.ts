import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../shared/log.js", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("../llm-call-events/llm-call-events.repo.js", () => ({ countRecentLlmCallEventsByOp: vi.fn() }));
vi.mock("../knowledge-source/knowledge-source-subject-check.candidates.repo.js", () => ({
  listSubjectCheckCandidateSet: vi.fn(),
}));
vi.mock("../mastra/subject-creation.agent.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../mastra/subject-creation.agent.js")>()),
  runSubjectCreation: vi.fn(),
}));
vi.mock("../shared/embeddings-client.js", () => ({ embedTexts: vi.fn() }));
vi.mock("../shared/spend-guard.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../shared/spend-guard.js")>()),
  assertLlmBudgetAvailable: vi.fn(),
}));
vi.mock("./subject-creation.repo.js", () => ({ createSubjectUnlessDuplicate: vi.fn() }));

import { listSubjectCheckCandidateSet } from "../knowledge-source/knowledge-source-subject-check.candidates.repo.js";
import { countRecentLlmCallEventsByOp } from "../llm-call-events/llm-call-events.repo.js";
import { runSubjectCreation } from "../mastra/subject-creation.agent.js";
import { embedTexts } from "../shared/embeddings-client.js";
import { LlmBudgetExceededError, assertLlmBudgetAvailable } from "../shared/spend-guard.js";
import { createSubjectForSource } from "./subject-creation.orchestrator.js";
import { createSubjectUnlessDuplicate } from "./subject-creation.repo.js";

const source = { id: "src_1", rawText: "graph theory notes", summary: null, cardBodies: ["card"] };
const hint = { name: "Graph Theory", parentSubjectId: "sub_eng", parentLabel: "Engineering", kind: "general" as const, reason: "r" };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(countRecentLlmCallEventsByOp).mockResolvedValue(0);
  vi.mocked(listSubjectCheckCandidateSet).mockResolvedValue({
    candidates: [],
    parents: [],
    hierarchy: [{ id: "sub_eng", name: "Engineering", parentId: null }],
  });
  vi.mocked(embedTexts).mockResolvedValue([{ id: "excerpt", embedding: [0, 1] }]);
  vi.mocked(runSubjectCreation).mockResolvedValue({
    output: { create: true, name: "Graph Theory", parentAlias: "S1", confidence: "high", reason: "r" },
    aliases: new Map([["S1", "sub_eng"]]),
  });
  vi.mocked(createSubjectUnlessDuplicate).mockResolvedValue("sub_new");
});

afterEach(() => {
  delete process.env.SUBJECT_AUTO_CREATE_ENABLED;
  delete process.env.SUBJECT_AUTO_CREATE_DAILY_CAP;
});

describe("createSubjectForSource", () => {
  it("should create the subject and return a medium confidence suggestion for it", async () => {
    expect(await createSubjectForSource(source, hint)).toEqual({ subjectId: "sub_new", confidence: "medium" });
    expect(createSubjectUnlessDuplicate).toHaveBeenCalledWith({ name: "Graph Theory", parentId: "sub_eng", languageHint: false });
  });

  it("should do nothing and call no model when the kill switch is off", async () => {
    process.env.SUBJECT_AUTO_CREATE_ENABLED = "off";

    expect(await createSubjectForSource(source, hint)).toBeNull();
    expect(runSubjectCreation).not.toHaveBeenCalled();
    expect(createSubjectUnlessDuplicate).not.toHaveBeenCalled();
  });

  it("should do nothing once the daily cap of creation calls is reached", async () => {
    vi.mocked(countRecentLlmCallEventsByOp).mockResolvedValue(3);

    expect(await createSubjectForSource(source, hint)).toBeNull();
    expect(runSubjectCreation).not.toHaveBeenCalled();
  });

  it("should honour a lower configured daily cap", async () => {
    process.env.SUBJECT_AUTO_CREATE_DAILY_CAP = "1";
    vi.mocked(countRecentLlmCallEventsByOp).mockResolvedValue(1);

    expect(await createSubjectForSource(source, hint)).toBeNull();
    expect(runSubjectCreation).not.toHaveBeenCalled();
  });

  it("should not make two concurrent creation calls beyond the daily cap", async () => {
    process.env.SUBJECT_AUTO_CREATE_DAILY_CAP = "1";
    vi.mocked(runSubjectCreation).mockImplementation(() => new Promise(() => undefined));

    void createSubjectForSource(source, hint);
    await vi.waitFor(() => expect(runSubjectCreation).toHaveBeenCalledTimes(1));

    expect(await createSubjectForSource(source, hint)).toBeNull();
    expect(runSubjectCreation).toHaveBeenCalledTimes(1);
  });

  it("should create nothing when the spend guard refuses", async () => {
    vi.mocked(assertLlmBudgetAvailable).mockRejectedValue(new LlmBudgetExceededError(10, 5));

    expect(await createSubjectForSource(source, hint)).toBeNull();
    expect(runSubjectCreation).not.toHaveBeenCalled();
  });

  it("should create nothing when the model fails instead of throwing out of the scan", async () => {
    vi.mocked(runSubjectCreation).mockRejectedValue(new Error("boom"));

    expect(await createSubjectForSource(source, hint)).toBeNull();
    expect(createSubjectUnlessDuplicate).not.toHaveBeenCalled();
  });

  it("should create nothing when the model is not highly confident", async () => {
    vi.mocked(runSubjectCreation).mockResolvedValue({
      output: { create: true, name: "Graph Theory", parentAlias: "S1", confidence: "medium", reason: "r" },
      aliases: new Map([["S1", "sub_eng"]]),
    });

    expect(await createSubjectForSource(source, hint)).toBeNull();
    expect(createSubjectUnlessDuplicate).not.toHaveBeenCalled();
  });

  it("should create nothing when the duplicate re-check under the lock rejects the name", async () => {
    vi.mocked(createSubjectUnlessDuplicate).mockResolvedValue(null);

    expect(await createSubjectForSource(source, hint)).toBeNull();
  });
});
