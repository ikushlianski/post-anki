import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/client.js", () => ({ getDb: vi.fn() }));
vi.mock("../knowledge-bit/knowledge-bit-review-suspension.orchestrator.js", () => ({
  updateKnowledgeBitScheduleControls: vi.fn(),
}));

const { updateKnowledgeBitScheduleControls } = await import(
  "../knowledge-bit/knowledge-bit-review-suspension.orchestrator.js"
);
const { suspendCards, unsuspendCards } = await import("./suspend-cards.tool.js");

afterEach(() => {
  vi.resetAllMocks();
});

const auth = { scopes: ["cards:write"] };

describe("suspendCards", () => {
  it("should refuse without cards:write", async () => {
    expect(await suspendCards({ cardIds: ["kb1"] }, { scopes: [] })).toEqual({ error: "missing_scope" });
    expect(updateKnowledgeBitScheduleControls).not.toHaveBeenCalled();
  });

  it("should suspend found cards and list unknown or unapproved ones as skipped", async () => {
    vi.mocked(updateKnowledgeBitScheduleControls).mockImplementation(async (id) =>
      id === "kb1"
        ? ({ ok: true } as never)
        : { ok: false, error: id === "kb2" ? "not_found" : "not_approved" },
    );

    expect(await suspendCards({ cardIds: ["kb1", "kb2", "kb3"] }, auth)).toEqual({
      changed: ["kb1"],
      skipped: [
        { id: "kb2", reason: "not_found" },
        { id: "kb3", reason: "not_approved" },
      ],
    });
    expect(updateKnowledgeBitScheduleControls).toHaveBeenCalledWith("kb1", { suspended: true, tz: "UTC" });
  });
});

describe("unsuspendCards", () => {
  it("should put cards back into review", async () => {
    vi.mocked(updateKnowledgeBitScheduleControls).mockResolvedValue({ ok: true } as never);

    expect(await unsuspendCards({ cardIds: ["kb1"] }, auth)).toEqual({ changed: ["kb1"], skipped: [] });
    expect(updateKnowledgeBitScheduleControls).toHaveBeenCalledWith("kb1", { suspended: false, tz: "UTC" });
  });
});
