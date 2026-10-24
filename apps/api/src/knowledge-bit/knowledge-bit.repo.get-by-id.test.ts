import { describe, expect, it, vi } from "vitest";
import type { DbExecutor } from "../db/client.js";
import { getKnowledgeBitById } from "./knowledge-bit.repo.js";

function dbReturning(rows: unknown[]): DbExecutor {
  const chain = {
    select: vi.fn(),
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn().mockResolvedValue(rows),
  };

  chain.select.mockReturnValue(chain);
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);

  return chain as unknown as DbExecutor;
}

describe("getKnowledgeBitById", () => {
  it("should flag a bit created from AI web research as AI generated", async () => {
    const db = dbReturning([
      { id: "kb_1", body: "Fact.", approvalState: "approved", isAiGenerated: true },
    ]);

    const bit = await getKnowledgeBitById("kb_1", db);

    expect(bit?.isAiGenerated).toBe(true);
  });

  it("should report a learner-sourced bit as not AI generated", async () => {
    const db = dbReturning([
      { id: "kb_2", body: "Fact.", approvalState: "pending", isAiGenerated: false },
    ]);

    const bit = await getKnowledgeBitById("kb_2", db);

    expect(bit?.isAiGenerated).toBe(false);
  });

  it("should return null when the bit does not exist", async () => {
    expect(await getKnowledgeBitById("kb_x", dbReturning([]))).toBeNull();
  });
});
