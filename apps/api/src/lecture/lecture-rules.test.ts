import { describe, it, expect } from "vitest";
import {
  buildCurriculumSourceCandidates,
  mergeCandidatesPreferringCurriculum,
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

describe("buildCurriculumSourceCandidates", () => {
  it("builds one candidate per citable url", () => {
    const result = buildCurriculumSourceCandidates([
      "https://example.com/a",
      "https://example.com/b",
    ]);

    expect(result).toEqual([
      {
        title: "Curriculum source: https://example.com/a",
        url: "https://example.com/a",
        whySelected: "Already part of this curriculum's own stored sources.",
      },
      {
        title: "Curriculum source: https://example.com/b",
        url: "https://example.com/b",
        whySelected: "Already part of this curriculum's own stored sources.",
      },
    ]);
  });

  it("caps at 6 candidates", () => {
    const urls = Array.from({ length: 10 }, (_, i) => `https://example.com/${i}`);

    expect(buildCurriculumSourceCandidates(urls)).toHaveLength(6);
  });

  it("returns an empty list for no citable urls", () => {
    expect(buildCurriculumSourceCandidates([])).toEqual([]);
  });
});

describe("mergeCandidatesPreferringCurriculum", () => {
  const curriculumCandidate: ExtractedCandidate = {
    title: "Curriculum source: https://example.com/shared",
    url: "https://example.com/shared",
    whySelected: "Already part of this curriculum's own stored sources.",
  };
  const webCandidate: ExtractedCandidate = {
    title: "Web source",
    url: "https://example.com/web-only",
    whySelected: "Found via web search.",
  };

  it("keeps curriculum candidates first, web candidates supplement", () => {
    const result = mergeCandidatesPreferringCurriculum([curriculumCandidate], [webCandidate]);

    expect(result).toEqual([curriculumCandidate, webCandidate]);
  });

  it("never lets a web candidate replace a curriculum candidate with the same url", () => {
    const duplicateFromWeb: ExtractedCandidate = {
      title: "A different, web-discovered title for the same url",
      url: curriculumCandidate.url,
      whySelected: "Found via web search.",
    };

    const result = mergeCandidatesPreferringCurriculum([curriculumCandidate], [duplicateFromWeb]);

    expect(result).toEqual([curriculumCandidate]);
  });

  it("returns only web candidates when there are no curriculum candidates", () => {
    expect(mergeCandidatesPreferringCurriculum([], [webCandidate])).toEqual([webCandidate]);
  });

  it("returns only curriculum candidates when there are no web candidates", () => {
    expect(mergeCandidatesPreferringCurriculum([curriculumCandidate], [])).toEqual([
      curriculumCandidate,
    ]);
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
