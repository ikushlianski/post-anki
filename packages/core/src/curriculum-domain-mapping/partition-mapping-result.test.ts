import { describe, it, expect } from "vitest";
import { partitionMappingResult } from "./partition-mapping-result";

// SCENARIO 1/6/7 (.planning/decouple-curricula-from-domain-nodes/scenarios.md)
// — partitionMappingResult() is the pure deriver that validates the mapping
// agent's raw structured output against the subject's REAL tree before any
// insert happens. This is the guard the red-team review flagged: an agent
// hallucinating a node id must never reach insertSuggestedMappings.

describe("partitionMappingResult", () => {
  it("keeps every matched node id that exists in the subject's real tree", () => {
    const result = partitionMappingResult(
      {
        matches: [
          { nodeId: "dnode-1", depth: "working" },
          { nodeId: "dnode-2", depth: "deep" },
        ],
        unmatchedTopics: [],
      },
      new Set(["dnode-1", "dnode-2", "dnode-3"]),
    );

    expect(result.matched).toEqual([
      { nodeId: "dnode-1", depth: "working" },
      { nodeId: "dnode-2", depth: "deep" },
    ]);
  });

  it("drops any AI-suggested node id not present in the subject's real tree, never inventing a placeholder", () => {
    const result = partitionMappingResult(
      {
        matches: [
          { nodeId: "dnode-1", depth: "working" },
          { nodeId: "dnode-hallucinated", depth: "deep" },
        ],
        unmatchedTopics: [],
      },
      new Set(["dnode-1"]),
    );

    expect(result.matched).toEqual([{ nodeId: "dnode-1", depth: "working" }]);
  });

  it("returns an empty matched list and empty unmatchedTopics when nothing was confidently placed anywhere (no confident match anywhere)", () => {
    const result = partitionMappingResult(
      { matches: [], unmatchedTopics: [] },
      new Set(["dnode-1"]),
    );

    expect(result).toEqual({ matched: [], unmatchedTopics: [] });
  });

  it("passes through unmatched topic titles untouched — these become domain_topic_suggestions rows, never a fabricated node", () => {
    const result = partitionMappingResult(
      { matches: [], unmatchedTopics: ["Quantum-Resistant Cryptography"] },
      new Set(["dnode-1"]),
    );

    expect(result.unmatchedTopics).toEqual(["Quantum-Resistant Cryptography"]);
  });

  it("drops a hallucinated match and keeps unmatched topics independently in the same call", () => {
    const result = partitionMappingResult(
      {
        matches: [{ nodeId: "ghost", depth: "awareness" }],
        unmatchedTopics: ["Edge AI Inference"],
      },
      new Set(["dnode-1"]),
    );

    expect(result).toEqual({ matched: [], unmatchedTopics: ["Edge AI Inference"] });
  });
});
