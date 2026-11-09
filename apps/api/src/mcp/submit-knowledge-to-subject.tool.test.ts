import { afterEach, describe, expect, it, vi } from "vitest";
import type { KnowledgeSource } from "../knowledge-source/knowledge-source.repo.js";

vi.mock("../db/client.js", () => ({ getDb: vi.fn() }));
vi.mock("../subject/subject-path.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../subject/subject-path.js")>()),
  ensureSubjectPath: vi.fn(),
}));
vi.mock("../knowledge-source/knowledge-source-keyed-insert.repo.js", () => ({
  insertKeyedKnowledgeSources: vi.fn(),
}));
vi.mock("../knowledge-source/knowledge-source-kick.js", () => ({ kickSourcesAfterAdd: vi.fn() }));

const { ensureSubjectPath } = await import("../subject/subject-path.js");
const { insertKeyedKnowledgeSources } = await import(
  "../knowledge-source/knowledge-source-keyed-insert.repo.js"
);
const { kickSourcesAfterAdd } = await import("../knowledge-source/knowledge-source-kick.js");
const { submitKnowledgeToSubject } = await import("./submit-knowledge-to-subject.tool.js");

afterEach(() => {
  vi.resetAllMocks();
});

function note(key = "work:abcdef123", text = "Some note") {
  return { key, text };
}

function row(id: string, importKey: string): KnowledgeSource {
  return { id, importKey } as KnowledgeSource;
}

function subjectOk() {
  vi.mocked(ensureSubjectPath).mockResolvedValue({
    subjectId: "sub_a",
    subjectName: "AIPeak",
    subjectPath: "Work/AIPeak",
    createdSubjects: ["Work", "Work/AIPeak"],
  });
}

describe("submitKnowledgeToSubject", () => {
  it("should refuse a token without knowledge:write before touching subjects or sources", async () => {
    const result = await submitKnowledgeToSubject({ subjectPath: "Work/AIPeak", notes: [note()] }, { scopes: [] });

    expect(result).toEqual({ error: "missing_scope" });
    expect(ensureSubjectPath).not.toHaveBeenCalled();
    expect(insertKeyedKnowledgeSources).not.toHaveBeenCalled();
  });

  it("should refuse an invalid path and create no subject and no source", async () => {
    const result = await submitKnowledgeToSubject({ subjectPath: "A/B/C", notes: [note()] }, { scopes: ["*"] });

    expect(result).toEqual({ error: "invalid_path" });
    expect(ensureSubjectPath).not.toHaveBeenCalled();
    expect(insertKeyedKnowledgeSources).not.toHaveBeenCalled();
  });

  it("should file notes under the resolved subject, report counts, and kick only new sources once", async () => {
    subjectOk();
    vi.mocked(insertKeyedKnowledgeSources).mockResolvedValue([row("ks_1", "work:aaaaaaaa")]);

    const result = await submitKnowledgeToSubject(
      { subjectPath: " Work / AIPeak ", notes: [note("work:aaaaaaaa", "A"), note("work:bbbbbbbb", "B")] },
      { scopes: ["knowledge:write"] },
    );

    expect(ensureSubjectPath).toHaveBeenCalledWith(["Work", "AIPeak"]);
    expect(insertKeyedKnowledgeSources).toHaveBeenCalledWith(
      [
        { importKey: "work:aaaaaaaa", rawText: "A" },
        { importKey: "work:bbbbbbbb", rawText: "B" },
      ],
      "sub_a",
    );
    expect(result).toEqual({
      subjectId: "sub_a",
      subjectName: "AIPeak",
      subjectPath: "Work/AIPeak",
      createdSubjects: ["Work", "Work/AIPeak"],
      created: 1,
      alreadyPresent: 1,
      sourceIds: ["ks_1"],
    });
    expect(kickSourcesAfterAdd).toHaveBeenCalledTimes(1);
    expect(kickSourcesAfterAdd).toHaveBeenCalledWith(["ks_1"]);
  });

  it("should not kick when every key was already present", async () => {
    subjectOk();
    vi.mocked(insertKeyedKnowledgeSources).mockResolvedValue([]);

    const result = await submitKnowledgeToSubject({ subjectPath: "Work/AIPeak", notes: [note()] }, { scopes: ["*"] });

    expect(result).toMatchObject({ created: 0, alreadyPresent: 1, sourceIds: [] });
    expect(kickSourcesAfterAdd).not.toHaveBeenCalled();
  });

  it("should store one row when two notes in a batch share a key", async () => {
    subjectOk();
    vi.mocked(insertKeyedKnowledgeSources).mockResolvedValue([row("ks_1", "work:aaaaaaaa")]);

    const result = await submitKnowledgeToSubject(
      { subjectPath: "Work/AIPeak", notes: [note("work:aaaaaaaa", "first"), note("work:aaaaaaaa", "second")] },
      { scopes: ["*"] },
    );

    expect(insertKeyedKnowledgeSources).toHaveBeenCalledWith([{ importKey: "work:aaaaaaaa", rawText: "first" }], "sub_a");
    expect(result).toMatchObject({ created: 1, alreadyPresent: 1 });
  });
});
