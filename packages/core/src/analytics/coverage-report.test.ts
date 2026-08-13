import { describe, it, expect } from "vitest";
import type { Topic } from "@post-anki/shared";
import { buildCoverageReport } from "./coverage-report";

function topic(id: string, maturity: number): Topic {
  return {
    id,
    moduleId: "mod-1",
    title: "T",
    order: 1,
    priority: 0,
    included: true,
    selfGrade: null,
    depth: "working",
    learningStatus: "not_started",
    questions: [],
    progress: {
      status: maturity >= 80 ? "mastered" : maturity > 0 ? "in_progress" : "not_started",
      maturity,
      attempts: maturity > 0 ? 1 : 0,
      lastInteractedAt: null,
    },
    depthElectedAt: null,
  };
}

describe("buildCoverageReport", () => {
  it("attaches each Area's exact domainNodeProgress percent, the same figure the domain map page shows", () => {
    const areaNodes = [{ id: "react-effects", name: "Effects & Synchronization", subjectName: "React" }];
    const nodes = [{ id: "react-effects", parentId: "react" }];
    const curriculumTopics = [
      { domainNodeId: "react-effects", topics: [topic("t1", 100), topic("t2", 50)] },
    ];

    const result = buildCoverageReport(areaNodes, nodes, curriculumTopics);

    expect(result).toEqual([
      {
        domainNodeId: "react-effects",
        name: "Effects & Synchronization",
        subjectName: "React",
        percent: 75,
        status: "progress",
      },
    ]);
  });

  it("marks an Area with zero mapped curricula as a gap, distinctly from partial progress", () => {
    const areaNodes = [{ id: "react-other", name: "Other", subjectName: "React" }];

    const result = buildCoverageReport(areaNodes, [{ id: "react-other", parentId: "react" }], []);

    expect(result).toEqual([
      { domainNodeId: "react-other", name: "Other", subjectName: "React", percent: 0, status: "gap" },
    ]);
  });

  it("produces zero rows for a domain with no kind='area' nodes, rather than fabricating placeholders", () => {
    const result = buildCoverageReport([], [], []);

    expect(result).toEqual([]);
  });
});
