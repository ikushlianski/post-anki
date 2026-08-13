import { describe, expect, it } from "vitest";
import { validateTaxonomyProposal, type SubSubjectCandidate } from "./validate-taxonomy-proposal.js";

const candidates: SubSubjectCandidate[] = [
  {
    subSubjectNodeId: "dnode_react",
    subSubjectName: "React",
    areas: [
      { id: "dnode_react_effects", name: "Effects & Synchronization" },
      { id: "dnode_react_other", name: "Other" },
    ],
  },
  {
    subSubjectNodeId: "dnode_aws",
    subSubjectName: "AWS",
    areas: [
      { id: "dnode_aws_identity", name: "Identity & Access" },
      { id: "dnode_aws_other", name: "Other" },
    ],
  },
];

describe("validateTaxonomyProposal", () => {
  describe("when the model names a real sub-subject and a real Area", () => {
    it("resolves both to the taxonomy's own node ids", () => {
      expect(
        validateTaxonomyProposal({
          candidates,
          pinnedSubSubjectNodeId: null,
          proposedSubSubjectName: "react",
          proposedAreaName: "effects & synchronization",
        }),
      ).toEqual({
        subSubjectNodeId: "dnode_react",
        areaId: "dnode_react_effects",
        areaName: "Effects & Synchronization",
      });
    });
  });

  describe("when the model invents an Area name that does not exist", () => {
    it("falls back to that sub-subject's own Other, never another sub-subject's", () => {
      const result = validateTaxonomyProposal({
        candidates,
        pinnedSubSubjectNodeId: null,
        proposedSubSubjectName: "AWS",
        proposedAreaName: "Agentic AI Security Fundamentals",
      });

      expect(result.areaId).toBe("dnode_aws_other");
      expect(result.subSubjectNodeId).toBe("dnode_aws");
    });

    it("does not leak the first Other in the list to an unrelated sub-subject", () => {
      const result = validateTaxonomyProposal({
        candidates,
        pinnedSubSubjectNodeId: null,
        proposedSubSubjectName: "React",
        proposedAreaName: "Totally Invented Area",
      });

      expect(result.areaId).toBe("dnode_react_other");
      expect(result.areaId).not.toBe("dnode_aws_other");
    });
  });

  describe("when the model invents a sub-subject that is not in the candidate list", () => {
    it("resolves nothing at all rather than guessing a placement", () => {
      expect(
        validateTaxonomyProposal({
          candidates,
          pinnedSubSubjectNodeId: null,
          proposedSubSubjectName: "Svelte",
          proposedAreaName: "Other",
        }),
      ).toEqual({ subSubjectNodeId: null, areaId: null, areaName: null });
    });
  });

  describe("when the capture pins a sub-subject explicitly", () => {
    it("uses the pinned node and ignores the model's own proposal", () => {
      const result = validateTaxonomyProposal({
        candidates,
        pinnedSubSubjectNodeId: "dnode_react",
        proposedSubSubjectName: "AWS",
        proposedAreaName: "Identity & Access",
      });

      expect(result.subSubjectNodeId).toBe("dnode_react");
      expect(result.areaId).toBe("dnode_react_other");
    });

    it("resolves nothing when the pinned node is not a real sub-subject of this subject", () => {
      expect(
        validateTaxonomyProposal({
          candidates,
          pinnedSubSubjectNodeId: "dnode_not_a_real_node",
          proposedSubSubjectName: "React",
          proposedAreaName: "Effects & Synchronization",
        }),
      ).toEqual({ subSubjectNodeId: null, areaId: null, areaName: null });
    });
  });

  describe("when the subject has no seeded sub-subjects at all", () => {
    it("resolves nothing instead of inventing a placement", () => {
      expect(
        validateTaxonomyProposal({
          candidates: [],
          pinnedSubSubjectNodeId: null,
          proposedSubSubjectName: "React",
          proposedAreaName: "Other",
        }),
      ).toEqual({ subSubjectNodeId: null, areaId: null, areaName: null });
    });
  });
});
