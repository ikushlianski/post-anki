import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./card-synthesis-mining-ledger.repo.js", () => ({
  markBitsExamined: vi.fn(async (ids: string[]) => ids.length),
}));

import { markBitsExamined } from "./card-synthesis-mining-ledger.repo.js";
import { markClusterExamined, markUnclusteredExamined } from "./card-synthesis-mining-marking.js";

const cluster = { bitIds: ["a", "b", "c"], overflowBitIds: ["d"] };
const bigCluster = {
  bitIds: Array.from({ length: 14 }, (_, i) => `n${i}`),
  overflowBitIds: ["tail1", "tail2"],
};

beforeEach(() => {
  vi.mocked(markBitsExamined).mockClear();
});

describe("markClusterExamined", () => {
  it.each(["synthesized", "not_chain", "duplicate_existing", "rejected_ungrounded", "failed"])(
    "should mark the cards shown to the model for a cluster finished as %s",
    async (outcome) => {
      await markClusterExamined("run1", "c1", cluster, outcome);

      expect(markBitsExamined).toHaveBeenCalledWith(["a", "b", "c"], "run1", "c1", outcome);
    },
  );

  it("should mark only the first 12 shown cards and leave the overflow tail for a later day", async () => {
    await markClusterExamined("run1", "c1", bigCluster, "not_chain");

    expect(markBitsExamined).toHaveBeenCalledWith(bigCluster.bitIds.slice(0, 12), "run1", "c1", "not_chain");
  });

  it.each(["skipped_cap", "skipped_breaker", "failed_retryable", "failed_budget"])(
    "should not mark cards of a cluster cut off or failed retryably by %s so they carry over to a later day",
    async (outcome) => {
      const marked = await markClusterExamined("run1", "c1", cluster, outcome);

      expect(marked).toBe(0);
      expect(markBitsExamined).not.toHaveBeenCalled();
    },
  );
});

describe("markUnclusteredExamined", () => {
  it("should mark lone and too-small-group cards as singleton with no cluster", async () => {
    await markUnclusteredExamined("run1", ["x", "y"]);

    expect(markBitsExamined).toHaveBeenCalledWith(["x", "y"], "run1", null, "singleton");
  });

  it("should write nothing when every card was clustered", async () => {
    await markUnclusteredExamined("run1", []);

    expect(markBitsExamined).toHaveBeenCalledWith([], "run1", null, "singleton");
  });
});
