import { beforeEach, describe, expect, it, vi } from "vitest";

const updateKnowledgeBitBody = vi.fn();

vi.mock("./knowledge-bit.repo.js", () => ({
  updateKnowledgeBitBody: (...args: unknown[]) => updateKnowledgeBitBody(...args),
}));

const { editKnowledgeBit } = await import("./knowledge-bit-edit.service.js");

describe("editKnowledgeBit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns not_found when the repo reports no row was updated", async () => {
    updateKnowledgeBitBody.mockResolvedValue(false);

    const result = await editKnowledgeBit("missing", { body: "Revised body." });

    expect(result).toEqual({ error: "not_found" });
    expect(updateKnowledgeBitBody).toHaveBeenCalledWith("missing", "Revised body.");
  });

  it("returns ok when the repo updates the row", async () => {
    updateKnowledgeBitBody.mockResolvedValue(true);

    const result = await editKnowledgeBit("kb_1", { body: "Revised body." });

    expect(result).toEqual({ ok: true });
    expect(updateKnowledgeBitBody).toHaveBeenCalledWith("kb_1", "Revised body.");
  });
});
