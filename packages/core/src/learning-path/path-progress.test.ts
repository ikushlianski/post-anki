import { describe, expect, it } from "vitest";
import type { Topic } from "@post-anki/shared";
import { derivePathStepStatus, pathProgress } from "./path-progress";

function topic(id: string, status: Topic["progress"]["status"]): Topic {
  return {
    id,
    moduleId: "module_1",
    title: id,
    order: 0,
    priority: 0,
    included: true,
    selfGrade: null,
    depth: "working",
    learningStatus: "not_started",
    questions: [],
    progress: {
      status,
      maturity: status === "mastered" ? 90 : status === "in_progress" ? 40 : 0,
      attempts: 0,
      lastInteractedAt: null,
    },
    depthElectedAt: null,
  };
}

describe("derivePathStepStatus", () => {
  it("is not_started for a step with zero included topics, never done", () => {
    expect(derivePathStepStatus({ topicsIncluded: 0, topicsMastered: 0, percent: 0 })).toBe(
      "not_started",
    );
  });

  it("is done only when every included topic is mastered", () => {
    expect(derivePathStepStatus({ topicsIncluded: 3, topicsMastered: 3, percent: 90 })).toBe(
      "done",
    );
  });

  it("is in_progress when some but not all included topics are mastered", () => {
    expect(derivePathStepStatus({ topicsIncluded: 3, topicsMastered: 1, percent: 40 })).toBe(
      "in_progress",
    );
  });
});

describe("pathProgress", () => {
  const nodes = [
    { id: "react", parentId: null },
    { id: "react-area-a", parentId: "react" },
    { id: "react-area-b", parentId: "react" },
  ];

  it("reports a step with no mapped curriculum as not_started with zero topics — never a fabricated placeholder", () => {
    const result = pathProgress([{ domainNodeId: "react-area-a" }], nodes, []);

    expect(result.steps).toEqual([
      {
        domainNodeId: "react-area-a",
        progress: { topicsIncluded: 0, topicsMastered: 0, percent: 0 },
        status: "not_started",
      },
    ]);
    expect(result.overallStatus).toBe("not_started");
  });

  it("computes overallStatus as done only once every step reaches done", () => {
    const curriculumTopics = [
      { domainNodeId: "react-area-a", topics: [topic("t1", "mastered")] },
      { domainNodeId: "react-area-b", topics: [topic("t2", "in_progress")] },
    ];

    const inProgress = pathProgress(
      [{ domainNodeId: "react-area-a" }, { domainNodeId: "react-area-b" }],
      nodes,
      curriculumTopics,
    );

    expect(inProgress.overallStatus).toBe("in_progress");

    const allDone = pathProgress(
      [{ domainNodeId: "react-area-a" }, { domainNodeId: "react-area-b" }],
      nodes,
      [
        { domainNodeId: "react-area-a", topics: [topic("t1", "mastered")] },
        { domainNodeId: "react-area-b", topics: [topic("t2", "mastered")] },
      ],
    );

    expect(allDone.overallStatus).toBe("done");
  });

  it("never reports done from an all-empty path — an empty step blocks completion", () => {
    const result = pathProgress(
      [{ domainNodeId: "react-area-a" }, { domainNodeId: "react-area-b" }],
      nodes,
      [{ domainNodeId: "react-area-a", topics: [topic("t1", "mastered")] }],
    );

    expect(result.steps[1]!.status).toBe("not_started");
    expect(result.overallStatus).toBe("in_progress");
  });

  it("reads each step's real percent independently — no double-counting when two paths share a node (SCENARIO 11)", () => {
    const sharedCurriculumTopics = [
      { domainNodeId: "react-area-a", topics: [topic("t1", "mastered"), topic("t2", "in_progress")] },
    ];

    const pathOne = pathProgress([{ domainNodeId: "react-area-a" }], nodes, sharedCurriculumTopics);
    const pathTwo = pathProgress([{ domainNodeId: "react-area-a" }], nodes, sharedCurriculumTopics);

    expect(pathOne.steps[0]!.progress).toEqual({ topicsIncluded: 2, topicsMastered: 1, percent: 65 });
    expect(pathTwo.steps[0]!.progress).toEqual(pathOne.steps[0]!.progress);
  });

  it("rolls up a sub-subject-level step across its whole subtree, reusing domainNodeProgress unmodified", () => {
    const curriculumTopics = [
      { domainNodeId: "react-area-a", topics: [topic("t1", "mastered")] },
      { domainNodeId: "react-area-b", topics: [topic("t2", "mastered")] },
    ];

    const result = pathProgress([{ domainNodeId: "react" }], nodes, curriculumTopics);

    expect(result.steps[0]!.progress).toEqual({ topicsIncluded: 2, topicsMastered: 2, percent: 90 });
    expect(result.steps[0]!.status).toBe("done");
  });
});
