import { describe, it, expect, vi, beforeEach } from "vitest";

// SCENARIO 6 (.planning/seed-knowledge-map/scenarios.md) — agent failure
// falls back to unplaced, never blocks curriculum creation. Mirrors the
// established mocked-agent orchestrator test shape in this codebase (see
// apps/api/src/practice/writing-check.orchestrator.test.ts): mock the whole
// mastra module's getAgent().generate, mock the repo layer so no real DB is
// touched, then assert resolveDomainPlacement()'s own return value never
// throws regardless of how the agent call misbehaves.
//
// RED right now because apps/api/src/domain-map/domain-placement.orchestrator.ts
// does not exist — the import below fails to resolve.

const mockAgentGenerate = vi.fn();

vi.mock("../mastra/mastra.js", () => ({
  AGENT_KEYS: { siblingDiscovery: "siblingDiscovery" },
  getMastra: () => ({ getAgent: () => ({ generate: mockAgentGenerate }) }),
}));

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// A small seeded-looking tree with a name that will never normalized-match
// the topic name used below ("Astro") — forces resolveDomainPlacement past
// path 1 (no explicit domainNodeId given) and path 2 (no exact match) and
// into path 3 (the agent call), which is the only path this scenario needs
// to exercise.
const domainMapRepoState = {
  nodes: [
    { id: "node_frontend", subjectId: "sub_1", parentId: null, name: "Frontend" },
    { id: "node_meta", subjectId: "sub_1", parentId: "node_frontend", name: "Meta-frameworks" },
  ],
};

vi.mock("./domain-map.repo.js", () => ({
  listDomainNodesForSubject: vi.fn(async (subjectId: string) =>
    domainMapRepoState.nodes.filter((node) => node.subjectId === subjectId),
  ),
  insertDomainNode: vi.fn(),
}));

import { resolveDomainPlacement } from "./domain-placement.orchestrator.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveDomainPlacement", () => {
  describe("when the sibling-discovery agent call rejects (network error)", () => {
    it("returns domainNodeId: null instead of throwing", async () => {
      mockAgentGenerate.mockRejectedValue(new Error("ECONNREFUSED"));

      await expect(
        resolveDomainPlacement({ subjectId: "sub_1", name: "Astro", domainNodeId: undefined }),
      ).resolves.toEqual({ domainNodeId: null });
    });
  });

  describe("when the agent resolves with a structurally invalid shape", () => {
    it("returns domainNodeId: null instead of throwing (siblingSuggestions over the max(8) cap)", async () => {
      mockAgentGenerate.mockResolvedValue({
        object: {
          parentNodePath: ["Frontend", "Meta-frameworks"],
          nodeName: "Astro",
          siblingSuggestions: Array.from({ length: 9 }, (_, index) => `Sibling ${index + 1}`),
        },
      });

      await expect(
        resolveDomainPlacement({ subjectId: "sub_1", name: "Astro", domainNodeId: undefined }),
      ).resolves.toEqual({ domainNodeId: null });
    });
  });
});
