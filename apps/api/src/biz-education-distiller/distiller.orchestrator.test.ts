import { describe, expect, it, vi } from "vitest";

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { distillBizEducation, type DistillerDeps } from "./distiller.orchestrator.js";
import type { BizEducationRow } from "./biz-education.client.js";

function row(id: string, text: string): BizEducationRow {
  return { id, text, tags: ["PA"], createdTime: "2026-01-01T00:00:00.000Z" };
}

function buildDeps(overrides: Partial<DistillerDeps>): DistillerDeps {
  return {
    fetchRows: vi.fn().mockResolvedValue([]),
    listHierarchy: vi.fn().mockResolvedValue([]),
    classify: vi.fn(),
    insertFact: vi.fn().mockResolvedValue(undefined),
    insertInboxRow: vi.fn().mockResolvedValue(undefined),
    markSynced: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("distillBizEducation", () => {
  it("skips a row whose text contains a question", async () => {
    const deps = buildDeps({ fetchRows: vi.fn().mockResolvedValue([row("r1", "What is CAC?")]) });

    const result = await distillBizEducation(deps);

    expect(result.skipped).toEqual(["r1"]);
    expect(result.processed).toEqual([]);
    expect(deps.classify).not.toHaveBeenCalled();
  });

  it("saves a classified-fit row as a fact linked to its matched topic", async () => {
    const deps = buildDeps({
      fetchRows: vi.fn().mockResolvedValue([row("r2", "CAC is customer acquisition cost.")]),
      classify: vi.fn().mockResolvedValue({ matchedTopicId: "topic_1", suggestedPlacement: null }),
    });

    const result = await distillBizEducation(deps);

    expect(result.processed).toEqual(["r2"]);
    expect(deps.insertFact).toHaveBeenCalledWith(
      expect.objectContaining({ sourceRef: "notion:r2", topicId: "topic_1" }),
    );
    expect(deps.insertInboxRow).not.toHaveBeenCalled();
  });

  it("files a classified-non-fit row into the content inbox", async () => {
    const deps = buildDeps({
      fetchRows: vi.fn().mockResolvedValue([row("r3", "A new framework for pricing SaaS.")]),
      classify: vi
        .fn()
        .mockResolvedValue({ matchedTopicId: null, suggestedPlacement: "Under Pricing" }),
    });

    const result = await distillBizEducation(deps);

    expect(result.processed).toEqual(["r3"]);
    expect(deps.insertInboxRow).toHaveBeenCalledWith(
      expect.objectContaining({ sourceRef: "notion:r3", suggestedPlacement: "Under Pricing" }),
    );
    expect(deps.insertFact).not.toHaveBeenCalled();
  });

  it("isolates one row's failure from the rest of the batch", async () => {
    const deps = buildDeps({
      fetchRows: vi
        .fn()
        .mockResolvedValue([row("bad", "Will fail."), row("good", "Will succeed.")]),
      classify: vi
        .fn()
        .mockRejectedValueOnce(new Error("classifier down"))
        .mockResolvedValueOnce({ matchedTopicId: "topic_2", suggestedPlacement: null }),
    });

    const result = await distillBizEducation(deps);

    expect(result.failed).toEqual(["bad"]);
    expect(result.processed).toEqual(["good"]);
    expect(deps.insertFact).toHaveBeenCalledTimes(1);
  });

  it("marks synced only rows that were actually processed", async () => {
    const deps = buildDeps({
      fetchRows: vi
        .fn()
        .mockResolvedValue([row("q1", "Is this a question?"), row("r4", "A plain fact.")]),
      classify: vi.fn().mockResolvedValue({ matchedTopicId: "topic_3", suggestedPlacement: null }),
    });

    const result = await distillBizEducation(deps);

    expect(result.processed).toEqual(["r4"]);
    expect(deps.markSynced).toHaveBeenCalledTimes(1);
    expect(deps.markSynced).toHaveBeenCalledWith("r4");
  });

  it("isolates one row's mark-synced failure from the rest of the batch", async () => {
    const deps = buildDeps({
      fetchRows: vi.fn().mockResolvedValue([row("s1", "Fact one."), row("s2", "Fact two.")]),
      classify: vi.fn().mockResolvedValue({ matchedTopicId: "topic_4", suggestedPlacement: null }),
      markSynced: vi
        .fn()
        .mockRejectedValueOnce(new Error("notion write failed"))
        .mockResolvedValueOnce(undefined),
    });

    const result = await distillBizEducation(deps);

    expect(result.processed).toEqual(["s1", "s2"]);
    expect(result.markSyncedFailed).toEqual(["s1"]);
    expect(deps.markSynced).toHaveBeenCalledTimes(2);
  });
});
