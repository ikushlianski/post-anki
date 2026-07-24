import { describe, it, expect } from "vitest";
import {
  selectValidCandidates,
  partitionRegatherableCandidates,
  selectApprovedForCompile,
  type ExtractedCandidate,
  type RegatherableCandidateRow,
  type ReviewableCandidateRow,
} from "./lecture-rules.js";

describe("selectValidCandidates", () => {
  const CANDIDATE: ExtractedCandidate = {
    title: "Attention Is All You Need",
    url: "https://arxiv.org/abs/1706.03762",
    whySelected: "The original transformer paper, from named practitioners at Google Brain.",
  };

  it("keeps a candidate whose url is in the citation list", () => {
    const result = selectValidCandidates([CANDIDATE], [CANDIDATE.url]);

    expect(result).toEqual([CANDIDATE]);
  });

  it("drops a candidate whose url is not in the citation list", () => {
    const result = selectValidCandidates([CANDIDATE], ["https://openai.com/research/other"]);

    expect(result).toEqual([]);
  });

  it("drops only the invented candidate when others are valid", () => {
    const invented: ExtractedCandidate = {
      title: "Fabricated Source",
      url: "https://example.com/invented",
      whySelected: "Made up by the extraction agent.",
    };

    const result = selectValidCandidates([CANDIDATE, invented], [CANDIDATE.url]);

    expect(result).toEqual([CANDIDATE]);
  });

  it("returns an empty list when there are no candidates", () => {
    expect(selectValidCandidates([], ["https://example.com"])).toEqual([]);
  });

  it("returns an empty list when there are no citations", () => {
    expect(selectValidCandidates([CANDIDATE], [])).toEqual([]);
  });
});

describe("partitionRegatherableCandidates", () => {
  function row(id: string, reviewStatus: RegatherableCandidateRow["reviewStatus"]): RegatherableCandidateRow {
    return { id, reviewStatus };
  }

  it("puts pending rows in toDelete", () => {
    const pending = row("1", "pending");

    expect(partitionRegatherableCandidates([pending])).toEqual({
      toDelete: [pending],
      toKeep: [],
    });
  });

  it("puts rejected rows in toDelete", () => {
    const rejected = row("2", "rejected");

    expect(partitionRegatherableCandidates([rejected])).toEqual({
      toDelete: [rejected],
      toKeep: [],
    });
  });

  it("puts approved rows in toKeep, never toDelete", () => {
    const approved = row("3", "approved");

    expect(partitionRegatherableCandidates([approved])).toEqual({
      toDelete: [],
      toKeep: [approved],
    });
  });

  it("partitions a mix of statuses correctly", () => {
    const pending = row("1", "pending");
    const approved = row("2", "approved");
    const rejected = row("3", "rejected");

    expect(partitionRegatherableCandidates([pending, approved, rejected])).toEqual({
      toDelete: [pending, rejected],
      toKeep: [approved],
    });
  });

  it("returns empty partitions for no rows", () => {
    expect(partitionRegatherableCandidates([])).toEqual({ toDelete: [], toKeep: [] });
  });
});

describe("selectApprovedForCompile", () => {
  function row(id: string, reviewStatus: ReviewableCandidateRow["reviewStatus"]): ReviewableCandidateRow & { id: string } {
    return { id, reviewStatus };
  }

  it("selects only approved rows", () => {
    const pending = row("1", "pending");
    const approved = row("2", "approved");
    const rejected = row("3", "rejected");

    expect(selectApprovedForCompile([pending, approved, rejected])).toEqual([approved]);
  });

  it("returns an empty list when nothing is approved", () => {
    const pending = row("1", "pending");
    const rejected = row("2", "rejected");

    expect(selectApprovedForCompile([pending, rejected])).toEqual([]);
  });

  it("returns an empty list for no rows", () => {
    expect(selectApprovedForCompile([])).toEqual([]);
  });
});
